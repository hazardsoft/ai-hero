import { and, count, eq, gte, desc, asc } from "drizzle-orm";
import { db } from "./index";
import { userRequests, users, chats, messages } from "./schema";
import type { UIMessage } from "ai";

const DAILY_REQUEST_LIMIT = 50; // Adjust this number as needed

export async function checkUserRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  total: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId));

  // Admins bypass rate limiting
  if (user?.isAdmin) {
    return { allowed: true, remaining: -1, total: -1 };
  }

  const [requestCount] = await db
    .select({ count: count() })
    .from(userRequests)
    .where(
      and(eq(userRequests.userId, userId), gte(userRequests.createdAt, today)),
    );

  const total = Number(requestCount?.count ?? 0);
  const remaining = DAILY_REQUEST_LIMIT - total;
  const allowed = remaining > 0;

  return { allowed, remaining, total };
}

export async function recordUserRequest(userId: string): Promise<void> {
  await db.insert(userRequests).values({
    userId,
  });
}

export async function getUserRequestStats(userId: string): Promise<{
  today: number;
  total: number;
  isAdmin: boolean;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [user] = await db
    .select({ isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.id, userId));

  const [todayCount] = await db
    .select({ count: count() })
    .from(userRequests)
    .where(
      and(eq(userRequests.userId, userId), gte(userRequests.createdAt, today)),
    );

  const [totalCount] = await db
    .select({ count: count() })
    .from(userRequests)
    .where(eq(userRequests.userId, userId));

  return {
    today: Number(todayCount?.count ?? 0),
    total: Number(totalCount?.count ?? 0),
    isAdmin: user?.isAdmin ?? false,
  };
}

export async function upsertChat(opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: UIMessage[];
}): Promise<void> {
  const { userId, chatId, title, messages: messageList } = opts;

  // Check if chat exists and belongs to the user
  const existingChat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId)),
  });

  if (existingChat) {
    if (existingChat.userId !== userId) {
      throw new Error(
        `Chat with ID ${chatId} already exists under a different user`,
      );
    }

    // Chat exists, delete all existing messages and replace them
    await db.delete(messages).where(eq(messages.chatId, chatId));

    // Update the chat title and timestamp
    await db
      .update(chats)
      .set({
        title,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));
  } else {
    // Create new chat
    await db.insert(chats).values({
      id: chatId,
      userId,
      title,
    });
  }

  // Insert all messages
  const messageValues = messageList.map((message, index) => ({
    chatId,
    role: message.role,
    parts: message.parts,
    order: index,
  }));

  if (messageValues.length > 0) {
    await db.insert(messages).values(messageValues);
  }
}

export const getChat = async (chatId: string, userId: string) => {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      messages: {
        orderBy: asc(messages.order),
      },
    },
  });

  return chat ?? null;
};

export const getChats = async (userId: string) => {
  const userChats = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.updatedAt),
  });
  return userChats;
};
