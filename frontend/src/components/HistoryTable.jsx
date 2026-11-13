// frontend/src/components/HistoryTable.jsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock, ChevronLeft, ChevronRight, Clock, Eye, PhoneCall, Play, Search, Timer, X,
} from "lucide-react";
import { useAuth } from "../auth";
import { fmtClock, fmtDateTime, fmtDuration, fmtFull } from "../lib/format";
import { Avatar, ChatBubble, EmptyState, StatusBadge } from "./ui";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const RECORDINGS = API_BASE;
const PAGE_SIZE = 10; // rows in the DOM at once

const COLUMNS = ["Customer", "Date & time", "Duration", "Status", "AI summary", "Recording", ""];

/* ───────────── Summary cards ───────────── */

function Kpi({ icon: Icon, label, value, loaded }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-zinc-500">{label}</p>
        {loaded ? (
          <p className="mt-0.5 truncate text-xl font-semibold tabular-nums tracking-tight text-zinc-950">{value}</p>
        ) : (
          <div className="mt-1.5 h-6 w-16 animate-pulse rounded bg-zinc-100" />
        )}
      </div>
    </div>
  );
}

/* ───────────── One table row ───────────── */

/** Memoized so paging/playing doesn't re-render every row. */
const Row = memo(function Row({ c, playing, onPlay, onView }) {
  return (
    <tr className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={c.customer_name} size="sm" />
          <span className="max-w-[12rem] truncate font-medium text-zinc-950">{c.customer_name}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-zinc-600">{fmtDateTime(c.started_at)}</td>
      <td className="px-4 py-3.5 tabular-nums text-zinc-600">{fmtClock(c.duration_seconds)}</td>
      <td className="px-4 py-3.5">
        {c.sales_status ? (
          <StatusBadge status={c.sales_status} />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="size-1.5 rounded-full bg-zinc-400" />
            In call
          </span>
        )}
      </td>
      <td className="w-full min-w-[180px] max-w-0 truncate px-4 py-3.5 text-zinc-600" title={c.summary || undefined}>
        {c.summary || <span className="text-zinc-400">—</span>}
      </td>
      <td className="px-4 py-3.5">
        {c.recording_url ? (
          playing ? (
            // Only the row being played loads an <audio> element.
            <audio
              controls
              autoPlay
              preload="metadata"
              src={`${RECORDINGS}${c.recording_url}`}
              onEnded={() => onPlay(null)}
              className="h-8 w-44"
            />
          ) : (
            <button
              type="button"
              onClick={() => onPlay(c.id)}
              aria-label={`Play recording for ${c.customer_name}`}
              className="btn btn-secondary btn-sm"
            >
              <Play className="size-3" fill="currentColor" /> Play
            </button>
          )
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <button
          type="button"
          onClick={() => onView(c.id)}
          aria-label={`View transcript for ${c.customer_name}`}
          className="btn btn-secondary btn-sm"
        >
          <Eye className="size-3.5" /> View
        </button>
      </td>
    </tr>
  );
});

function SkeletonRows() {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i}>
      <td colSpan={COLUMNS.length} className="px-5 py-3">
        <div className="h-8 animate-pulse rounded-md bg-zinc-100" />
      </td>
    </tr>
  ));
}

/* ───────────── Transcript drawer ───────────── */

function TranscriptDrawer({ detail, fallbackSummary, onClose }) {
  const closeRef = useRef(null);
  const summary = typeof detail.summary === "string" && detail.summary ? detail.summary : fallbackSummary;

  // Escape closes it, and focus starts on the close button.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal: the page wrapper fades in, which would trap a fixed overlay beneath the sticky top bar.
  return createPortal(
    <div className="animate-view-in fixed inset-0 z-50 flex justify-end bg-zinc-950/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Transcript with ${detail.customer_name}`}
        className="animate-slide-in flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={detail.customer_name} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-zinc-950">{detail.customer_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>{fmtFull(detail.started_at)}</span>
                {detail.sales_status ? <StatusBadge status={detail.sales_status} /> : <span>In call</span>}
              </div>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close transcript" className="btn-icon shrink-0">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {summary && (
            <div className="surface-quiet mb-6 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI summary</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{summary}</p>
            </div>
          )}

          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Transcript</p>
          <div className="space-y-4">
            {detail.messages?.map((m, i) => {
              const isAi = m.sender === "ai";
              return (
                <ChatBubble
                  key={i}
                  animate={false}
                  isAi={isAi}
                  name={isAi ? "Voxora AI" : detail.customer_name}
                  time={fmtDateTime(m.timestamp)}
                  text={m.text}
                />
              );
            })}
            {!detail.messages?.length && <p className="text-sm text-zinc-500">No messages were recorded for this call.</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ───────────── Page ───────────── */

export default function HistoryTable({ refreshKey }) {
  const { apiFetch } = useAuth();
  const [calls, setCalls] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(0);
  const [playingId, setPlayingId] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/calls")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setCalls(Array.isArray(d) ? d : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, apiFetch]);

  const viewTranscript = useCallback(
    async (id) => {
      try {
        const r = await apiFetch(`/api/calls/${id}`);
        if (r.ok) setDetail(await r.json());
      } catch {
        /* leave the table as is */
      }
    },
    [apiFetch]
  );
  const closeDetail = useCallback(() => setDetail(null), []);

  const stats = useMemo(() => {
    const talk = calls.reduce((n, c) => n + (Number(c.duration_seconds) || 0), 0);
    return {
      total: calls.length,
      talk,
      avg: calls.length ? talk / calls.length : 0,
      followUps: calls.filter((c) => /follow/i.test(c.sales_status || "")).length,
    };
  }, [calls]);

  const statusOptions = useMemo(
    () => [...new Set(calls.map((c) => c.sales_status).filter(Boolean))].sort(),
    [calls]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return calls.filter(
      (c) =>
        (statusFilter === "all" || c.sales_status === statusFilter) &&
        (!q ||
          (c.customer_name || "").toLowerCase().includes(q) ||
          (c.summary || "").toLowerCase().includes(q))
    );
  }, [calls, query, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  const filtering = query.trim() !== "" || statusFilter !== "all";

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={PhoneCall} label="Total calls" value={stats.total} loaded={loaded} />
        <Kpi icon={Timer} label="Total talk time" value={fmtDuration(stats.talk)} loaded={loaded} />
        <Kpi icon={Clock} label="Average duration" value={fmtDuration(stats.avg)} loaded={loaded} />
        <Kpi icon={CalendarClock} label="Follow-ups required" value={stats.followUps} loaded={loaded} />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">All calls</h2>
            <p className="text-xs text-zinc-500">Your calls, newest first.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-64">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search customer or summary"
                aria-label="Search calls"
                className="field !pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              aria-label="Filter by status"
              className="field sm:w-48"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                {COLUMNS.map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-3 font-medium">
                    {h || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loaded && <SkeletonRows />}
              {loaded && visible.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length}>
                    <EmptyState
                      icon={filtering ? Search : PhoneCall}
                      title={filtering ? "No calls match your filters" : "No calls yet"}
                      className="py-14"
                    >
                      {filtering ? "Try a different search or status." : "Start one from the Live call page."}
                    </EmptyState>
                  </td>
                </tr>
              )}
              {visible.map((c) => (
                <Row key={c.id} c={c} playing={playingId === c.id} onPlay={setPlayingId} onView={viewTranscript} />
              ))}
            </tbody>
          </table>
        </div>

        {loaded && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-xs text-zinc-600">
            <span className="tabular-nums">
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
              {filtering && calls.length !== filtered.length ? ` (filtered from ${calls.length})` : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous page"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className="btn-icon !size-8"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className="btn-icon !size-8"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <TranscriptDrawer
          detail={detail}
          fallbackSummary={calls.find((c) => c.id === detail.id)?.summary}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}
