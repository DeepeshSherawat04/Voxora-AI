// frontend/src/components/AdminPage.jsx
// Email approvals. Rendered inside the app shell (sidebar + top bar), not as its own page.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Inbox, Lock, Mail, MessageSquare, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../auth";
import { fmtFull, fmtClock } from "../lib/format";
import { Avatar, ChatBubble, EmptyState, TonePill } from "./ui";

const POLL_MS = 6000;

// apiFetch may return a Response or parsed JSON; handle both.
async function request(apiFetch, path, opts) {
  const res = await apiFetch(path, opts);
  if (res && typeof res.json === "function") {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    return data;
  }
  return res;
}

const STATUS = {
  waiting_for_approval: ["Pending", "warning"],
  sent: ["Sent", "success"],
  rejected: ["Rejected", "danger"],
  blocked_security: ["Blocked", "danger"],
  needs_manual: ["Manual", "info"],
  skipped: ["Skipped", "neutral"],
};
const chip = (s) => STATUS[s] || ["Working…", "neutral"];

// Who the follow-up goes to: the draft while pending, or the "email sent to" event afterwards.
const recipientOf = (f) => {
  if (f?.draft?.to_email) return f.draft.to_email;
  const ev = (f?.events || []).find((e) => e.startsWith("email sent to "));
  return ev ? ev.replace("email sent to ", "") : "";
};

const Pill = ({ status }) => {
  const [label, tone] = chip(status);
  return <TonePill tone={tone}>{label}</TonePill>;
};

const Field = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-zinc-950">{children || <span className="text-zinc-400">—</span>}</dd>
  </div>
);

function CardTitle({ icon: Icon, children, right }) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3.5">
      <Icon className="size-4 text-violet-600" strokeWidth={1.75} />
      <h2 className="text-sm font-semibold text-zinc-950">{children}</h2>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

export default function AdminPage({ onBack }) {
  const { apiFetch } = useAuth();
  const [access, setAccess] = useState("checking"); // checking | granted | denied
  const [rows, setRows] = useState([]);
  const [selId, setSelId] = useState(null);
  const [reviewedId, setReviewedId] = useState(null); // call the admin confirmed reading
  const [rejectId, setRejectId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // The server is the real gatekeeper; this only decides what to show.
  useEffect(() => {
    request(apiFetch, "/api/admin/me")
      .then(() => setAccess("granted"))
      .catch(() => setAccess("denied"));
  }, [apiFetch]);

  const load = useCallback(async () => {
    try {
      setRows(await request(apiFetch, "/api/admin/followups"));
    } catch {
      /* keep old rows */
    }
  }, [apiFetch]);

  useEffect(() => {
    if (access !== "granted") return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [access, load]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const pa = a.followup.status === "waiting_for_approval" ? 0 : 1;
        const pb = b.followup.status === "waiting_for_approval" ? 0 : 1;
        return pa - pb || b.call.id - a.call.id;
      }),
    [rows]
  );

  const pendingCount = sorted.filter((r) => r.followup.status === "waiting_for_approval").length;
  const sel = sorted.find((r) => r.call.id === selId) || sorted[0];

  const decide = async (approved) => {
    setBusy(true);
    setError(null);
    try {
      await request(apiFetch, `/api/admin/followups/${sel.call.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, feedback: approved ? "" : feedback }),
      });
      setRejectId(null);
      setFeedback("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /* ───────────── Access check / denied ───────────── */
  if (access !== "granted") {
    return (
      <div className="grid min-h-[50dvh] place-items-center">
        <div className="card animate-fade-up max-w-sm p-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 ring-1 ring-inset ring-red-600/20">
            <Lock className="size-5 text-red-700" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-zinc-950">
            {access === "checking" ? "Checking access…" : "Access denied"}
          </h2>
          {access === "denied" && (
            <p className="mt-1 text-sm text-zinc-500">Only administrators can open this page.</p>
          )}
          <button type="button" onClick={onBack} className="btn btn-secondary mt-5">
            Back to live call
          </button>
        </div>
      </div>
    );
  }

  const c = sel?.call;
  const f = sel?.followup;
  const draft = f?.draft;
  const pending = f?.status === "waiting_for_approval" && draft;
  const reviewed = sel && reviewedId === c.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">Review the full call, then approve or reject the follow-up email.</p>
        <TonePill tone={pendingCount ? "warning" : "neutral"}>{pendingCount} pending</TonePill>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        {/* ---------- queue ---------- */}
        <aside aria-label="Approval queue" className="card overflow-hidden lg:sticky lg:top-24">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-950">Queue</h2>
          </div>
          {sorted.length === 0 ? (
            <EmptyState icon={Inbox} title="No follow-ups yet" className="py-10">
              Drafts will show up here once calls are finished.
            </EmptyState>
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-zinc-100 overflow-y-auto">
              {sorted.map(({ call, followup }) => {
                const active = sel && sel.call.id === call.id;
                return (
                  <li key={call.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setSelId(call.id);
                        setRejectId(null);
                      }}
                      className={`relative w-full px-4 py-3 text-left transition-colors ${
                        active ? "bg-violet-50/70" : "hover:bg-zinc-50"
                      }`}
                    >
                      {active && <span aria-hidden className="bg-brand-gradient absolute inset-y-0 left-0 w-[3px]" />}
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={call.customer_name} size="sm" />
                          <span className="truncate text-sm font-medium text-zinc-950">{call.customer_name}</span>
                        </span>
                        <Pill status={followup.status} />
                      </div>
                      <p className="mt-1.5 truncate pl-[2.375rem] text-xs text-zinc-600">
                        #{call.id} · {recipientOf(followup) || "recipient not recorded"}
                      </p>
                      <p className="pl-[2.375rem] text-[11px] text-zinc-500">{fmtFull(call.started_at)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ---------- detail ---------- */}
        {sel ? (
          <section key={c.id} className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
            {/* conversation */}
            <div className="card animate-fade-up overflow-hidden xl:self-start">
              <CardTitle
                icon={MessageSquare}
                right={<span className="text-xs font-normal text-zinc-500">{c.messages.length} messages</span>}
              >
                Conversation
              </CardTitle>
              <div className="max-h-[640px] space-y-4 overflow-y-auto p-5">
                {c.messages.map((m, i) => {
                  const isAi = m.sender === "ai";
                  return (
                    <ChatBubble
                      key={i}
                      animate={false}
                      isAi={isAi}
                      // "Veer" is the agent's name inside the call
                      name={isAi ? "Veer" : c.customer_name}
                      time={fmtFull(m.at)}
                      text={m.text}
                    />
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              {/* email draft + decision */}
              <div className="card animate-fade-up overflow-hidden" style={{ animationDelay: "120ms" }}>
                <CardTitle icon={Mail} right={<Pill status={f.status} />}>
                  Follow-up email
                </CardTitle>

                <div className="p-5">
                  {pending ? (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                        {draft.fact_check === "passed" ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <ShieldCheck className="size-3.5" /> Fact check passed
                          </span>
                        ) : (
                          <span className="font-medium text-amber-800">Fact check unavailable</span>
                        )}
                        {draft.security_flag === "unknown" && (
                          <span className="font-medium text-amber-800">Security check unavailable</span>
                        )}
                      </div>

                      {draft.security_flag === "warning" && (
                        <div
                          role="alert"
                          className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                        >
                          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                          <span>
                            <b className="font-semibold">Security warning:</b> {draft.security_reason}
                          </span>
                        </div>
                      )}

                      <p className="mt-4 text-xs text-zinc-500">
                        To:{" "}
                        {draft.to_email ? (
                          <span className="font-medium text-zinc-950">{draft.to_email}</span>
                        ) : (
                          <span className="font-semibold text-red-700">no recipient email</span>
                        )}
                      </p>
                      {draft.to_email && draft.to_email.toLowerCase() === (c.owner_email || "").toLowerCase() && (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                          Warning: this is the sales rep's own address, not a customer address. Check it before
                          sending.
                        </p>
                      )}

                      <p className="mt-3 text-sm font-semibold text-zinc-950">{draft.subject}</p>
                      <div className="surface-quiet mt-2 whitespace-pre-wrap p-4 text-sm leading-relaxed text-zinc-800">
                        {draft.body}
                      </div>

                      <label className="mt-4 flex cursor-pointer select-none items-start gap-2.5 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={!!reviewed}
                          onChange={(e) => setReviewedId(e.target.checked ? c.id : null)}
                          className="mt-0.5 size-4 accent-violet-600"
                        />
                        I have read the full conversation and this email.
                      </label>

                      {rejectId === c.id ? (
                        <div className="animate-fade-up mt-4 flex gap-2">
                          <input
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="What should be changed?"
                            aria-label="What should be changed?"
                            className="field min-w-0 flex-1"
                          />
                          <button type="button" disabled={busy} onClick={() => decide(false)} className="btn btn-danger">
                            Confirm
                          </button>
                          <button type="button" onClick={() => setRejectId(null)} className="btn btn-secondary">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 flex gap-2.5">
                          <button
                            type="button"
                            disabled={busy || !reviewed || !draft.to_email}
                            onClick={() => decide(true)}
                            className="btn btn-primary"
                          >
                            <Check className="size-4" /> {busy ? "Sending…" : "Approve & send"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRejectId(c.id)}
                            className="btn btn-secondary hover:!border-red-300 hover:!text-red-700"
                          >
                            <X className="size-4" /> Reject
                          </button>
                        </div>
                      )}
                      {!reviewed && !rejectId && (
                        <p className="mt-2 text-xs text-zinc-500">Tick the box above to enable “Approve & send”.</p>
                      )}
                      {error && (
                        <p role="alert" className="mt-3 text-xs text-red-700">
                          {error}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-1.5 text-sm text-zinc-600">
                      <p>No draft waiting for approval.</p>
                      {(f.events || []).map((e, i) => (
                        <p key={i} className="text-xs text-zinc-500">
                          • {e}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* call details */}
              <div className="card animate-fade-up overflow-hidden" style={{ animationDelay: "120ms" }}>
                <CardTitle icon={Clock}>Call details</CardTitle>
                <div className="p-5">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <Field label="Customer">{c.customer_name}</Field>
                    <Field label="Sales rep (user)">{c.owner_email}</Field>
                    <Field label="Customer email">{recipientOf(f)}</Field>
                    <Field label="Started">{fmtFull(c.started_at)}</Field>
                    <Field label="Duration">{c.duration_seconds == null ? "" : fmtClock(c.duration_seconds)}</Field>
                    <Field label="Status">{c.sales_status}</Field>
                    <Field label="Sentiment">{c.sentiment}</Field>
                    <Field label="Language">{c.language}</Field>
                    <Field label="Recording consent">{c.recording_consent}</Field>
                  </dl>

                  {c.buying_intent != null && (
                    <div className="mt-5">
                      <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        <span>Buying intent</span>
                        <span className="text-sm font-semibold normal-case text-zinc-950">{c.buying_intent}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="bg-brand-gradient h-full w-full origin-left rounded-full transition-transform duration-700 ease-out-expo"
                          style={{ transform: `scaleX(${Math.min(100, Math.max(0, c.buying_intent)) / 100})` }}
                        />
                      </div>
                    </div>
                  )}

                  <dl className="mt-5 space-y-4 border-t border-zinc-100 pt-5">
                    <Field label="AI summary">{c.summary}</Field>
                    <Field label="Requirements">{c.requirements}</Field>
                    <Field label="Objections">{c.objections}</Field>
                    <Field label="Next steps">{c.next_steps}</Field>
                  </dl>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="card">
            <EmptyState icon={Inbox} title="Nothing to review" className="py-20">
              When a call has a follow-up draft, you can review and approve it here.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
