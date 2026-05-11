"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import { CheckCircle2, ArrowLeft } from "lucide-react";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
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
    comingSoon: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹1,500",
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
    comingSoon: false,
  },
  {
    id: "team",
    name: "Team",
    price: "₹2,999",
    period: "/month",
    features: [
      "Everything in Pro",
      "Up to 10 members",
      "Shared Product Brain",
      "Team knowledge base",
      "Admin controls",
    ],
    cta: "Coming Soon",
    disabled: true,
    highlight: false,
    comingSoon: true,
  },
];

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (resp: { error?: { description?: string } }) => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function BillingPage() {
  const { userId } = useCustomAuth();
  const router = useRouter();
  const [subscription, setSubscription] = useState<{ plan: string; status: string; current_period_end?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const API = process.env.NEXT_PUBLIC_API_URL;
  const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/billing/subscription`, {
      headers: { Authorization: `Bearer ${userId}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSubscription(data); })
      .catch(() => {});
  }, [userId, API]);

  // Step 1 + 2: Create order then open Razorpay modal
  const handleUpgrade = async (plan: "pro" | "team") => {
    if (!userId || !RAZORPAY_KEY) return;
    setLoading(true);
    setError(null);

    try {
      // Step 1 — create order on backend
      const orderRes = await fetch(`${API}/billing/create-order`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });
      if (!orderRes.ok) throw new Error("Could not create order");
      const { order_id, amount, currency } = await orderRes.json();

      // Load Razorpay checkout.js
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Razorpay failed to load — check your connection");

      const planLabel = plan === "team" ? "Team Plan — Shared AI Workspace" : "Pro Plan — Unlimited AI for PMs";

      // Step 2 — open checkout modal
      const options = {
        key: RAZORPAY_KEY,
        order_id,
        amount,
        currency,
        name: "PMind",
        description: planLabel,
        prefill: { name: "PMind User" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // Step 3 — verify signature on backend
          const verifyRes = await fetch(`${API}/billing/verify-payment`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${userId}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...response, plan }),
          });

          if (!verifyRes.ok) {
            setError("Payment verification failed. Please contact support.");
            setLoading(false);
            return;
          }

          setSubscription({ plan: "pro", status: "active" });
          router.replace("/billing?success=1");
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
        theme: { color: "#F59E0B" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        setError(`Payment failed: ${resp.error?.description ?? "Unknown error"}`);
        setLoading(false);
      });
      rzp.open();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel Pro? You'll revert to the Free plan immediately.")) return;
    if (!userId) return;
    setLoading(true);
    try {
      await fetch(`${API}/billing/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userId}` },
      });
      setSubscription({ plan: "free", status: "active" });
    } catch {}
    setLoading(false);
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

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400 text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 flex flex-col gap-5 relative ${
                plan.comingSoon
                  ? "border-black/8 dark:border-white/8 bg-white/40 dark:bg-white/[0.02] opacity-70"
                  : plan.highlight
                  ? "border-amber-400 dark:border-amber/60 bg-amber-50/50 dark:bg-amber/5 shadow-lg"
                  : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h2 className={`font-semibold ${plan.comingSoon ? "text-black/40 dark:text-white/30" : "text-black dark:text-ivory"}`}>
                    {plan.name}
                  </h2>
                  {plan.highlight && (
                    <span className="text-[10px] bg-amber-200 dark:bg-amber/20 text-amber-800 dark:text-amber px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                      Popular
                    </span>
                  )}
                  {plan.comingSoon && (
                    <span className="text-[10px] bg-black/6 dark:bg-white/8 text-black/40 dark:text-white/40 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide border border-black/8 dark:border-white/10">
                      Coming soon
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className={`text-2xl font-bold ${plan.comingSoon ? "text-black/30 dark:text-white/25" : "text-black dark:text-ivory"}`}>
                    {plan.price}
                  </span>
                  <span className="text-xs text-black/40 dark:text-white/40">{plan.period}</span>
                </div>
              </div>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className={`flex items-start gap-2 text-[13px] ${plan.comingSoon ? "text-black/35 dark:text-white/30" : "text-black/70 dark:text-white/70"}`}>
                    <CheckCircle2 size={13} className={`mt-0.5 flex-shrink-0 ${plan.comingSoon ? "text-black/20 dark:text-white/20" : "text-green-500"}`} />
                    {f}
                  </li>
                ))}
              </ul>

              {currentPlan === plan.id ? (
                <div className="text-center">
                  <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                    ✓ Current Plan
                  </span>
                  {plan.id !== "free" && subscription?.current_period_end && (
                    <p className="text-[11px] text-black/35 dark:text-white/30 mt-1.5">
                      Renews {new Date(subscription.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                  {plan.id !== "free" && (
                    <button
                      onClick={handleCancel}
                      disabled={loading}
                      className="block w-full mt-2 py-1 text-xs text-black/40 dark:text-white/40 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      Cancel subscription
                    </button>
                  )}
                </div>
              ) : plan.comingSoon ? (
                <button
                  disabled
                  className="py-2.5 rounded-xl text-sm font-medium bg-black/4 dark:bg-white/4 text-black/25 dark:text-white/25 cursor-not-allowed border border-dashed border-black/10 dark:border-white/10"
                >
                  Coming soon
                </button>
              ) : (
                <button
                  onClick={plan.disabled ? undefined : () => handleUpgrade(plan.id as "pro" | "team")}
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
          Secured by Razorpay. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
