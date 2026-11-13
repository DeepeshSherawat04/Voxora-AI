// frontend/src/components/SummaryPanel.jsx
// Right-hand panel. Three states:
//   idle     → short explanation of what appears here
//   in call  → live insights (buying intent, sentiment, topic)
//   ended    → AI summary, sales status, requirements, objections, next steps
import { CirclePlay, ClipboardList, Flag, ListChecks, MessageCircleQuestion, Sparkles } from "lucide-react";
import { STATUSES } from "../lib/status";
import { fmtClock } from "../lib/format";
import { sentimentTone } from "../lib/statusTheme";
import { EmptyState, PanelHeader, StatusBadge, TonePill } from "./ui";

/** Accepts a string (one item per line) or an array, returns clean items. */
function toItems(v) {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/\r?\n+/) : [];
  return raw.map((s) => s.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim()).filter(Boolean);
}

function Section({ icon: Icon, title, value }) {
  const items = toItems(value);
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
        <Icon className="size-4 text-violet-600" strokeWidth={1.75} />
        {title}
      </h3>
      {items.length > 1 ? (
        <ul className="mt-2 space-y-1.5 pl-1">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-zinc-700">
              <span aria-hidden className="mt-[0.6rem] size-1 shrink-0 rounded-full bg-zinc-400" />
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">
          {items[0] || <span className="text-zinc-400">—</span>}
        </p>
      )}
    </div>
  );
}

const intentLabel = (n) => (n >= 67 ? "High" : n >= 34 ? "Medium" : "Low");

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-zinc-950">{children}</dd>
    </div>
  );
}

function LiveInsights({ live, customerName, consent }) {
  const intent = Math.min(100, Math.max(0, Number(live?.buying_intent) || 0));
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      <div className="surface-quiet p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500">Buying intent</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950">{intent}%</p>
          </div>
          <TonePill tone={intent >= 67 ? "success" : intent >= 34 ? "warning" : "neutral"}>
            {intentLabel(intent)}
          </TonePill>
        </div>
        {/* scaleX instead of width: animates on the GPU, no layout work */}
        <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="bg-brand-gradient h-full w-full origin-left rounded-full transition-transform duration-700 ease-out-expo"
            style={{ transform: `scaleX(${intent / 100})` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="surface-quiet p-3.5">
          <p className="text-xs font-medium text-zinc-500">Sentiment</p>
          <div className="mt-2">
            {live?.sentiment ? (
              <TonePill tone={sentimentTone(live.sentiment)} className="capitalize">
                {live.sentiment}
              </TonePill>
            ) : (
              <span className="text-sm text-zinc-400">—</span>
            )}
          </div>
        </div>
        <div className="surface-quiet p-3.5">
          <p className="text-xs font-medium text-zinc-500">Topic</p>
          <p className="mt-2 break-words text-sm font-medium capitalize leading-snug text-zinc-950">
            {live?.topic || <span className="font-normal text-zinc-400">—</span>}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 px-4">
        <h3 className="border-b border-zinc-100 py-3 text-sm font-semibold text-zinc-950">Call details</h3>
        <dl className="divide-y divide-zinc-100">
          <DetailRow label="Customer">{customerName || "—"}</DetailRow>
          <DetailRow label="Language">English + Hinglish</DetailRow>
          <DetailRow label="Recording">{consent ? "On · consent given" : "Off · no consent"}</DetailRow>
        </dl>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        These update as the conversation goes on. The full summary appears when you end the call.
      </p>
    </div>
  );
}

function Summary({ ended }) {
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
      {/* Status: the matching one lights up in its own colour */}
      <div className="animate-reveal" style={{ "--i": 0 }}>
        <p className="text-xs font-medium text-zinc-500">Sales status</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {STATUSES.map((s) =>
            s === ended.sales_status ? (
              <StatusBadge key={s} status={s} className="shadow-sm" />
            ) : (
              <span
                key={s}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200"
              >
                {s}
              </span>
            )
          )}
        </div>
      </div>

      <div className="surface-quiet animate-reveal p-4" style={{ "--i": 1 }}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
          <Sparkles className="size-4 text-violet-600" strokeWidth={1.75} />
          Summary
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{ended.summary?.summary || "—"}</p>
      </div>

      <div className="animate-reveal space-y-5" style={{ "--i": 2 }}>
        <Section icon={ListChecks} title="Requirements" value={ended.summary?.requirements} />
        <Section icon={MessageCircleQuestion} title="Objections" value={ended.summary?.objections} />
        <Section icon={Flag} title="Next steps" value={ended.summary?.next_steps} />
      </div>

      <div className="animate-reveal flex items-center gap-3 rounded-lg border border-zinc-200 p-3.5" style={{ "--i": 3 }}>
        <CirclePlay className="size-9 shrink-0 text-zinc-400" strokeWidth={1.25} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-950">Call recording</p>
          <p className="text-xs text-zinc-500">Attaches automatically after the call.</p>
        </div>
        <span className="text-xs tabular-nums text-zinc-500">{fmtClock(ended.duration_seconds)}</span>
      </div>
    </div>
  );
}

export default function SummaryPanel({ ended, live, phase, customerName, consent }) {
  const inCall = phase === "in_call";
  // Once the summary exists it always wins, even if a new call is being set up.
  const mode = ended && !inCall ? "ended" : inCall ? "live" : "idle";

  return (
    <div className="card flex h-[560px] flex-col overflow-hidden xl:h-full">
      <PanelHeader
        title={mode === "live" ? "Live insights" : "AI summary"}
        right={
          mode === "ended" ? (
            <span className="animate-fade-up inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20">
              <Sparkles className="size-3" />
              Auto-generated
            </span>
          ) : undefined
        }
      />

      {mode === "ended" && <Summary ended={ended} />}
      {mode === "live" && <LiveInsights live={live} customerName={customerName} consent={consent} />}
      {mode === "idle" && (
        <EmptyState icon={ClipboardList} title="Nothing to summarise yet" className="flex-1">
          End the call and the summary, status and next steps will appear here.
        </EmptyState>
      )}
    </div>
  );
}
