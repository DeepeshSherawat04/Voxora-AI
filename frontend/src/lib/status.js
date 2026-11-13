// frontend/src/lib/status.js
// One source of truth for sales-status colours (used by SummaryPanel, and HistoryTable in phase 3).

export const STATUSES = [
  "Converted",
  "Interested",
  "Follow-up Required",
  "Not Interested",
  "Demo Requested",
  "No Response",
];

export const STATUS_STYLES = {
  "Converted": "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
  "Interested": "border-brand-400/40 bg-brand-500/20 text-brand-300",
  "Follow-up Required": "border-amber-400/30 bg-amber-400/15 text-amber-300",
  "Not Interested": "border-red-400/30 bg-red-400/15 text-red-300",
  "Demo Requested": "border-sky-400/30 bg-sky-400/15 text-sky-300",
  "No Response": "border-white/15 bg-white/[0.06] text-white/60",
};

export const statusStyle = (s) => STATUS_STYLES[s] ?? STATUS_STYLES["No Response"];