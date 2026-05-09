import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LandingPage from "@/components/LandingPage";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/projects");
  return <LandingPage />;
}
