"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, CheckCircle2, ChevronDown, ChevronRight,
  ExternalLink, X, Send, AlertCircle
} from "lucide-react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";

interface Story {
  title: string;
  description: string;
  acceptance_criteria: string[];
  story_points?: number;
}
interface Epic  { title: string; description: string; stories: Story[] }
interface TicketData { epics: Epic[] }
interface JiraProject { key: string; name: string; id: string }
interface LinearTeam  { id: string; name: string; key: string }

interface Props {
  userInput: string;
  productContext: string;
  documentContext: string;
  onClose: () => void;
}

type Destination = "jira" | "linear";
type ExportState = "idle" | "exporting" | "success" | "error";

export default function TicketExportModal({ userInput, productContext, documentContext, onClose }: Props) {
  const { userId } = useAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;

  // Ticket generation
  const [tickets, setTickets]       = useState<TicketData | null>(null);
  const [generating, setGenerating] = useState(true);
  const [genError, setGenError]     = useState("");
  const [expandedEpics, setExpandedEpics] = useState<Set<number>>(new Set([0]));

  // Integration status
  const [jiraConnected, setJiraConnected]   = useState(false);
  const [linearConnected, setLinearConnected] = useState(false);
  const [jiraInfo, setJiraInfo] = useState<{ domain?: string; email?: string }>({});

  // Inline connect state
  const [connectingTo, setConnectingTo]     = useState<Destination | null>(null);
  const [jiraDomain, setJiraDomain]         = useState("");
  const [jiraEmail, setJiraEmail]           = useState("");
  const [jiraToken, setJiraToken]           = useState("");
  const [linearKey, setLinearKey]           = useState("");
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError]     = useState("");

  // Destination + export
  const [destination, setDestination]         = useState<Destination | null>(null);
  const [jiraProjects, setJiraProjects]       = useState<JiraProject[]>([]);
  const [linearTeams, setLinearTeams]         = useState<LinearTeam[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedTeam, setSelectedTeam]       = useState("");
  const [loadingDests, setLoadingDests]       = useState(false);
  const [exportState, setExportState]         = useState<ExportState>("idle");
  const [exportError, setExportError]         = useState("");
  const [createdTickets, setCreatedTickets]   = useState<{ type: string; key?: string; identifier?: string; title: string; url?: string }[]>([]);

  const authHdr = () => ({ Authorization: `Bearer ${userId}`, "Content-Type": "application/json" });

  // Fetch integration status
  const refreshStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const s = await fetch(`${API}/integrations/status`, { headers: { Authorization: `Bearer ${userId}` } }).then(r => r.json());
      setJiraConnected(s.jira?.connected ?? false);
      setLinearConnected(s.linear?.connected ?? false);
      setJiraInfo({ domain: s.jira?.domain, email: s.jira?.email });
      if (s.jira?.connected && !destination)   setDestination("jira");
      else if (s.linear?.connected && !destination) setDestination("linear");
    } catch { /* ignore */ }
  }, [userId, API, destination]);

  // On mount: generate tickets + fetch status in parallel
  useEffect(() => {
    if (!userId) return;
    refreshStatus();
    fetch(`${API}/ai/generate-tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userId}` },
      body: JSON.stringify({ user_input: userInput, product_context: productContext, document_context: documentContext }),
    })
      .then(async r => { if (!r.ok) throw new Error((await r.json()).detail || "Generation failed"); return r.json(); })
      .then(data => { setTickets(data); setExpandedEpics(new Set([0])); })
      .catch(e => setGenError(e.message || "Failed to generate structured tickets"))
      .finally(() => setGenerating(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load projects / teams when destination changes
  useEffect(() => {
    if (!destination || !userId) return;
    setLoadingDests(true);
    setSelectedProject(""); setSelectedTeam("");
    const url = destination === "jira" ? `${API}/integrations/jira/projects` : `${API}/integrations/linear/teams`;
    fetch(url, { headers: { Authorization: `Bearer ${userId}` } })
      .then(r => r.json())
      .then(data => {
        if (destination === "jira") { setJiraProjects(data); if (data.length === 1) setSelectedProject(data[0].key); }
        else                        { setLinearTeams(data);  if (data.length === 1) setSelectedTeam(data[0].id); }
      })
      .catch(() => {})
      .finally(() => setLoadingDests(false));
  }, [destination, userId, API]);

  // Inline connect
  const handleConnect = async () => {
    if (!connectingTo) return;
    setConnectLoading(true); setConnectError("");
    try {
      const body = connectingTo === "jira"
        ? { domain: jiraDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), email: jiraEmail.trim(), api_token: jiraToken.trim() }
        : { api_key: linearKey.trim() };
      const res = await fetch(`${API}/integrations/${connectingTo}`, { method: "POST", headers: authHdr(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Connection failed"); }
      await refreshStatus();
      setConnectingTo(null);
      setDestination(connectingTo);
    } catch (e: unknown) {
      setConnectError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnectLoading(false);
    }
  };

  const toggleEpic = (i: number) => setExpandedEpics(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const canExport = tickets && destination && exportState === "idle" &&
    ((destination === "jira" && selectedProject) || (destination === "linear" && selectedTeam));

  const handleExport = async () => {
    if (!tickets || !destination) return;
    setExportState("exporting"); setExportError("");
    const payload = tickets.epics.map(e => ({
      title: e.title, description: e.description,
      stories: e.stories.map(s => ({ title: s.title, description: s.description, acceptance_criteria: s.acceptance_criteria })),
    }));
    const url  = `${API}/integrations/${destination}/export`;
    const body = destination === "jira" ? { project_key: selectedProject, tickets: payload } : { team_id: selectedTeam, tickets: payload };
    try {
      const res = await fetch(url, { method: "POST", headers: authHdr(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Export failed"); }
      const data = await res.json();
      setCreatedTickets(data.created ?? []);
      setExportState("success");
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : "Export failed");
      setExportState("error");
    }
  };

  const totalStories  = tickets?.epics.reduce((n, e) => n + e.stories.length, 0) ?? 0;
  const neitherConnected = !jiraConnected && !linearConnected;

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-xl rounded-xl shadow-2xl border border-black/5 dark:border-white/5 w-[700px] max-h-[88vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
          <div>
            <h2 className="text-[15px] font-semibold text-black dark:text-ivory">Export Tickets</h2>
            <p className="text-[12px] text-black/40 dark:text-white/40 mt-0.5">
              {generating ? "Generating structured tickets…"
                : genError ? "Could not generate tickets"
                : tickets   ? `${tickets.epics.length} epics · ${totalStories} stories ready`
                : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/40 dark:text-white/40">
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-hidden">

          {/* Generation loading */}
          {generating && (
            <div className="flex flex-col items-center justify-center gap-3 h-64">
              <Loader2 size={24} className="animate-spin text-amber-600 dark:text-amber" />
              <p className="text-[13px] text-black/50 dark:text-white/50">Structuring tickets with AI…</p>
            </div>
          )}

          {/* Generation error */}
          {!generating && genError && (
            <div className="flex flex-col items-center justify-center gap-3 h-64">
              <AlertCircle size={22} className="text-red-400" />
              <p className="text-[13px] text-red-500">{genError}</p>
              <button onClick={onClose} className="text-[12px] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white mt-2">Close</button>
            </div>
          )}

          {/* Success */}
          {exportState === "success" && (
            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                <CheckCircle2 size={20} />
                <span className="text-[15px] font-semibold">{createdTickets.length} tickets created</span>
              </div>
              <div className="space-y-1.5">
                {createdTickets.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-black/3 dark:bg-white/3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                        t.type === "Epic"
                          ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                          : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      }`}>{t.type}</span>
                      <span className="text-[12px] text-black/50 dark:text-white/50 font-mono shrink-0">{t.key ?? t.identifier}</span>
                      <span className="text-[13px] text-black dark:text-ivory truncate">{t.title}</span>
                    </div>
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="shrink-0 ml-2 text-amber-600 dark:text-amber">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main: ticket tree + right panel */}
          {!generating && !genError && tickets && exportState !== "success" && (
            <div className="flex h-full divide-x divide-black/5 dark:divide-white/5 overflow-hidden">

              {/* Left: ticket tree */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {tickets.epics.map((epic, ei) => (
                  <div key={ei} className="rounded-lg border border-black/8 dark:border-white/8 overflow-hidden">
                    <button
                      onClick={() => toggleEpic(ei)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-black/3 dark:hover:bg-white/3 transition-colors"
                    >
                      {expandedEpics.has(ei) ? <ChevronDown size={13} className="text-black/40 dark:text-white/40 shrink-0" /> : <ChevronRight size={13} className="text-black/40 dark:text-white/40 shrink-0" />}
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 shrink-0">Epic</span>
                      <span className="text-[13px] font-medium text-black dark:text-ivory truncate">{epic.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-black/30 dark:text-white/30">{epic.stories.length}s</span>
                    </button>
                    {expandedEpics.has(ei) && (
                      <div className="border-t border-black/5 dark:border-white/5">
                        {epic.description && <p className="px-4 py-2 text-[12px] text-black/50 dark:text-white/50 italic border-b border-black/5 dark:border-white/5">{epic.description}</p>}
                        {epic.stories.map((story, si) => (
                          <div key={si} className="px-4 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5">Story</span>
                              <div className="min-w-0">
                                <p className="text-[13px] text-black dark:text-ivory font-medium leading-snug">{story.title}</p>
                                {story.acceptance_criteria?.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5">
                                    {story.acceptance_criteria.map((ac, ai) => (
                                      <li key={ai} className="text-[11px] text-black/50 dark:text-white/50 flex gap-1.5">
                                        <span className="text-amber-500 shrink-0">•</span><span>{ac}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Right: destination panel */}
              <div className="w-64 shrink-0 overflow-y-auto p-4 space-y-4">

                {/* ── No integrations: inline connect ── */}
                {neitherConnected && connectingTo === null && (
                  <div className="space-y-3">
                    <div className="text-center py-2">
                      <p className="text-[13px] font-semibold text-black dark:text-ivory">Connect an issue tracker</p>
                      <p className="text-[12px] text-black/50 dark:text-white/50 mt-1 leading-relaxed">Push these tickets directly to Jira or Linear without leaving this screen.</p>
                    </div>
                    <button
                      onClick={() => { setConnectingTo("jira"); setConnectError(""); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">J</div>
                      <div>
                        <p className="text-[13px] font-semibold text-black dark:text-ivory">Connect Jira</p>
                        <p className="text-[11px] text-black/40 dark:text-white/40">Atlassian Cloud</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setConnectingTo("linear"); setConnectError(""); }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 hover:border-[#5E6AD2] hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#5E6AD2] flex items-center justify-center text-white text-xs font-bold shrink-0">L</div>
                      <div>
                        <p className="text-[13px] font-semibold text-black dark:text-ivory">Connect Linear</p>
                        <p className="text-[11px] text-black/40 dark:text-white/40">Issue tracking</p>
                      </div>
                    </button>
                  </div>
                )}

                {/* ── Inline connect form ── */}
                {connectingTo !== null && (
                  <div className="space-y-3">
                    <button onClick={() => { setConnectingTo(null); setConnectError(""); }} className="flex items-center gap-1.5 text-[12px] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors">
                      ← Back
                    </button>
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${connectingTo === "jira" ? "bg-blue-600" : "bg-[#5E6AD2]"}`}>
                        {connectingTo === "jira" ? "J" : "L"}
                      </div>
                      <p className="text-[14px] font-semibold text-black dark:text-ivory">
                        Connect {connectingTo === "jira" ? "Jira" : "Linear"}
                      </p>
                    </div>

                    {connectingTo === "jira" && (
                      <>
                        <input type="text" value={jiraDomain} onChange={e => setJiraDomain(e.target.value)}
                          placeholder="company.atlassian.net"
                          className="w-full text-[12px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <input type="email" value={jiraEmail} onChange={e => setJiraEmail(e.target.value)}
                          placeholder="you@company.com"
                          className="w-full text-[12px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <div>
                          <input type="password" value={jiraToken} onChange={e => setJiraToken(e.target.value)}
                            placeholder="API token (ATATT3x…)"
                            className="w-full text-[12px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer"
                            className="text-[11px] text-blue-500 hover:underline mt-1 inline-block">
                            Get API token ↗
                          </a>
                        </div>
                      </>
                    )}

                    {connectingTo === "linear" && (
                      <div>
                        <input type="password" value={linearKey} onChange={e => setLinearKey(e.target.value)}
                          placeholder="lin_api_…"
                          className="w-full text-[12px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                        <a href="https://linear.app/settings/api" target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-indigo-500 hover:underline mt-1 inline-block">
                          Get API key ↗
                        </a>
                      </div>
                    )}

                    {connectError && <p className="text-[11px] text-red-500">{connectError}</p>}

                    <button
                      onClick={handleConnect}
                      disabled={connectLoading || (connectingTo === "jira" ? (!jiraDomain || !jiraEmail || !jiraToken) : !linearKey)}
                      className={`w-full py-2 text-[13px] font-medium text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${
                        connectingTo === "jira" ? "bg-blue-600 hover:bg-blue-700" : "bg-[#5E6AD2] hover:bg-[#4B56C0]"
                      }`}
                    >
                      {connectLoading && <Loader2 size={13} className="animate-spin" />}
                      {connectLoading ? "Connecting…" : "Connect & Continue"}
                    </button>
                  </div>
                )}

                {/* ── Connected: destination selector ── */}
                {!neitherConnected && connectingTo === null && (
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-black/50 dark:text-white/50">Export to</p>

                    {jiraConnected && (
                      <button onClick={() => setDestination("jira")}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all text-[13px] ${
                          destination === "jira"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            : "border-black/10 dark:border-white/10 text-black/70 dark:text-white/70 hover:border-blue-400"
                        }`}>
                        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">J</div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">Jira</p>
                          {jiraInfo.domain && <p className="text-[11px] opacity-60 truncate">{jiraInfo.domain}</p>}
                        </div>
                        {destination === "jira" && <CheckCircle2 size={14} className="ml-auto shrink-0 text-blue-500" />}
                      </button>
                    )}

                    {linearConnected && (
                      <button onClick={() => setDestination("linear")}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all text-[13px] ${
                          destination === "linear"
                            ? "border-[#5E6AD2] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                            : "border-black/10 dark:border-white/10 text-black/70 dark:text-white/70 hover:border-[#5E6AD2]"
                        }`}>
                        <div className="w-6 h-6 rounded bg-[#5E6AD2] flex items-center justify-center text-white text-[10px] font-bold shrink-0">L</div>
                        <p className="font-medium">Linear</p>
                        {destination === "linear" && <CheckCircle2 size={14} className="ml-auto shrink-0 text-indigo-500" />}
                      </button>
                    )}

                    {/* Add the other integration */}
                    {jiraConnected && !linearConnected && (
                      <button onClick={() => { setConnectingTo("linear"); setConnectError(""); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-black/10 dark:border-white/10 text-[12px] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-all">
                        + Connect Linear
                      </button>
                    )}
                    {linearConnected && !jiraConnected && (
                      <button onClick={() => { setConnectingTo("jira"); setConnectError(""); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-black/10 dark:border-white/10 text-[12px] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:border-black/30 dark:hover:border-white/30 transition-all">
                        + Connect Jira
                      </button>
                    )}

                    {/* Project / team selector */}
                    {destination && (
                      <div className="space-y-1.5 pt-1 border-t border-black/5 dark:border-white/5">
                        <p className="text-[11px] uppercase tracking-wider font-medium text-black/50 dark:text-white/50 pt-1">
                          {destination === "jira" ? "Project" : "Team"}
                        </p>
                        {loadingDests ? <Loader2 size={14} className="animate-spin text-black/30 dark:text-white/30" /> :
                          destination === "jira" ? (
                            <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                              className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black/30 text-black dark:text-ivory focus:outline-none">
                              <option value="">Select project…</option>
                              {jiraProjects.map(p => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
                            </select>
                          ) : (
                            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
                              className="w-full text-[12px] px-2.5 py-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black/30 text-black dark:text-ivory focus:outline-none">
                              <option value="">Select team…</option>
                              {linearTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          )
                        }
                      </div>
                    )}

                    {exportError && <p className="text-[11px] text-red-500 mt-1">{exportError}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {!generating && !genError && exportState !== "success" && connectingTo === null && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-black/5 dark:border-white/5 bg-black/2 dark:bg-white/2 shrink-0">
            <button onClick={onClose} className="text-[13px] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors">
              Cancel
            </button>
            {!neitherConnected && (
              <button onClick={handleExport} disabled={!canExport}
                className="flex items-center gap-2 px-4 py-1.5 text-[13px] font-medium bg-amber-600 dark:bg-amber text-white dark:text-[#1A1A1A] rounded-lg hover:bg-amber-700 dark:hover:bg-amber/90 disabled:opacity-40 transition-all">
                {exportState === "exporting"
                  ? <><Loader2 size={13} className="animate-spin" /> Exporting…</>
                  : <><Send size={13} /> Export {tickets ? `${totalStories + (tickets.epics.length)} tickets` : ""}</>
                }
              </button>
            )}
          </div>
        )}

        {exportState === "success" && (
          <div className="flex justify-end px-5 py-3 border-t border-black/5 dark:border-white/5 shrink-0">
            <button onClick={onClose} className="px-4 py-1.5 text-[13px] font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
