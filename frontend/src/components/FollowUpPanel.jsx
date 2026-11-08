// frontend/src/components/FollowUpPanel.jsx
import { useCallback, useEffect, useState } from "react";
import { Check, X, MailPlus, Clock, ShieldAlert, ShieldCheck } from "lucide-react";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api`;
const H = { "X-API-Key": import.meta.env.VITE_API_KEY };

const j = async (r) => {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
  return d;
};

const OUTCOME_LABELS = {
  sent: "✓ Email sent",
  skipped: "No follow-up needed",
  rejected: "Rejected by human",
  needs_manual: "Needs manual follow-up",
  blocked_security: "Blocked (security)",
};

const getTranscript = async (callId) => {
  const d = await fetch(`${API}/calls/${callId}`).then((r) => r.json());
  return (d.messages || [])
    .map((m) => `${m.sender === "ai" ? "Aria" : d.customer_name || "Customer"}: ${m.text}`)
    .join("\n");
};

export default function FollowUpPanel({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const calls = await fetch(`${API}/calls`).then((r) => r.json());
      const needs = (Array.isArray(calls) ? calls : [])
        .filter((c) => c.sales_status === "Follow-up Required");
      setItems(await Promise.all(needs.map(async (call) => {
        const r = await fetch(`${API}/agents/followup/${call.id}`, { headers: H });
        if (r.status === 404) return { call, status: { status: "not_found" } };
        return { call, status: await r.json() };
      })));
    } catch { setItems([]); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const patch = (id, status) =>
    setItems((its) => its.map((it) => (it.call.id === id ? { ...it, status } : it)));

  const start = async (call) => {
    setBusy(call.id); setError(null);
    try {
      const transcript = await getTranscript(call.id);
      const status = await fetch(`${API}/agents/followup/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...H },
        body: JSON.stringify({
          call_id: call.id, customer_name: call.customer_name,
          transcript, customer_email: "",
        }),
      }).then(j);
      patch(call.id, status);
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const decide = async (callId, approved) => {
    setBusy(callId); setError(null);
    try {
      const status = await fetch(`${API}/agents/followup/${callId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...H },
        body: JSON.stringify({ approved, feedback: approved ? "" : feedback }),
      }).then(j);
      patch(callId, status);
      setRejecting(null); setFeedback("");
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  if (items.length === 0) return null;

  return (
    <div className="rounded-3xl bg-white border border-amber-200 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-bold flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-500" /> Follow-ups
        </h3>
        <span className="text-xs text-slate-400">{items.length} call(s) need attention</span>
      </div>
      <ul className="divide-y divide-slate-50">
        {items.map(({ call, status }) => (
          <li key={call.id} className="px-5 py-4">
            <p className="font-semibold text-sm">{call.customer_name}</p>

            {status.status === "not_found" && (
              <button disabled={busy === call.id} onClick={() => start(call)}
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-purple-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-purple-700 disabled:opacity-40">
                <MailPlus className="w-3.5 h-3.5" />
                {busy === call.id ? "Writing draft (LLM running)…" : "Generate follow-up email"}
              </button>
            )}

            {status.status === "waiting_for_approval" && status.draft && (
              <>
                {status.draft.security_flag === "warning" && (
                  <div className="mt-2 flex items-start gap-2 rounded-2xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><b>Security warning:</b> {status.draft.security_reason}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs">
                  {status.draft.fact_check === "passed" ? (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <ShieldCheck className="w-3.5 h-3.5" /> Fact check passed
                    </span>
                  ) : (
                    <span className="text-amber-600">Fact check unavailable — verify facts yourself</span>
                  )}
                  {!status.draft.to_email && (
                    <span className="text-red-600 font-semibold">No recipient email on file</span>
                  )}
                </div>
                <p className="mt-2 text-sm font-bold">{status.draft.subject}</p>
                <div className="mt-1 rounded-2xl bg-purple-50/70 border border-purple-100 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {status.draft.body}
                </div>
                {rejecting === call.id ? (
                  <div className="mt-2 flex gap-2">
                    <input value={feedback} onChange={(e) => setFeedback(e.target.value)}
                      placeholder="What should be changed?"
                      className="flex-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs" />
                    <button disabled={busy === call.id} onClick={() => decide(call.id, false)}
                      className="rounded-full bg-red-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                      Confirm reject
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button disabled={busy === call.id} onClick={() => decide(call.id, true)}
                      className="inline-flex items-center gap-1 rounded-full bg-green-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-green-700 disabled:opacity-40">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button disabled={busy === call.id} onClick={() => setRejecting(call.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 text-slate-600 px-3 py-1.5 text-xs font-semibold hover:border-red-300 hover:text-red-600 disabled:opacity-40">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </>
            )}

            {status.status !== "not_found" && status.status !== "waiting_for_approval" && (
              <p className="mt-2 text-xs text-slate-400">
                {OUTCOME_LABELS[status.status] || `Follow-up ${status.status}`}
              </p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="px-5 pb-4 text-xs text-red-600">{error}</p>}
    </div>
  );
}