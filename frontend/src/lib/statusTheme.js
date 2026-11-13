// frontend/src/lib/statusTheme.js
// Light-theme colours for sales statuses and sentiment.
//
// Matches on keywords rather than exact names, so a status added later
// ("Demo Booked", "Hot Lead") still gets a sensible colour instead of breaking.
// lib/status.js still owns the list of statuses (STATUSES); this file only owns colour.

export const TONE_STYLES = {
  success: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  warning: { pill: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-500" },
  danger: { pill: "bg-red-50 text-red-700 ring-red-600/20", dot: "bg-red-500" },
  info: { pill: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500" },
  brand: { pill: "bg-violet-50 text-violet-700 ring-violet-600/20", dot: "bg-violet-500" },
  neutral: { pill: "bg-zinc-100 text-zinc-700 ring-zinc-500/20", dot: "bg-zinc-400" },
};

/** Order matters: "not interested" must be checked before "interested". */
export function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return "neutral";
  if (/(not interested|lost|reject|declin|blocked)/.test(s)) return "danger";
  if (/(no response|skipped|unreach|no answer)/.test(s)) return "neutral";
  if (/(manual)/.test(s)) return "info";
  if (/(follow|callback|call back|pending|waiting)/.test(s)) return "warning";
  if (/(interested|convert|won|closed|qualified|hot|sent|passed)/.test(s)) return "success";
  return "brand";
}

export function sentimentTone(sentiment) {
  const s = String(sentiment || "").toLowerCase();
  if (/(posit|happy|good|satisf)/.test(s)) return "success";
  if (/(negat|angry|upset|frustrat|bad)/.test(s)) return "danger";
  if (/(mixed|uncertain|hesit)/.test(s)) return "warning";
  return "neutral";
}
