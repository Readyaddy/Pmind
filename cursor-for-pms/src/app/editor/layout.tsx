import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CursorChat from "@/components/CursorChat";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex h-screen bg-transparent transition-colors overflow-hidden p-6 gap-6">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative rounded-2xl glass-pane shadow-2xl">{children}</main>
      <CursorChat />
    </div>
  );
}
