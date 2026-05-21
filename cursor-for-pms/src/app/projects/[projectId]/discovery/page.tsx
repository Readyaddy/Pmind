"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import {
  ChevronLeft, ChevronDown, RefreshCw, ArrowUpRight,
  Bookmark, Trash2, CheckCircle2, Loader2,
} from "lucide-react";

interface Theme {
  id: string;
  name: string;
  description: string | null;
  insight_count: number;
  summary: string | null;
}

interface Insight {
  id: string;
  quote: string;
  paraphrase: string | null;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  severity: number;
  persona: string | null;
  themes: string[];
  knowledge_documents?: { filename: string } | null;
}

interface Opportunity {
  id: string;
  title: string;
  problem: string;
  proposed_solution: string | null;
  evidence_insight_ids: string[];
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  rice_score: number | null;
  risks: string | null;
  status: "proposed" | "shortlisted" | "discarded" | "committed";
  created_at: string;
}

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-500/70",
  negative: "bg-rose-500/70",
  mixed:    "bg-amber-500/70",
  neutral:  "bg-black/25 dark:bg-white/25",
};

const STATUS_OPTIONS: { value: Opportunity["status"]; label: string; icon: React.ElementType }[] = [
  { value: "shortlisted", label: "Shortlist", icon: Bookmark },
  { value: "committed",   label: "Commit",    icon: CheckCircle2 },
  { value: "discarded",   label: "Discard",   icon: Trash2 },
];

export default function DiscoveryPage() {
  const params = useParams();
  const projectId = params?.projectId as string;
  const router = useRouter();
  const { userId } = useCustomAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [allInsightsById, setAllInsightsById] = useState<Record<string, Insight>>({});
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [expandedOppId, setExpandedOppId] = useState<string | null>(null);
  const [oppFilter, setOppFilter] = useState<"inbox" | "shortlisted" | "committed" | "discarded">("inbox");
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);

  const authHeaders = useMemo(
    () => (userId ? { Authorization: `Bearer ${userId}` } : undefined),
    [userId]
  );

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadThemes = useCallback(async () => {
    if (!userId || !projectId) return;
    setLoadingThemes(true);
    try {
      const res = await fetch(`${API}/discovery/themes?project_id=${projectId}`, { headers: authHeaders });
      if (res.ok) {
        const data: Theme[] = await res.json();
        setThemes(data);
        if (data.length && !activeThemeId) setActiveThemeId(data[0].id);
      }
    } finally { setLoadingThemes(false); }
  }, [API, projectId, userId, authHeaders, activeThemeId]);

  const loadInsights = useCallback(async (themeId: string | null) => {
    if (!userId || !projectId) return;
    setLoadingInsights(true);
    try {
      const p = new URLSearchParams({ project_id: projectId, limit: "50" });
      if (themeId) p.set("theme_id", themeId);
      const res = await fetch(`${API}/discovery/insights?${p}`, { headers: authHeaders });
      if (res.ok) setInsights(await res.json());
    } finally { setLoadingInsights(false); }
  }, [API, projectId, userId, authHeaders]);

  const loadOpportunities = useCallback(async () => {
    if (!userId || !projectId) return;
    setLoadingOpps(true);
    try {
      const res = await fetch(`${API}/discovery/opportunities?project_id=${projectId}`, { headers: authHeaders });
      if (res.ok) setOpportunities(await res.json());
    } finally { setLoadingOpps(false); }
  }, [API, projectId, userId, authHeaders]);

  const loadAllInsights = useCallback(async () => {
    if (!userId || !projectId) return;
    try {
      const res = await fetch(`${API}/discovery/insights?project_id=${projectId}&limit=1000`, { headers: authHeaders });
      if (res.ok) {
        const data: Insight[] = await res.json();
        const map: Record<string, Insight> = {};
        for (const ins of data) map[ins.id] = ins;
        setAllInsightsById(map);
      }
    } catch { /* ignore */ }
    setLoadingAll(false);
  }, [API, projectId, userId, authHeaders]);

  useEffect(() => { void loadThemes(); }, [loadThemes]);
  useEffect(() => { void loadOpportunities(); }, [loadOpportunities]);
  useEffect(() => { void loadInsights(activeThemeId); }, [loadInsights, activeThemeId]);
  useEffect(() => { void loadAllInsights(); }, [loadAllInsights]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateStatus = async (oppId: string, status: Opportunity["status"]) => {
    setOpportunities(prev => prev.map(o => o.id === oppId ? { ...o, status } : o));
    await fetch(`${API}/discovery/opportunities/${oppId}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const promote = async (opp: Opportunity) => {
    const name = window.prompt("Feature name?", opp.title);
    if (!name) return;
    const res = await fetch(`${API}/discovery/features`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, name, summary: opp.problem, opportunity_ids: [opp.id] }),
    });
    if (res.ok) await loadOpportunities();
  };

  // ── Derived counts ─────────────────────────────────────────────────────────
  const totalInsights = Object.keys(allInsightsById).length;
  const activeOpps = opportunities.filter(o => o.status !== "discarded").length;
  const activeTheme = themes.find(t => t.id === activeThemeId);
  const loading = loadingAll || loadingThemes || loadingOpps;

  // Counts per filter — used in the tabs
  const oppCounts = useMemo(() => ({
    inbox:       opportunities.filter(o => o.status === "proposed").length,
    shortlisted: opportunities.filter(o => o.status === "shortlisted").length,
    committed:   opportunities.filter(o => o.status === "committed").length,
    discarded:   opportunities.filter(o => o.status === "discarded").length,
  }), [opportunities]);

  // The filtered+sorted list the user sees. Shortlist gets a guaranteed
  // top-of-list position when on the inbox tab — it's the "queue."
  const visibleOpportunities = useMemo(() => {
    if (oppFilter === "shortlisted") return opportunities.filter(o => o.status === "shortlisted");
    if (oppFilter === "committed")   return opportunities.filter(o => o.status === "committed");
    if (oppFilter === "discarded")   return opportunities.filter(o => o.status === "discarded");
    // inbox = proposed + shortlisted, shortlisted first
    const shortlisted = opportunities.filter(o => o.status === "shortlisted");
    const proposed    = opportunities.filter(o => o.status === "proposed");
    return [...shortlisted, ...proposed];
  }, [opportunities, oppFilter]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1000px] mx-auto px-10 py-10">

        {/* ════ HEADER — compact, single row ═════════════════════════════ */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="mono-meta flex items-center gap-1.5 hover:text-amber-700 dark:hover:text-amber transition-colors"
          >
            <ChevronLeft size={11} strokeWidth={2.5} />
            PROJECT
          </button>
          <h1
            className="editorial-h1 flex-1 text-center"
            style={{ fontSize: "20px" }}
          >
            Discovery
          </h1>
          <button
            onClick={() => { void loadThemes(); void loadOpportunities(); void loadInsights(activeThemeId); void loadAllInsights(); }}
            className="mono-meta flex items-center gap-1.5 hover:text-amber-700 dark:hover:text-amber transition-colors"
            title="Refresh"
          >
            <RefreshCw size={10} strokeWidth={2.5} className={loading ? "animate-spin" : ""} />
            REFRESH
          </button>
        </div>

        {/* Inline stat strip — tight, not a hero block */}
        <div className="flex items-baseline gap-8 hairline-t hairline-b py-4 mb-12 mono-meta flex-wrap">
          <span><span className="text-black/80 dark:text-white/85 text-[13px] font-semibold mr-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>{totalInsights}</span> INSIGHTS</span>
          <span className="opacity-30">·</span>
          <span><span className="text-black/80 dark:text-white/85 text-[13px] font-semibold mr-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>{themes.length}</span> THEMES</span>
          <span className="opacity-30">·</span>
          <span><span className="text-black/80 dark:text-white/85 text-[13px] font-semibold mr-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>{activeOpps}</span> ACTIVE</span>
          <span className="opacity-30">·</span>
          <span><span className="text-black/80 dark:text-white/85 text-[13px] font-semibold mr-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>{opportunities.filter(o => o.status === "committed").length}</span> COMMITTED</span>
        </div>

        {/* ════ OPPORTUNITIES — top, because actionable ═════════════════ */}
        {opportunities.length > 0 ? (
          <section className="mb-20">
            <div className="flex items-baseline justify-between mb-4">
              <span className="editorial-eyebrow">— Opportunities</span>
              <span className="mono-meta">
                Ask the agent: <span className="text-amber-700 dark:text-amber">&quot;what should we build next?&quot;</span>
              </span>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 hairline-b mb-6">
              {([
                ["inbox",       "Inbox",       oppCounts.inbox + oppCounts.shortlisted],
                ["shortlisted", "Shortlist",   oppCounts.shortlisted],
                ["committed",   "Committed",   oppCounts.committed],
                ["discarded",   "Discarded",   oppCounts.discarded],
              ] as const).map(([value, label, count]) => {
                const active = oppFilter === value;
                return (
                  <button
                    key={value}
                    onClick={() => setOppFilter(value)}
                    className={`flex items-baseline gap-2 px-3 py-2.5 -mb-px text-[12px] font-semibold uppercase tracking-[0.12em] border-b-2 transition-colors ${
                      active
                        ? "border-amber-500 text-amber-800 dark:text-amber"
                        : "border-transparent text-black/40 dark:text-white/35 hover:text-black/70 dark:hover:text-white/70"
                    }`}
                  >
                    {label}
                    <span className={`mono-meta ${active ? "text-amber-700 dark:text-amber" : ""}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {visibleOpportunities.length === 0 && (
              <p className="text-[13px] text-black/45 dark:text-white/40 py-6">
                Nothing in {oppFilter}.
              </p>
            )}

            <div className="space-y-8">
              {visibleOpportunities.map((opp, idx) => {
                const expanded = expandedOppId === opp.id;
                const discarded = opp.status === "discarded";
                return (
                  <article
                    key={opp.id}
                    className={`hairline-t pt-8 ${discarded ? "opacity-40" : ""}`}
                  >
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-6 mb-3">
                      <div className="flex items-baseline gap-4 flex-1 min-w-0">
                        <span className="mono-meta text-[20px] leading-none mt-0.5 shrink-0" style={{ letterSpacing: "0.02em" }}>
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <h3 className="editorial-h2" style={{ fontSize: "22px" }}>{opp.title}</h3>
                      </div>

                      {/* RICE */}
                      {opp.rice_score != null && (
                        <div className="text-right shrink-0">
                          <div className="text-amber-700 dark:text-amber font-semibold leading-none" style={{ fontFamily: "var(--font-playfair), serif", fontSize: "26px", fontVariantNumeric: "tabular-nums" }}>
                            {opp.rice_score.toFixed(1)}
                          </div>
                          <div className="mono-meta text-[9.5px] mt-1" style={{ letterSpacing: "0.18em" }}>RICE</div>
                        </div>
                      )}
                    </div>

                    <p className="text-[14.5px] leading-relaxed text-black/75 dark:text-white/70 max-w-[68ch] mb-3">{opp.problem}</p>

                    {opp.proposed_solution && (
                      <p className="text-[13.5px] leading-relaxed text-black/60 dark:text-white/55 max-w-[68ch] mb-3">
                        <span className="editorial-eyebrow mr-2" style={{ fontSize: "9.5px" }}>Direction</span>
                        {opp.proposed_solution}
                      </p>
                    )}

                    {(opp.reach != null || opp.impact != null || opp.confidence != null || opp.effort != null) && (
                      <div className="flex items-center gap-5 mb-3 mono-meta">
                        {opp.reach != null && <span>R <span className="text-black/80 dark:text-white/85">{opp.reach}</span></span>}
                        {opp.impact != null && <span>I <span className="text-black/80 dark:text-white/85">{opp.impact}</span></span>}
                        {opp.confidence != null && <span>C <span className="text-black/80 dark:text-white/85">{opp.confidence}</span></span>}
                        {opp.effort != null && <span>E <span className="text-black/80 dark:text-white/85">{opp.effort}</span></span>}
                      </div>
                    )}

                    {opp.risks && (
                      <p className="text-[12.5px] text-rose-700 dark:text-rose-400 mb-3 max-w-[68ch] leading-relaxed">
                        <span className="editorial-eyebrow mr-2" style={{ color: "currentColor", opacity: 0.7, fontSize: "9.5px" }}>Risk</span>
                        {opp.risks}
                      </p>
                    )}

                    {/* Evidence toggle */}
                    {opp.evidence_insight_ids.length > 0 && (
                      <button
                        onClick={() => setExpandedOppId(expanded ? null : opp.id)}
                        className="editorial-eyebrow flex items-center gap-1.5 hover:text-amber-900 dark:hover:text-amber transition-colors mb-3"
                        style={{ fontSize: "9.5px" }}
                      >
                        <ChevronDown size={9} strokeWidth={2.5} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                        {opp.evidence_insight_ids.length} {opp.evidence_insight_ids.length === 1 ? "QUOTE" : "QUOTES"}
                      </button>
                    )}

                    {expanded && (
                      <div className="space-y-5 mb-4 max-w-[68ch]">
                        {Array.from(new Set(opp.evidence_insight_ids)).map((insId, i) => {
                          const ins = allInsightsById[insId];
                          if (!ins) {
                            return <p key={`${insId}-${i}`} className="mono-meta">· (insight no longer available)</p>;
                          }
                          return (
                            <figure key={`${insId}-${i}`}>
                              <p className="pull-quote" style={{ fontSize: "14.5px" }}>{ins.quote}</p>
                              <figcaption className="pull-quote-attr flex items-center gap-2 flex-wrap">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${SENTIMENT_DOT[ins.sentiment] || ""}`} />
                                {ins.persona || "Anonymous"}
                                <span className="opacity-50">·</span>
                                <span>{ins.knowledge_documents?.filename || "Source"}</span>
                                <span className="opacity-50">·</span>
                                <span>SEV {ins.severity}</span>
                              </figcaption>
                            </figure>
                          );
                        })}
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-2 mt-4">
                      {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => {
                        const isActive = opp.status === value;
                        return (
                          <button
                            key={value}
                            onClick={() => void updateStatus(opp.id, isActive ? "proposed" : value)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                              isActive
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber ring-1 ring-amber-500/30"
                                : "text-black/40 dark:text-white/35 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                            title={label}
                          >
                            <Icon size={10} strokeWidth={2.2} />
                            {isActive && <span className="font-mono normal-case tracking-wide">{label}d</span>}
                          </button>
                        );
                      })}

                      <span className="flex-1" />

                      <button
                        onClick={() => void promote(opp)}
                        disabled={discarded}
                        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-1.5 rounded-md text-amber-800 dark:text-amber hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Promote
                        <ArrowUpRight size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : !loadingOpps && (
          <div className="hairline rounded-lg px-8 py-12 text-center mb-20">
            <p className="editorial-h2 mb-2" style={{ fontSize: "18px" }}>No opportunities yet.</p>
            <p className="text-[13.5px] text-black/55 dark:text-white/50 max-w-[44ch] mx-auto leading-relaxed">
              In the chat, ask the Opportunity agent
              <span className="text-amber-700 dark:text-amber"> &quot;what should we build next?&quot; </span>
              — it&apos;ll mine your themes and propose three RICE-scored opportunities.
            </p>
          </div>
        )}

        {/* ════ THEMES + INSIGHTS — exploration below ═══════════════════ */}
        <div className="flex items-baseline justify-between mb-6">
          <span className="editorial-eyebrow">— Evidence</span>
          <span className="mono-meta">Cluster of {themes.length} theme{themes.length === 1 ? "" : "s"}</span>
        </div>

        <div className="grid grid-cols-12 gap-10 mb-12">

          {/* Themes — typographic list, no cards */}
          <div className="col-span-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="editorial-h2" style={{ fontSize: "15px" }}>Themes</h2>
              <span className="mono-meta">{themes.length}</span>
            </div>

            {loadingThemes ? (
              <div className="mono-meta py-6"><Loader2 size={12} className="animate-spin inline mr-2" />LOADING</div>
            ) : themes.length === 0 ? (
              <p className="editorial-lead text-[14px]">
                No themes yet. Upload interviews, support tickets, or surveys to the knowledge base — insights cluster automatically.
              </p>
            ) : (
              <div>
                {themes.map((t, i) => {
                  const active = activeThemeId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveThemeId(t.id)}
                      className={`group w-full text-left py-3.5 ${i === 0 ? "" : "hairline-t"} transition-colors`}
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span
                          className={`editorial-h2 transition-colors ${
                            active
                              ? "text-amber-700 dark:text-amber"
                              : "group-hover:text-amber-700 dark:group-hover:text-amber"
                          }`}
                          style={{ fontSize: "20px", fontWeight: active ? 600 : 500 }}
                        >
                          {t.name}
                        </span>
                        <span className={`mono-meta shrink-0 ${active ? "text-amber-700 dark:text-amber" : ""}`}>
                          {String(t.insight_count).padStart(2, "0")}
                        </span>
                      </div>
                      {t.summary && (
                        <p className="text-[13px] text-black/45 dark:text-white/40 mt-1 leading-snug line-clamp-2">
                          {t.summary}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Insights — pull-quote treatment */}
          <div className="col-span-7">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="editorial-h2" style={{ fontSize: "15px" }}>
                {activeTheme ? activeTheme.name : "Quotes"}
              </h2>
              <span className="mono-meta">{insights.length} QUOTES</span>
            </div>

            {loadingInsights ? (
              <div className="mono-meta py-6"><Loader2 size={12} className="animate-spin inline mr-2" />LOADING</div>
            ) : insights.length === 0 ? (
              <p className="editorial-lead text-[14px]">Nothing in this theme.</p>
            ) : (
              <div className="space-y-7">
                {insights.slice(0, 12).map(ins => (
                  <figure key={ins.id}>
                    <p className="pull-quote">{ins.quote}</p>
                    <figcaption className="pull-quote-attr flex items-center gap-2">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${SENTIMENT_DOT[ins.sentiment] || ""}`} />
                      {ins.persona || "Anonymous"}
                      <span className="opacity-50">·</span>
                      <span>{ins.knowledge_documents?.filename || "Source"}</span>
                      <span className="opacity-50">·</span>
                      <span>SEV {ins.severity}</span>
                    </figcaption>
                  </figure>
                ))}
                {insights.length > 12 && (
                  <p className="mono-meta pt-2">+ {insights.length - 12} MORE</p>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
