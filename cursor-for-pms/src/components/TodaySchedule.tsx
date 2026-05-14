"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { Calendar, AlertTriangle, Clock, Users, Video, ChevronRight, RefreshCw } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  start_formatted: string;
  end_formatted: string;
  duration_minutes: number;
  is_all_day: boolean;
  location: string;
  meet_link: string | null;
  attendee_count: number;
  html_link: string;
}

interface Conflict {
  type: "overlap" | "back_to_back" | "marathon";
  message: string;
  at: string;
  event_ids?: string[];
}

interface CalendarData {
  events: CalendarEvent[];
  conflicts: Conflict[];
  provider: string;
  total_meeting_minutes: number;
  date: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function conflictColor(type: Conflict["type"]): string {
  if (type === "overlap") return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20";
  if (type === "marathon") return "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20";
  return "text-amber-700 dark:text-amber bg-amber-50/80 dark:bg-amber/10 border-amber-200 dark:border-amber/20";
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface TodayScheduleProps {
  /** Called when user clicks a meeting — pre-fills the chat */
  onMeetingClick?: (prompt: string) => void;
}

export default function TodaySchedule({ onMeetingClick }: TodayScheduleProps) {
  const { user } = useUser();
  const API = process.env.NEXT_PUBLIC_API_URL;

  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"no_token" | "api_error" | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Dev-mode mock so the UI is visible without a real Google connection
    if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
      await new Promise((r) => setTimeout(r, 400));
      const now = new Date();
      const h = now.getHours();
      setData({
        date: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
        provider: "google",
        total_meeting_minutes: 150,
        events: [
          {
            id: "1", title: "Sprint Planning", is_all_day: false,
            start: "", end: "",
            start_formatted: `${h}:00 AM`, end_formatted: `${h + 1}:00 AM`,
            duration_minutes: 60, location: "", meet_link: "https://meet.google.com/mock",
            attendee_count: 6, html_link: "",
          },
          {
            id: "2", title: "Design Review", is_all_day: false,
            start: "", end: "",
            start_formatted: `${h + 1}:00 AM`, end_formatted: `${h + 2}:00 AM`,
            duration_minutes: 60, location: "", meet_link: null,
            attendee_count: 3, html_link: "",
          },
          {
            id: "3", title: "1:1 with Product Lead", is_all_day: false,
            start: "", end: "",
            start_formatted: `${h + 2}:00 AM`, end_formatted: `${h + 2}:30 AM`,
            duration_minutes: 30, location: "", meet_link: null,
            attendee_count: 2, html_link: "",
          },
        ],
        conflicts: [
          { type: "marathon", message: "2h 30m of back-to-back meetings. Consider a break.", at: `${h}:00 AM` },
        ],
      });
      setLoading(false);
      return;
    }

    try {
      const userId = user?.id;
      if (!userId) {
        setError("no_token");
        setLoading(false);
        return;
      }

      const res = await fetch(`${API}/integrations/calendar/upcoming?provider=google`, {
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (!res.ok) {
        // 400 = calendar not connected (missing scope/secret key); other errors = api_error
        setError(res.status === 400 ? "no_token" : "api_error");
        setLoading(false);
        return;
      }

      setData(await res.json());
    } catch {
      setError("api_error");
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, [user, API]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const handleMeetingClick = (event: CalendarEvent) => {
    const prompt = `Draft an agenda for my upcoming "${event.title}" meeting (${event.start_formatted}${event.duration_minutes ? `, ${durationLabel(event.duration_minutes)}` : ""}) based on recent work in this project.`;
    if (onMeetingClick) {
      onMeetingClick(prompt);
    } else {
      window.dispatchEvent(new CustomEvent("pmind:prefill-chat", { detail: { text: prompt } }));
    }
  };

  // ── Empty / error states ──────────────────────────────────────────────────

  if (error === "no_token" || error === "api_error") {
    return (
      <div className="mb-8 p-4 rounded-xl border border-black/8 dark:border-white/8 bg-white/50 dark:bg-white/[0.03] flex items-center gap-3">
        <Calendar size={16} className="text-black/25 dark:text-white/25 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-black/60 dark:text-white/60">
            Google Calendar not connected
          </p>
          <p className="text-[11px] text-black/35 dark:text-white/35 mt-0.5">
            Add <code className="text-[10px] bg-black/5 dark:bg-white/5 px-1 rounded">calendar.readonly</code> scope to your Google social connection in the Clerk Dashboard, and set <code className="text-[10px] bg-black/5 dark:bg-white/5 px-1 rounded">CLERK_SECRET_KEY</code> in the backend env.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-3.5 w-3.5 rounded bg-black/8 dark:bg-white/8 animate-pulse" />
          <div className="h-3 w-28 rounded bg-black/8 dark:bg-white/8 animate-pulse" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-44 h-20 rounded-xl bg-black/5 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.events.length === 0) {
    return (
      <div className="mb-8 flex items-center gap-3 py-3.5 px-4 rounded-xl border border-black/8 dark:border-white/8 bg-white/50 dark:bg-white/[0.03]">
        <Calendar size={15} className="text-black/25 dark:text-white/25 flex-shrink-0" />
        <div className="flex-1">
          <span className="text-[12.5px] text-black/50 dark:text-white/45">
            {data?.date ?? "Today"} · No upcoming meetings
          </span>
          <span className="ml-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Clear calendar ✓</span>
        </div>
        <button onClick={() => { setRetrying(true); fetchCalendar(); }} className="p-1 rounded-lg text-black/25 dark:text-white/25 hover:text-black/60 dark:hover:text-white/60 transition-colors">
          <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />
        </button>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const totalHours = Math.floor(data.total_meeting_minutes / 60);
  const totalMins = data.total_meeting_minutes % 60;

  // Build a map: event_id → worst conflict type so we can style individual cards
  const conflictMap = new Map<string, Conflict["type"]>();
  const SEVERITY: Record<Conflict["type"], number> = { overlap: 3, marathon: 2, back_to_back: 1 };
  data.conflicts.forEach((c) => {
    c.event_ids?.forEach((id) => {
      const existing = conflictMap.get(id);
      if (!existing || SEVERITY[c.type] > SEVERITY[existing]) {
        conflictMap.set(id, c.type);
      }
    });
  });

  const conflictCardStyle: Record<Conflict["type"], string> = {
    overlap: "border-l-2 !border-l-red-400 dark:!border-l-red-500",
    marathon: "border-l-2 !border-l-orange-400 dark:!border-l-orange-500",
    back_to_back: "border-l-2 !border-l-amber-400 dark:!border-l-amber-500",
  };
  const conflictBadge: Record<Conflict["type"], string> = {
    overlap: "text-red-600 dark:text-red-400",
    marathon: "text-orange-600 dark:text-orange-400",
    back_to_back: "text-amber-700 dark:text-amber",
  };
  const conflictLabel: Record<Conflict["type"], string> = {
    overlap: "Conflict",
    marathon: "Marathon",
    back_to_back: "Back-to-back",
  };

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-wider text-black/40 dark:text-white/40 flex items-center gap-1.5">
          <Calendar size={12} />
          Upcoming Meetings
          <span className="font-mono normal-case tracking-normal ml-1 text-black/25 dark:text-white/25">
            {data.date}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-black/35 dark:text-white/35">
            {totalHours > 0 ? `${totalHours}h ` : ""}{totalMins > 0 ? `${totalMins}m` : ""} remaining
          </span>
          <button
            onClick={() => { setRetrying(true); fetchCalendar(); }}
            className="p-1 rounded-lg text-black/20 dark:text-white/20 hover:text-black/50 dark:hover:text-white/50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={10} className={retrying ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Conflict warnings */}
      {data.conflicts.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {data.conflicts.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-[11.5px] font-medium ${conflictColor(c.type)}`}
            >
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1">{c.message}</span>
              <button
                onClick={() => {
                  const prompt = `I have a scheduling conflict: ${c.message} Help me decide how to handle this.`;
                  if (onMeetingClick) onMeetingClick(prompt);
                  else window.dispatchEvent(new CustomEvent("pmind:prefill-chat", { detail: { text: prompt } }));
                }}
                className="flex-shrink-0 text-[10px] font-semibold underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
              >
                Ask AI
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Events — horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto pb-1 thin-scroll -mx-1 px-1">
        {data.events.map((ev) => {
          const cardConflict = conflictMap.get(ev.id);
          return (
            <button
              key={ev.id}
              onClick={() => handleMeetingClick(ev)}
              title="Click to draft agenda with AI"
              className={`group relative flex-shrink-0 w-48 flex flex-col gap-1.5 p-3.5 rounded-xl border border-black/8 dark:border-white/8 bg-white/70 dark:bg-white/[0.04] hover:border-amber-300 dark:hover:border-amber/40 hover:bg-amber-50/60 dark:hover:bg-amber/[0.07] transition-all text-left ${cardConflict ? conflictCardStyle[cardConflict] : ""}`}
            >
              {/* Conflict badge */}
              {cardConflict && (
                <span className={`flex items-center gap-0.5 text-[9.5px] font-semibold ${conflictBadge[cardConflict]}`}>
                  <AlertTriangle size={8} />
                  {conflictLabel[cardConflict]}
                </span>
              )}

              {/* Time row */}
              <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-black/45 dark:text-white/40">
                <Clock size={9} className="flex-shrink-0" />
                {ev.is_all_day ? (
                  <span>All day</span>
                ) : (
                  <span>{ev.start_formatted}–{ev.end_formatted}</span>
                )}
                {!ev.is_all_day && (
                  <span className="ml-auto text-[10px] text-black/30 dark:text-white/25 bg-black/5 dark:bg-white/5 px-1.5 rounded-full">
                    {durationLabel(ev.duration_minutes)}
                  </span>
                )}
              </div>

              {/* Title */}
              <p className="text-[13px] font-semibold text-black/80 dark:text-white/80 leading-snug line-clamp-2 group-hover:text-amber-900 dark:group-hover:text-amber transition-colors">
                {ev.title}
              </p>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-auto">
                {ev.attendee_count > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-black/35 dark:text-white/30">
                    <Users size={9} />
                    {ev.attendee_count}
                  </span>
                )}
                {ev.meet_link && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-500/70 dark:text-blue-400/60">
                    <Video size={9} />
                    Meet
                  </span>
                )}
                <span className="ml-auto text-[9.5px] text-amber-500/60 dark:text-amber/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                  Draft agenda <ChevronRight size={8} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
