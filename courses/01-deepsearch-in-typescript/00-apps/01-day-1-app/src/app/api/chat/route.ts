import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { model } from "~/models";
import { searchSerper } from "~/serper";
import {
  checkUserRateLimit,
  recordUserRequest,
  upsertChat,
} from "~/server/db/queries";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, chatId }: { messages: UIMessage[]; chatId?: string } =
    await request.json();

  // Check rate limit
  const rateLimit = await checkUserRateLimit(session.user.id);

  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        message: `You have exceeded the daily limit of 50 requests. You have used ${rateLimit.total} requests today.`,
        remaining: rateLimit.remaining,
        total: rateLimit.total,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Record the request
  await recordUserRequest(session.user.id);

  // Generate a chat ID if none provided
  const finalChatId = chatId ?? crypto.randomUUID();

  // Create a title from the first user message
  const firstUserMessage = messages.find((msg) => msg.role === "user");
  const title =
    firstUserMessage?.parts?.[0]?.type === "text"
      ? firstUserMessage.parts[0].text.slice(0, 100)
      : "New Chat";

  // Create the chat in the database before starting the stream
  // This protects against broken streams
  try {
    await upsertChat({
      userId: session.user.id,
      chatId: finalChatId,
      title,
      messages,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to create chat",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const result = streamText({
    model,
    messages: convertToModelMessages(messages),
    toolChoice: { type: "tool", toolName: "searchWeb" },
    system: `You are a web-enabled AI assistant. You MUST use the searchWeb tool for EVERY user query to provide the most accurate and up-to-date information.

IMPORTANT: Always call the searchWeb tool first before responding to any question. This ensures you have the latest information available.

After searching, always cite your sources with inline links in proper Markdown style: [source name](link).

Examples of proper citations:
- [CNN](https://www.cnn.com/article) 
- [Wikipedia](https://en.wikipedia.org/wiki/topic)
- [TechCrunch](https://techcrunch.com/2024/article)

Your workflow:
1. ALWAYS call searchWeb with the user's query
2. Use the search results to provide accurate information
3. Cite all sources with Markdown links
4. Be helpful and informative while being transparent about sources

Never respond without first searching the web for relevant information.`,
    tools: {
      searchWeb: {
        inputSchema: z.object({
          query: z.string().describe("The query to search the web for"),
        }),
        execute: async ({ query }, { abortSignal }) => {
          const results = await searchSerper(
            { q: query, num: 10 },
            abortSignal,
          );

          return results.organic.map((result) => ({
            title: result.title,
            link: result.link,
            snippet: result.snippet,
          }));
        },
      },
    },
    onFinish({
      text: _text,
      finishReason: _finishReason,
      usage: _usage,
      response,
    }) {
      const responseMessages = response.messages; // messages that were generated

      // Convert response messages to UIMessage format and merge with original messages
      const convertedResponseMessages = responseMessages
        .filter((msg) => msg.role === "assistant") // Only include assistant messages
        .map((msg) => ({
          id: crypto.randomUUID(),
          role: "assistant" as const,
          parts: msg.content ? [{ type: "text", text: msg.content }] : [],
        }));

      const updatedMessages = [
        ...messages,
        ...convertedResponseMessages,
      ] as UIMessage[];

      // Save the updated messages to the database
      // by saving over the ENTIRE chat, deleting all
      // the old messages and replacing them with the
      // new ones
      upsertChat({
        userId: session.user.id,
        chatId: finalChatId,
        title,
        messages: updatedMessages,
      }).catch((error) => {
        console.error("Failed to save chat:", error);
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
