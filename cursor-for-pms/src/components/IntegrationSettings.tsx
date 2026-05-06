"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";
import { useCustomAuth as useAuth } from "@/hooks/useCustomAuth";

interface IntegrationStatus {
  jira: { connected: boolean; domain?: string; email?: string };
  linear: { connected: boolean };
}

export default function IntegrationSettings() {
  const { userId } = useAuth();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [status, setStatus] = useState<IntegrationStatus>({
    jira: { connected: false },
    linear: { connected: false },
  });
  const [loading, setLoading] = useState(true);

  // Jira form
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraConnecting, setJiraConnecting] = useState(false);
  const [jiraError, setJiraError] = useState("");

  // Linear form
  const [linearKey, setLinearKey] = useState("");
  const [linearConnecting, setLinearConnecting] = useState(false);
  const [linearError, setLinearError] = useState("");

  const authHeader = () => ({
    Authorization: `Bearer ${userId}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    if (!userId) return;
    fetch(`${API}/integrations/status`, { headers: { Authorization: `Bearer ${userId}` } })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, API]);

  const connectJira = async () => {
    if (!jiraDomain.trim() || !jiraEmail.trim() || !jiraToken.trim()) return;
    setJiraConnecting(true);
    setJiraError("");
    try {
      const res = await fetch(`${API}/integrations/jira`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          domain: jiraDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
          email: jiraEmail.trim(),
          api_token: jiraToken.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setJiraError(err.detail || "Connection failed.");
      } else {
        const d = jiraDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        setStatus((s) => ({ ...s, jira: { connected: true, domain: d, email: jiraEmail.trim() } }));
        setJiraToken("");
      }
    } catch {
      setJiraError("Network error. Is the backend running?");
    } finally {
      setJiraConnecting(false);
    }
  };

  const disconnectJira = async () => {
    await fetch(`${API}/integrations/jira`, { method: "DELETE", headers: authHeader() });
    setStatus((s) => ({ ...s, jira: { connected: false } }));
    setJiraDomain("");
    setJiraEmail("");
    setJiraToken("");
  };

  const connectLinear = async () => {
    if (!linearKey.trim()) return;
    setLinearConnecting(true);
    setLinearError("");
    try {
      const res = await fetch(`${API}/integrations/linear`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ api_key: linearKey.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setLinearError(err.detail || "Connection failed.");
      } else {
        setStatus((s) => ({ ...s, linear: { connected: true } }));
        setLinearKey("");
      }
    } catch {
      setLinearError("Network error. Is the backend running?");
    } finally {
      setLinearConnecting(false);
    }
  };

  const disconnectLinear = async () => {
    await fetch(`${API}/integrations/linear`, { method: "DELETE", headers: authHeader() });
    setStatus((s) => ({ ...s, linear: { connected: false } }));
    setLinearKey("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={20} className="animate-spin text-black/30 dark:text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Jira */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-black/3 dark:bg-white/3 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">J</div>
            <div>
              <p className="text-[14px] font-semibold text-black dark:text-ivory">Jira</p>
              <p className="text-[11px] text-black/50 dark:text-white/50">Atlassian Cloud</p>
            </div>
          </div>
          {status.jira.connected ? (
            <CheckCircle2 size={18} className="text-green-500" />
          ) : (
            <XCircle size={18} className="text-black/20 dark:text-white/20" />
          )}
        </div>

        <div className="p-5 space-y-3">
          {status.jira.connected ? (
            <div className="space-y-3">
              <div className="text-[13px] text-black/70 dark:text-white/70">
                <span className="font-medium">Connected to:</span>{" "}
                <a
                  href={`https://${status.jira.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  {status.jira.domain} <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-[12px] text-black/50 dark:text-white/50">{status.jira.email}</p>
              <button
                onClick={disconnectJira}
                className="text-[12px] text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors font-medium"
              >
                Disconnect Jira
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider font-medium text-black/50 dark:text-white/50">
                  Jira Domain
                </label>
                <input
                  type="text"
                  value={jiraDomain}
                  onChange={(e) => setJiraDomain(e.target.value)}
                  placeholder="yourcompany.atlassian.net"
                  className="w-full text-[13px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider font-medium text-black/50 dark:text-white/50">
                  Email
                </label>
                <input
                  type="email"
                  value={jiraEmail}
                  onChange={(e) => setJiraEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full text-[13px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider font-medium text-black/50 dark:text-white/50 flex items-center justify-between">
                  <span>API Token</span>
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-600 dark:text-amber hover:underline normal-case tracking-normal"
                  >
                    Get token ↗
                  </a>
                </label>
                <input
                  type="password"
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  placeholder="ATATT3x..."
                  className="w-full text-[13px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber/50"
                />
              </div>
              {jiraError && (
                <p className="text-[12px] text-red-500">{jiraError}</p>
              )}
              <button
                onClick={connectJira}
                disabled={jiraConnecting || !jiraDomain || !jiraEmail || !jiraToken}
                className="w-full py-2 text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {jiraConnecting && <Loader2 size={13} className="animate-spin" />}
                {jiraConnecting ? "Connecting..." : "Connect Jira"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Linear */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-black/3 dark:bg-white/3 border-b border-black/5 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#5E6AD2] flex items-center justify-center text-white text-xs font-bold">L</div>
            <div>
              <p className="text-[14px] font-semibold text-black dark:text-ivory">Linear</p>
              <p className="text-[11px] text-black/50 dark:text-white/50">Issue tracking</p>
            </div>
          </div>
          {status.linear.connected ? (
            <CheckCircle2 size={18} className="text-green-500" />
          ) : (
            <XCircle size={18} className="text-black/20 dark:text-white/20" />
          )}
        </div>

        <div className="p-5 space-y-3">
          {status.linear.connected ? (
            <div className="space-y-3">
              <p className="text-[13px] text-black/70 dark:text-white/70">
                <CheckCircle2 size={13} className="inline text-green-500 mr-1.5 mb-0.5" />
                Linear is connected.
              </p>
              <button
                onClick={disconnectLinear}
                className="text-[12px] text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors font-medium"
              >
                Disconnect Linear
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-wider font-medium text-black/50 dark:text-white/50 flex items-center justify-between">
                  <span>API Key</span>
                  <a
                    href="https://linear.app/settings/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-600 dark:text-amber hover:underline normal-case tracking-normal"
                  >
                    Get key ↗
                  </a>
                </label>
                <input
                  type="password"
                  value={linearKey}
                  onChange={(e) => setLinearKey(e.target.value)}
                  placeholder="lin_api_..."
                  className="w-full text-[13px] px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-black/20 text-black dark:text-ivory focus:outline-none focus:ring-1 focus:ring-amber-500 dark:focus:ring-amber/50"
                />
              </div>
              {linearError && (
                <p className="text-[12px] text-red-500">{linearError}</p>
              )}
              <button
                onClick={connectLinear}
                disabled={linearConnecting || !linearKey}
                className="w-full py-2 text-[13px] font-medium bg-[#5E6AD2] hover:bg-[#4B56C0] text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {linearConnecting && <Loader2 size={13} className="animate-spin" />}
                {linearConnecting ? "Connecting..." : "Connect Linear"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
