import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { z } from "zod";
import { auth } from "~/server/auth";
import { model } from "~/models";
import { searchSerper } from "~/serper";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await request.json();

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
  });

  return result.toUIMessageStreamResponse();
}
