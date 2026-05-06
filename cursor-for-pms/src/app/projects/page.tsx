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
        <h2 className="font-serif text-2xl font-semibold text-black/80 dark:text-ivory mb-3">
          Welcome to PM Cursor
        </h2>
        <p className="text-sm text-black/50 dark:text-white/50 max-w-sm">
          Create a project in the sidebar to get started.
        </p>
      </div>
    </div>
  );
}
