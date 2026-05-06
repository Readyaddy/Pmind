import { auth as clerkAuth } from "@clerk/nextjs/server";

export async function auth() {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return { userId: "dev_user_123" };
  }
  return await clerkAuth();
}
