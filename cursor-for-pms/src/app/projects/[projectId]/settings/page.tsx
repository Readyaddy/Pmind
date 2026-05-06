"use client";

import { use } from "react";
import { Settings2 } from "lucide-react";
import IntegrationSettings from "@/components/IntegrationSettings";

export default function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  void projectId; // available for future per-project settings

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Settings2 size={20} className="text-amber-700 dark:text-amber" />
          <h1 className="text-[20px] font-semibold text-black dark:text-ivory">Settings</h1>
        </div>

        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-black/40 dark:text-white/40 mb-4">
            Integrations
          </h2>
          <IntegrationSettings />
        </section>
      </div>
    </div>
  );
}
