"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { CheckCircle2, ArrowLeft } from "lucide-react";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/month",
    features: [
      "20 AI requests / day",
      "Unlimited projects",
      "Knowledge base (10 MB)",
      "Jira & Linear export",
      "All PM templates",
    ],
    cta: "Current Plan",
    disabled: true,
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    features: [
      "Unlimited AI requests",
      "Unlimited projects",
      "Knowledge base (1 GB)",
      "Multimodal UI review",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    disabled: false,
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    price: "$79",
    period: "/month",
    features: [
      "Everything in Pro",
      "Up to 10 members",
      "Shared Product Brain",
      "Team knowledge base",
      "Admin controls",
    ],
    cta: "Upgrade to Team",
    disabled: false,
    highlight: false,
  },
];

export default function BillingPage() {
  const { userId } = useCustomAuth();
  const router = useRouter();
  const [subscription, setSubscription] = useState<{ plan: string; status: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const API = process.env.NEXT_PUBLIC_API_URL;

  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/billing/subscription`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSubscription(data); })
      .catch(() => {});
  }, [userId, API]);

  const handleUpgrade = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userId}` },
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/billing/portal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userId}` },
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  const currentPlan = subscription?.plan ?? "free";

  return (
    <div className="min-h-screen bg-[#FAF9F7] dark:bg-[#0A0A0A] px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white mb-10 transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="text-center mb-12">
          <h1 className="text-3xl font-serif font-bold text-black/80 dark:text-white/80 mb-2">
            Simple, honest pricing
          </h1>
          <p className="text-sm text-black/50 dark:text-white/50">
            Upgrade to unlock unlimited AI and team collaboration features.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col gap-5 ${
                plan.highlight
                  ? "border-amber-400 dark:border-amber/60 bg-amber-50/50 dark:bg-amber/5 shadow-lg"
                  : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-semibold text-black dark:text-ivory">{plan.name}</h2>
                  {plan.highlight && (
                    <span className="text-[10px] bg-amber-200 dark:bg-amber/20 text-amber-800 dark:text-amber px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                      Popular
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-2xl font-bold text-black dark:text-ivory">{plan.price}</span>
                  <span className="text-xs text-black/40 dark:text-white/40">{plan.period}</span>
                </div>
              </div>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-black/70 dark:text-white/70">
                    <CheckCircle2 size={13} className="text-green-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {currentPlan === plan.id ? (
                <div className="text-center">
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                    ✓ Current Plan
                  </span>
                  {plan.id !== "free" && (
                    <button
                      onClick={handleManage}
                      disabled={loading}
                      className="block w-full mt-2 py-1 text-xs text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors"
                    >
                      Manage subscription →
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={plan.disabled ? undefined : handleUpgrade}
                  disabled={plan.disabled || loading}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                    plan.highlight
                      ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                      : plan.disabled
                      ? "bg-black/5 dark:bg-white/5 text-black/30 dark:text-white/30 cursor-default"
                      : "bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/90"
                  }`}
                >
                  {loading ? "…" : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-[11px] text-black/30 dark:text-white/30 mt-8">
          All plans include a 14-day free trial. No credit card required for Free.
          Cancel anytime.
        </p>
      </div>
    </div>
  );
}
