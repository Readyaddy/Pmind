import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// /projects — redirect to the last active project or show welcome
export default async function ProjectsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Client-side redirect handled by Sidebar's useActiveProject store.
  // This page is only shown briefly; Sidebar will push to the right project.
  return (
    <div className="flex items-center justify-center h-full text-center px-8">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-black/20 dark:text-white/20 mb-4">
          PMind
        </p>
        <h2 className="font-serif text-3xl font-semibold text-black/80 dark:text-white/80 mb-3">
          Your AI-native PM workspace
        </h2>
        <p className="text-sm text-black/40 dark:text-white/40 max-w-xs mx-auto mb-6 leading-relaxed">
          Create a project in the sidebar, then press <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-xs">⌘K</kbd> anywhere in a document to generate PRDs, tickets, and more with AI.
        </p>
        <div className="flex items-center justify-center gap-1.5 text-xs text-black/25 dark:text-white/25">
          <span>←</span>
          <span>Click the <strong className="font-semibold text-amber-600 dark:text-amber">+</strong> in the sidebar to create your first project</span>
        </div>
      </div>
    </div>
  );
}
