// frontend/src/lib/format.js
// Shared formatters. Intl instances are created once, not per cell or per message.

/** 134 → "02:14" */
export const fmtClock = (s) => {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

/** 4320 → "1h 12m", 500 → "8m 20s", 0 → "0s" */
export const fmtDuration = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
};

const dateTime = new Intl.DateTimeFormat([], {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeOnly = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" });
const full = new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" });

const valid = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDateTime = (iso) => {
  const d = valid(iso);
  return d ? dateTime.format(d) : "—";
};
export const fmtTime = (iso) => {
  const d = valid(iso);
  return d ? timeOnly.format(d) : "";
};
export const fmtFull = (iso) => {
  const d = iso ? valid(iso) : null;
  return d ? full.format(d) : "—";
};

/** "Rahul Verma" → "RV" */
export const initialsOf = (name) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
