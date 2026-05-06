import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CursorChat from "@/components/CursorChat";
import ProjectsShortcutWrapper from "@/components/ProjectsShortcutWrapper";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <ProjectsShortcutWrapper>
      <div className="flex h-screen bg-transparent transition-colors overflow-hidden p-6 gap-6">
        <Sidebar />
        <main className="flex-1 overflow-hidden relative rounded-2xl glass-pane shadow-2xl">
          {children}
        </main>
        <CursorChat />
      </div>
    </ProjectsShortcutWrapper>
  );
}
