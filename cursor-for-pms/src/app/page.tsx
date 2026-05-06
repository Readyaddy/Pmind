import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/projects");
  redirect("/sign-in");
}
