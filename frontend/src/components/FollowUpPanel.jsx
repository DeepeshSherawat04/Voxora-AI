// frontend/src/components/FollowUpPanel.jsx
// NOTE: App.jsx does not render this panel (approvals happen in the admin page).
// It is restyled so it matches the rest of the app if you mount it again.
import { useCallback, useEffect, useState } from "react";
import { Check, X, MailPlus, Clock, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth";

const OUTCOME_LABELS = {
  sent: "✓ Email sent",
  skipped: "No follow-up needed",
  rejected: "Rejected by human",
  needs_manual: "Needs manual follow-up",
  blocked_security: "Blocked (security)",
  running: "Working on it…",
};

const MAX_CALLS = 10; // only look at the most recent calls
const POLL_MS = 6000; // the draft takes 20-40s, so we keep checking

// Shared control styles
const INPUT =
  "min-w-0 h-9 rounded-lg border border-zinc-300 bg-white px-3 text-xs text-zinc-950 placeholder:text-zinc-500 transition duration-150 hover:border-zinc-400 focus:border-violet-600 focus:outline-none focus:ring-3 focus:ring-violet-600/20";
const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";
const BTN_PRIMARY = `${BTN} bg-brand-gradient text-white shadow-sm hover:brightness-110`;
const BTN_APPROVE = `${BTN} bg-zinc-950 text-white hover:bg-zinc-800`;
const BTN_DANGER = `${BTN} bg-red-600 text-white hover:bg-red-700`;
const BTN_GHOST = `${BTN} border border-zinc-300 bg-white text-zinc-700 hover:border-red-300 hover:text-red-700`;

// apiFetch may return a Response or already-parsed JSON; handle both.
async function request(apiFetch, path, opts) {
  const res = await apiFetch(path, opts);
  if (res && typeof res.json === "function") {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }
  return res;
}

export default function FollowUpPanel({ refreshKey }) {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [emails, setEmails] = useState({}); // manual-start email per call id
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const calls = await request(apiFetch, "/api/calls");
      const recent = (Array.isArray(calls) ? calls : [])
        .slice()
        .sort((a, b) => b.id - a.id)
        .slice(0, MAX_CALLS)
        .filter((c) => c.sales_status !== "No Response");

      const rows = await Promise.all(
        recent.map(async (call) => {
          try {
            const status = await request(apiFetch, `/api/agents/followup/${call.id}`);
            return { call, status };
          } catch {
            return { call, status: { status: "not_found" } }; // no follow-up yet
          }
        })
      );

      // show: calls that have a follow-up, plus "Follow-up Required" calls without one
      const next = rows.filter(
        (r) => r.status.status !== "not_found" || r.call.sales_status === "Follow-up Required"
      );
      // Keep the same state object if nothing changed, so a poll doesn't trigger a re-render.
      setItems((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch {
      /* keep the previous items on a temporary error */
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Poll only while the tab is visible, and catch up when the user returns.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) load();
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const patch = (id, status) =>
    setItems((its) => its.map((it) => (it.call.id === id ? { ...it, status } : it)));

  const start = async (call) => {
    setBusy(call.id);
    setError(null);
    try {
      const d = await request(apiFetch, `/api/calls/${call.id}`);
      // "Veer" is the agent's name inside the call, so the draft-writing agent must see it unchanged.
      const transcript = (d.messages || [])
        .map((m) => `${m.sender === "ai" ? "Veer" : d.customer_name || "Customer"}: ${m.text}`)
        .join("\n");
      const status = await request(apiFetch, "/api/agents/followup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: String(call.id),
          customer_name: call.customer_name,
          transcript,
          customer_email: (emails[call.id] || "").trim(),
        }),
      });
      patch(call.id, status);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const decide = async (callId, approved) => {
    setBusy(callId);
    setError(null);
    try {
      const status = await request(apiFetch, `/api/agents/followup/${callId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, feedback: approved ? "" : feedback }),
      });
      patch(callId, status);
      setRejecting(null);
      setFeedback("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="card animate-fade-up mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
          <Clock className="size-4 text-violet-600" /> Follow-ups
        </h3>
        <span className="text-xs text-zinc-500">
          {items.length} {items.length === 1 ? "call" : "calls"}
        </span>
      </div>

      <ul className="divide-y divide-zinc-100">
        {items.map(({ call, status }) => (
          <li key={call.id} className="px-5 py-4">
            <p className="text-sm font-medium text-zinc-950">
              {call.customer_name}
              <span className="ml-2 text-xs font-normal text-zinc-500">Call #{call.id}</span>
            </p>

            {status.status === "not_found" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={emails[call.id] || ""}
                  onChange={(e) => setEmails((m) => ({ ...m, [call.id]: e.target.value }))}
                  placeholder="Customer email"
                  aria-label={`Email for ${call.customer_name}`}
                  className={INPUT}
                />
                <button disabled={busy === call.id} onClick={() => start(call)} className={BTN_PRIMARY}>
                  <MailPlus className="size-3.5" />
                  {busy === call.id ? "Writing draft…" : "Generate follow-up email"}
                </button>
              </div>
            )}

            {status.status === "waiting_for_approval" && status.draft && (
              <>
                {status.draft.security_flag === "warning" && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                  >
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <b className="font-semibold">Security warning:</b> {status.draft.security_reason}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                  {status.draft.fact_check === "passed" ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                      <ShieldCheck className="size-3.5" /> Fact check passed
                    </span>
                  ) : (
                    <span className="font-medium text-amber-800">Fact check unavailable. Verify facts yourself.</span>
                  )}
                  {status.draft.security_flag === "unknown" && (
                    <span className="font-medium text-amber-800">Security check unavailable. Review carefully.</span>
                  )}
                  {status.draft.to_email ? (
                    <span className="text-zinc-600">To: {status.draft.to_email}</span>
                  ) : (
                    <span className="font-semibold text-red-700">No recipient email on file</span>
                  )}
                </div>

                <p className="mt-3 text-sm font-semibold text-zinc-950">{status.draft.subject}</p>
                <div className="surface-quiet mt-2 whitespace-pre-wrap p-3.5 text-sm leading-relaxed text-zinc-800">
                  {status.draft.body}
                </div>

                {rejecting === call.id ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="What should be changed?"
                      aria-label="What should be changed?"
                      className={`${INPUT} flex-1`}
                    />
                    <button disabled={busy === call.id} onClick={() => decide(call.id, false)} className={BTN_DANGER}>
                      Confirm reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busy === call.id || !status.draft.to_email}
                      onClick={() => decide(call.id, true)}
                      className={BTN_APPROVE}
                    >
                      <Check className="size-3.5" /> Approve &amp; send
                    </button>
                    <button disabled={busy === call.id} onClick={() => setRejecting(call.id)} className={BTN_GHOST}>
                      <X className="size-3.5" /> Reject
                    </button>
                  </div>
                )}
              </>
            )}

            {status.status !== "not_found" && status.status !== "waiting_for_approval" && (
              <p className={`mt-2 text-xs ${status.status === "sent" ? "font-medium text-emerald-700" : "text-zinc-500"}`}>
                {OUTCOME_LABELS[status.status] || `Follow-up ${status.status}`}
              </p>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="px-5 pb-4 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
