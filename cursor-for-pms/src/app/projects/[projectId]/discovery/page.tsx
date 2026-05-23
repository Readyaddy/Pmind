"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCustomAuth } from "@/hooks/useCustomAuth";
import {
  ChevronLeft, ChevronDown, RefreshCw, ArrowUpRight,
  Bookmark, Trash2, CheckCircle2, Loader2, Sparkles,
  MessageSquare, TrendingUp,
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

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "bg-emerald-400",
  negative: "bg-rose-400",
  mixed:    "bg-amber-400",
  neutral:  "bg-black/20 dark:bg-white/20",
};

const STATUS_OPTIONS: { value: Opportunity["status"]; label: string; icon: React.ElementType }[] = [
  { value: "shortlisted", label: "Shortlist",  icon: Bookmark },
  { value: "committed",   label: "Commit",     icon: CheckCircle2 },
  { value: "discarded",   label: "Discard",    icon: Trash2 },
];

export default function DiscoveryPage() {
  const params    = useParams();
  const projectId = params?.projectId as string;
  const router    = useRouter();
  const { userId } = useCustomAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [themes,         setThemes]         = useState<Theme[]>([]);
  const [activeThemeId,  setActiveThemeId]  = useState<string | null>(null);
  const [insights,       setInsights]       = useState<Insight[]>([]);
  const [allInsightsById,setAllInsightsById]= useState<Record<string, Insight>>({});
  const [opportunities,  setOpportunities]  = useState<Opportunity[]>([]);
  const [expandedOppId,  setExpandedOppId]  = useState<string | null>(null);
  const [oppFilter,      setOppFilter]      = useState<"inbox"|"shortlisted"|"committed"|"discarded">("inbox");
  const [loadingThemes,  setLoadingThemes]  = useState(true);
  const [loadingInsights,setLoadingInsights]= useState(false);
  const [loadingOpps,    setLoadingOpps]    = useState(true);
  const [loadingAll,     setLoadingAll]     = useState(true);

  const authHeaders = useMemo(
    () => (userId ? { Authorization: `Bearer ${userId}` } : undefined),
    [userId],
  );

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

  useEffect(() => { void loadThemes(); },                        [loadThemes]);
  useEffect(() => { void loadOpportunities(); },                 [loadOpportunities]);
  useEffect(() => { void loadInsights(activeThemeId); },         [loadInsights, activeThemeId]);
  useEffect(() => { void loadAllInsights(); },                   [loadAllInsights]);

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

  const loading = loadingAll || loadingThemes || loadingOpps;
  const activeTheme = themes.find(t => t.id === activeThemeId);

  const oppCounts = useMemo(() => ({
    inbox:       opportunities.filter(o => o.status === "proposed").length,
    shortlisted: opportunities.filter(o => o.status === "shortlisted").length,
    committed:   opportunities.filter(o => o.status === "committed").length,
    discarded:   opportunities.filter(o => o.status === "discarded").length,
  }), [opportunities]);

  const visibleOpportunities = useMemo(() => {
    if (oppFilter === "shortlisted") return opportunities.filter(o => o.status === "shortlisted");
    if (oppFilter === "committed")   return opportunities.filter(o => o.status === "committed");
    if (oppFilter === "discarded")   return opportunities.filter(o => o.status === "discarded");
    return [
      ...opportunities.filter(o => o.status === "shortlisted"),
      ...opportunities.filter(o => o.status === "proposed"),
    ];
  }, [opportunities, oppFilter]);

  return (
    <div className="h-full overflow-y-auto thin-scroll">
      <div className="px-8 py-10 max-w-4xl mx-auto flex flex-col gap-8">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pm-fade-in">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="flex items-center gap-1.5 text-[12px] text-black/35 dark:text-white/35 hover:text-black/65 dark:hover:text-white/65 transition-colors"
          >
            <ChevronLeft size={13} strokeWidth={2} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-amber-500 dark:text-amber" />
            <h1 className="text-[18px] font-serif font-semibold tracking-tight text-black/85 dark:text-white/85">
              Discovery
            </h1>
          </div>

          <button
            onClick={() => { void loadThemes(); void loadOpportunities(); void loadInsights(activeThemeId); void loadAllInsights(); }}
            className="flex items-center gap-1.5 text-[12px] text-black/35 dark:text-white/35 hover:text-black/65 dark:hover:text-white/65 transition-colors"
          >
            <RefreshCw size={12} strokeWidth={2} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Stat row ────────────────────────────────────────────── */}
        <div className="glass-pane rounded-2xl px-6 py-4 flex items-center gap-8 pm-fade-in" style={{ animationDelay: "40ms" }}>
          {[
            { label: "Insights",  value: Object.keys(allInsightsById).length },
            { label: "Themes",    value: themes.length },
            { label: "Active",    value: opportunities.filter(o => o.status !== "discarded").length },
            { label: "Committed", value: oppCounts.committed },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-2">
              <span className="text-[22px] font-serif font-semibold text-black/80 dark:text-white/80 tabular-nums leading-none">
                {value}
              </span>
              <span className="text-[12px] text-black/35 dark:text-white/35">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Opportunities ───────────────────────────────────────── */}
        <div className="pm-fade-in" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-serif font-semibold text-black/80 dark:text-white/75 flex items-center gap-2">
              <TrendingUp size={14} className="text-amber-500 dark:text-amber" />
              Opportunities
            </h2>
            <span className="text-[11px] text-black/30 dark:text-white/25">
              Ask the agent: &quot;what should we build next?&quot;
            </span>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-0.5 mb-4 glass-pane rounded-xl p-1">
            {([
              ["inbox",       "Inbox",      oppCounts.inbox + oppCounts.shortlisted],
              ["shortlisted", "Shortlisted",oppCounts.shortlisted],
              ["committed",   "Committed",  oppCounts.committed],
              ["discarded",   "Discarded",  oppCounts.discarded],
            ] as const).map(([value, label, count]) => {
              const active = oppFilter === value;
              return (
                <button
                  key={value}
                  onClick={() => setOppFilter(value)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    active
                      ? "bg-amber-500 text-white shadow-sm"
                      : "text-black/45 dark:text-white/40 hover:text-black/70 dark:hover:text-white/65 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {label}
                  <span className={`text-[10px] tabular-nums ${active ? "text-white/70" : "text-black/25 dark:text-white/20"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {loadingOpps ? (
            <div className="glass-pane rounded-2xl p-10 flex items-center justify-center gap-2 text-black/35 dark:text-white/30 text-[13px]">
              <Loader2 size={14} className="animate-spin" />
              Loading opportunities…
            </div>
          ) : visibleOpportunities.length === 0 ? (
            <div className="glass-pane rounded-2xl px-8 py-12 text-center">
              <Sparkles size={20} className="text-amber-400 mx-auto mb-3" />
              <p className="text-[14px] font-serif font-medium text-black/60 dark:text-white/55 mb-1">
                No opportunities yet
              </p>
              <p className="text-[12.5px] text-black/35 dark:text-white/30 max-w-[40ch] mx-auto leading-relaxed">
                In the chat, ask the agent <span className="text-amber-600 dark:text-amber font-medium">&quot;what should we build next?&quot;</span> — it mines your themes and proposes RICE-scored opportunities.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleOpportunities.map((opp) => {
                const expanded  = expandedOppId === opp.id;
                const discarded = opp.status === "discarded";
                return (
                  <div
                    key={opp.id}
                    className={`glass-pane rounded-2xl overflow-hidden transition-opacity ${discarded ? "opacity-40" : ""}`}
                  >
                    <div className="p-5">
                      {/* Title + RICE */}
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3 className="text-[15px] font-serif font-semibold text-black/85 dark:text-white/85 leading-snug flex-1 min-w-0">
                          {opp.status === "shortlisted" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber bg-amber-100 dark:bg-amber/10 px-1.5 py-0.5 rounded-full mr-2 align-middle">
                              <Bookmark size={9} />
                              Shortlisted
                            </span>
                          )}
                          {opp.status === "committed" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-400/10 px-1.5 py-0.5 rounded-full mr-2 align-middle">
                              <CheckCircle2 size={9} />
                              Committed
                            </span>
                          )}
                          {opp.title}
                        </h3>
                        {opp.rice_score != null && (
                          <div className="shrink-0 text-right">
                            <div className="text-[20px] font-serif font-semibold text-amber-600 dark:text-amber tabular-nums leading-none">
                              {opp.rice_score.toFixed(1)}
                            </div>
                            <div className="text-[9px] font-medium text-black/30 dark:text-white/25 mt-0.5 tracking-widest uppercase">RICE</div>
                          </div>
                        )}
                      </div>

                      <p className="text-[13px] leading-relaxed text-black/60 dark:text-white/55 mb-3">
                        {opp.problem}
                      </p>

                      {opp.proposed_solution && (
                        <p className="text-[12.5px] leading-relaxed text-black/45 dark:text-white/40 mb-3 glass-inset rounded-xl px-3.5 py-2.5">
                          <span className="font-medium text-black/55 dark:text-white/50">Direction: </span>
                          {opp.proposed_solution}
                        </p>
                      )}

                      {/* RICE breakdown */}
                      {(opp.reach != null || opp.impact != null || opp.confidence != null || opp.effort != null) && (
                        <div className="flex items-center gap-4 mb-3">
                          {[
                            { label: "Reach",      value: opp.reach },
                            { label: "Impact",     value: opp.impact },
                            { label: "Confidence", value: opp.confidence },
                            { label: "Effort",     value: opp.effort },
                          ].filter(x => x.value != null).map(({ label, value }) => (
                            <div key={label} className="flex items-baseline gap-1">
                              <span className="text-[11px] text-black/30 dark:text-white/25">{label[0]}</span>
                              <span className="text-[13px] font-semibold text-black/70 dark:text-white/65 tabular-nums">{value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {opp.risks && (
                        <p className="text-[12px] text-rose-600 dark:text-rose-400/80 mb-3 leading-relaxed">
                          <span className="font-medium">Risk: </span>{opp.risks}
                        </p>
                      )}

                      {/* Evidence toggle */}
                      {opp.evidence_insight_ids.length > 0 && (
                        <button
                          onClick={() => setExpandedOppId(expanded ? null : opp.id)}
                          className="flex items-center gap-1.5 text-[12px] text-black/40 dark:text-white/35 hover:text-amber-600 dark:hover:text-amber transition-colors mb-3"
                        >
                          <ChevronDown size={12} strokeWidth={2} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                          {opp.evidence_insight_ids.length} supporting {opp.evidence_insight_ids.length === 1 ? "quote" : "quotes"}
                        </button>
                      )}

                      {expanded && (
                        <div className="flex flex-col gap-3 mb-3">
                          {Array.from(new Set(opp.evidence_insight_ids)).map((insId, i) => {
                            const ins = allInsightsById[insId];
                            if (!ins) return (
                              <p key={`${insId}-${i}`} className="text-[11.5px] text-black/30 dark:text-white/25 italic px-3 py-2 glass-inset rounded-xl">
                                Insight no longer available
                              </p>
                            );
                            return (
                              <div key={`${insId}-${i}`} className="glass-inset rounded-xl px-4 py-3">
                                <p className="text-[13px] font-serif italic text-black/75 dark:text-white/70 leading-relaxed mb-1.5">
                                  &ldquo;{ins.quote}&rdquo;
                                </p>
                                <div className="flex items-center gap-2 text-[11px] text-black/35 dark:text-white/30">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SENTIMENT_COLOR[ins.sentiment] || ""}`} />
                                  <span>{ins.persona || "Anonymous"}</span>
                                  <span>·</span>
                                  <span>{ins.knowledge_documents?.filename || "Source"}</span>
                                  <span>·</span>
                                  <span>Sev {ins.severity}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-black/[0.05] dark:border-white/[0.05]">
                        {STATUS_OPTIONS.map(({ value, label, icon: Icon }) => {
                          const isActive = opp.status === value;
                          return (
                            <button
                              key={value}
                              onClick={() => void updateStatus(opp.id, isActive ? "proposed" : value)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium transition-all ${
                                isActive
                                  ? "bg-amber-100 dark:bg-amber/10 text-amber-700 dark:text-amber"
                                  : "text-black/35 dark:text-white/30 hover:text-black/65 dark:hover:text-white/55 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                              }`}
                            >
                              <Icon size={11} strokeWidth={2} />
                              {label}
                            </button>
                          );
                        })}
                        <div className="flex-1" />
                        <button
                          onClick={() => void promote(opp)}
                          disabled={discarded}
                          className="flex items-center gap-1.5 text-[11.5px] font-medium text-amber-700 dark:text-amber hover:bg-amber-50 dark:hover:bg-amber/10 px-2.5 py-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                          Promote to feature
                          <ArrowUpRight size={11} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Evidence: Themes + Insights ─────────────────────────── */}
        <div className="pm-fade-in" style={{ animationDelay: "120ms" }}>
          <h2 className="text-[15px] font-serif font-semibold text-black/80 dark:text-white/75 flex items-center gap-2 mb-4">
            <MessageSquare size={14} className="text-amber-500 dark:text-amber" />
            Evidence
          </h2>

          <div className="grid grid-cols-5 gap-4">
            {/* Themes — left column */}
            <div className="col-span-2 glass-pane rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-black/55 dark:text-white/45">Themes</span>
                <span className="text-[11px] text-black/25 dark:text-white/20">{themes.length}</span>
              </div>

              {loadingThemes ? (
                <div className="p-6 flex items-center gap-2 text-[12px] text-black/30 dark:text-white/25">
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </div>
              ) : themes.length === 0 ? (
                <div className="p-6 text-[12.5px] text-black/35 dark:text-white/30 leading-relaxed">
                  No themes yet. Upload interviews or support tickets to the knowledge base.
                </div>
              ) : (
                <div className="p-2 flex flex-col gap-0.5">
                  {themes.map(t => {
                    const active = activeThemeId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveThemeId(t.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                          active
                            ? "bg-amber-50 dark:bg-amber/8 text-amber-800 dark:text-amber"
                            : "text-black/65 dark:text-white/55 hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium leading-snug truncate">{t.name}</span>
                          <span className={`text-[11px] tabular-nums shrink-0 ${active ? "text-amber-600 dark:text-amber/70" : "text-black/25 dark:text-white/20"}`}>
                            {t.insight_count}
                          </span>
                        </div>
                        {t.summary && active && (
                          <p className="text-[11px] mt-0.5 text-amber-700/60 dark:text-amber/50 leading-snug line-clamp-2">
                            {t.summary}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Insights — right column */}
            <div className="col-span-3 glass-pane rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.05] flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-black/55 dark:text-white/45">
                  {activeTheme ? activeTheme.name : "Quotes"}
                </span>
                <span className="text-[11px] text-black/25 dark:text-white/20">{insights.length}</span>
              </div>

              <div className="p-3">
                {loadingInsights ? (
                  <div className="p-6 flex items-center gap-2 text-[12px] text-black/30 dark:text-white/25">
                    <Loader2 size={12} className="animate-spin" /> Loading…
                  </div>
                ) : insights.length === 0 ? (
                  <div className="p-6 text-[12.5px] text-black/35 dark:text-white/30">
                    Nothing in this theme yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {insights.slice(0, 12).map(ins => (
                      <div key={ins.id} className="glass-inset rounded-xl px-4 py-3">
                        <p className="text-[13px] font-serif italic text-black/75 dark:text-white/70 leading-relaxed mb-1.5">
                          &ldquo;{ins.quote}&rdquo;
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-black/30 dark:text-white/25">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SENTIMENT_COLOR[ins.sentiment] || ""}`} />
                          <span>{ins.persona || "Anonymous"}</span>
                          <span>·</span>
                          <span className="truncate">{ins.knowledge_documents?.filename || "Source"}</span>
                          <span className="shrink-0">· Sev {ins.severity}</span>
                        </div>
                      </div>
                    ))}
                    {insights.length > 12 && (
                      <p className="text-[11.5px] text-black/30 dark:text-white/25 text-center py-2">
                        +{insights.length - 12} more quotes
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
