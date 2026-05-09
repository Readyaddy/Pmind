"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { useClerk, useUser } from "@clerk/nextjs";
import { ArrowLeft, Zap, Crown, Users, LogOut } from "lucide-react";
import Link from "next/link";

const PLAN_META = {
  free:  { label:"Free",  color:"text-black/50 dark:text-white/40", bg:"bg-black/5 dark:bg-white/5",  icon:null },
  pro:   { label:"Pro",   color:"text-amber-700 dark:text-amber",    bg:"bg-amber-50 dark:bg-amber/10", icon:Crown },
  team:  { label:"Team",  color:"text-indigo-700 dark:text-indigo-400", bg:"bg-indigo-50 dark:bg-indigo-500/10", icon:Users },
};

export default function ProfilePage() {
  const { userId } = useCustomAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [plan, setPlan] = useState<"free" | "pro" | "team">("free");
  const [loading, setLoading] = useState(true);
  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/billing/subscription`, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.plan) setPlan(d.plan as "free" | "pro" | "team"); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, API]);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "PMind User";
  const initials = (user?.firstName?.[0] ?? email[0] ?? "P").toUpperCase();
  const meta = PLAN_META[plan] ?? PLAN_META.free;
  const PlanIcon = meta.icon;

  return (
    <div className="min-h-screen bg-[#FAF9F7] dark:bg-[#0A0A0A] px-6 py-12">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white mb-10 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <h1 className="text-2xl font-serif font-bold text-black/80 dark:text-white/80 mb-8">Account</h1>

        {/* Avatar + name */}
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/5 p-6 mb-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber flex items-center justify-center text-xl font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-black/80 dark:text-white/80 truncate">{fullName}</p>
            <p className="text-sm text-black/40 dark:text-white/40 truncate">{email}</p>
          </div>
        </div>

        {/* Plan */}
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/5 p-6 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30 mb-4">Subscription</p>
          {loading ? (
            <div className="h-8 bg-black/5 dark:bg-white/5 rounded-lg animate-pulse w-24" />
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full ${meta.bg} ${meta.color}`}>
                  {PlanIcon && <PlanIcon size={13} />}
                  {meta.label}
                </span>
                {plan !== "free" && (
                  <span className="text-xs text-black/30 dark:text-white/30">Active</span>
                )}
              </div>
              {plan === "free" ? (
                <Link
                  href="/billing"
                  className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber hover:underline"
                >
                  <Zap size={13} /> Upgrade
                </Link>
              ) : (
                <Link
                  href="/billing"
                  className="text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                >
                  Manage →
                </Link>
              )}
            </div>
          )}

          {plan === "free" && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber/5 border border-amber-100 dark:border-amber/10">
              <p className="text-xs text-amber-700 dark:text-amber/80 leading-relaxed">
                <strong>Free plan:</strong> 20 AI requests/day, 10 MB knowledge base.{" "}
                <Link href="/billing" className="font-semibold underline underline-offset-2">Upgrade to Pro</Link> for unlimited requests and 1 GB KB.
              </p>
            </div>
          )}
        </div>

        {/* Sign out */}
        <div className="rounded-2xl border border-black/8 dark:border-white/8 bg-white/60 dark:bg-white/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30 mb-4">Account Actions</p>
          <button
            onClick={() => signOut(() => router.push("/"))}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors font-medium"
          >
            <LogOut size={15} /> Sign out of PMind
          </button>
        </div>
      </div>
    </div>
  );
}
