// SummaryPanel.jsx
import { Sparkles, CirclePlay } from "lucide-react";

const STATUSES = ["Converted", "Interested", "Follow-up Required",
                  "Not Interested", "Demo Requested", "No Response"];

const COLORS = {
  "Converted": "bg-green-100 text-green-700",
  "Interested": "bg-purple-600 text-white",
  "Follow-up Required": "bg-amber-100 text-amber-700",
  "Not Interested": "bg-red-100 text-red-700",
  "Demo Requested": "bg-blue-100 text-blue-700",
  "No Response": "bg-slate-100 text-slate-500",
};

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function Section({ title, text }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-purple-700">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{text || "—"}</p>
    </div>
  );
}

export default function SummaryPanel({ ended }) {
  return (
    <div className="rounded-3xl bg-white border border-slate-200 shadow-xl p-5 h-[620px] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">AI Summary</h3>
        {ended && (
          <span className="text-[10px] font-bold text-white bg-gradient-to-r from-purple-600 to-blue-500 rounded-full px-2.5 py-1">
            Auto-generated
          </span>
        )}
      </div>

      {!ended ? (
        <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-slate-400 -mt-6">
          <Sparkles className="w-10 h-10 text-purple-300" />
          <p className="text-sm">
            End the call and Aria will write<br />the summary, status and next steps here.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-[11px] font-bold tracking-wider text-slate-400">SALES STATUS</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <span key={s}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  s === ended.sales_status
                    ? "bg-purple-600 text-white shadow"
                    : "bg-white border border-slate-200 text-slate-500"}`}>
                {s}
              </span>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-purple-50/70 border border-purple-100 p-4 text-sm text-slate-700">
            {ended.summary.summary}
          </div>

          <Section title="Requirements" text={ended.summary.requirements} />
          <Section title="Objections" text={ended.summary.objections} />
          <Section title="Next steps" text={ended.summary.next_steps} />

          <div className="mt-5 rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
            <CirclePlay className="w-9 h-9 text-purple-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Call recording</p>
              <p className="text-xs text-slate-400">Attaches automatically after the call (Stage 5).</p>
            </div>
            <span className="text-xs text-slate-400 tabular-nums">{fmt(ended.duration_seconds)}</span>
          </div>
        </>
      )}
    </div>
  );
}