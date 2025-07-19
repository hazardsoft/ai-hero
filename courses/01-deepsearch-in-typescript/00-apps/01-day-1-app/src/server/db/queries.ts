import { and, count, eq, gte } from "drizzle-orm";
import { db } from "./index";
import { userRequests, users } from "./schema";

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
