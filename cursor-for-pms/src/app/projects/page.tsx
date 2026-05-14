import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ProjectsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Sidebar auto-redirects to the active project once projects load.
  // This screen is shown only for the brief async fetch window.
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce [animation-delay:160ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce [animation-delay:320ms]" />
        </div>
        <p className="text-[11px] font-mono text-black/25 dark:text-white/25 tracking-widest uppercase">
          Loading…
        </p>
      </div>
    </div>
  );
}
