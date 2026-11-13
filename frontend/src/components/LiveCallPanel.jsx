// frontend/src/components/LiveCallPanel.jsx
import { useId, useState } from "react";
import { Bot, Check, Loader2, Mic, MicOff, Phone, PhoneOff, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { fmtClock } from "../lib/format";
import { Avatar, PanelHeader, TonePill } from "./ui";

// Computed once, not on every render.
const BARS = Array.from({ length: 26 }, (_, i) => ({
  delay: (i % 7) * 0.13,
  height: 10 + ((i * 7) % 22),
}));

/** Panel shell. Changing `key` remounts it, which replays the fade between idle and in-call. */
function Shell({ children }) {
  return <div className="card animate-view-in flex h-[560px] flex-col overflow-hidden xl:h-full">{children}</div>;
}

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function ControlButton({ label, onClick, active = false, pressed, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition active:translate-y-px ${
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

export default function LiveCallPanel({
  phase, elapsed, live, customerName, consent,
  muted, error, hasVoice, speakerOn,
  onStart, onEnd, onToggleMute, onToggleSpeaker,
}) {
  const uid = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);

  /* ───────────── Idle / connecting / ended ───────────── */
  if (phase !== "in_call") {
    const connecting = phase === "connecting";
    return (
      <Shell key="idle">
        <PanelHeader
          title={phase === "ended" ? "Start a new call" : "Start a sales call"}
          description="Enter the customer's details to begin."
          right={
            <span className="bg-brand-gradient grid size-8 place-items-center rounded-lg text-white shadow-sm">
              <Phone className="size-4" strokeWidth={2} />
            </span>
          }
        />

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (connecting) return;
            onStart({ name: name.trim() || "Customer", consent: agree, email: email.trim() });
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <Field id={`${uid}-name`} label="Customer name">
              <input
                id={`${uid}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Verma"
                autoComplete="off"
                className="field"
              />
            </Field>

            <Field id={`${uid}-email`} label="Customer email" hint="Used to draft the follow-up email after the call.">
              <input
                id={`${uid}-email`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                type="email"
                autoComplete="off"
                className="field"
              />
            </Field>

            <label className="flex cursor-pointer select-none items-start gap-3 rounded-lg border border-zinc-200 p-3.5 text-left transition-colors hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="peer sr-only"
              />
              <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-zinc-400 bg-white transition duration-150 peer-checked:border-violet-600 peer-checked:bg-violet-600 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/50 peer-checked:[&_svg]:scale-100">
                <Check className="size-3 scale-0 text-white transition-transform duration-150" strokeWidth={3} />
              </span>
              <span className="text-[13px] leading-relaxed text-zinc-700">
                <span className="block font-medium text-zinc-900">Recording consent</span>
                The customer consents to this call being recorded for quality and training purposes.
              </span>
            </label>

            {!agree && (
              <p className="text-xs leading-relaxed text-zinc-500">
                Without consent, the call is not recorded.
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            )}
            {!hasVoice && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Voice input isn't supported in this browser — you can still type replies during the call. Use
                Chrome or Edge for full voice.
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-200 p-4">
            <button type="submit" disabled={connecting} className="btn btn-primary btn-lg w-full">
              {connecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Connecting…
                </>
              ) : (
                <>
                  <Phone className="size-4" /> Start call
                </>
              )}
            </button>
          </div>
        </form>
      </Shell>
    );
  }

  /* ───────────── In call ───────────── */
  return (
    <Shell key="call">
      <PanelHeader
        title="In call"
        description={`Talking to ${customerName}`}
        right={
          <TonePill tone={consent ? "danger" : "neutral"}>
            {consent ? "Recording" : "Not recording"}
          </TonePill>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Avatar name={customerName} size="sm" dark />
          <span className="max-w-[12rem] truncate text-sm font-medium text-zinc-900">{customerName}</span>
        </div>

        <div className="mt-3 text-5xl font-light tabular-nums tracking-tight text-zinc-950">{fmtClock(elapsed)}</div>

        <div className="relative my-6 grid size-28 shrink-0 place-items-center">
          <span aria-hidden className="absolute inset-0 rounded-full border border-zinc-200" />
          {live.speaking && (
            <>
              <span aria-hidden className="animate-ring absolute inset-0 m-auto size-24 rounded-full border border-violet-400/60" />
              <span
                aria-hidden
                className="animate-ring absolute inset-0 m-auto size-24 rounded-full border border-violet-400/60"
                style={{ animationDelay: "1.1s" }}
              />
            </>
          )}
          <span className="bg-brand-gradient relative grid size-24 place-items-center rounded-full shadow-[0_12px_32px_-12px_rgb(91_75_245/0.7)] ring-1 ring-white/30">
            <Bot className="size-10 text-white" strokeWidth={1.5} />
          </span>
        </div>

        {/* Bars move while the agent speaks, rest otherwise */}
        <div aria-hidden className="flex h-6 items-end gap-[3px]">
          {BARS.map((b, i) => (
            <span
              key={i}
              className={`w-1 origin-bottom rounded-full bg-gradient-to-t from-violet-600 to-cyan-500 ${
                live.speaking ? "animate-eq" : "scale-y-[0.2]"
              }`}
              style={{ animationDelay: `${b.delay}s`, height: `${Math.min(b.height, 24)}px` }}
            />
          ))}
        </div>

        <div className="mt-4 text-center" aria-live="polite">
          <p className="text-sm font-medium text-zinc-950">
            {live.speaking ? "Voxora is speaking" : muted ? "Microphone muted" : "Listening…"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {live.speaking ? "The AI agent has the floor" : muted ? "Unmute to talk" : "Speak when you're ready"}
          </p>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-2.5 border-t border-zinc-200 p-4">
        <ControlButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute} active={muted} pressed={muted}>
          {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </ControlButton>

        <button
          type="button"
          onClick={onEnd}
          className="flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl bg-red-600 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 active:translate-y-px"
        >
          <PhoneOff className="size-5" />
          End call
        </button>

        <ControlButton label="Speaker" onClick={onToggleSpeaker} active={!speakerOn} pressed={!speakerOn}>
          {speakerOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </ControlButton>
      </div>
    </Shell>
  );
}
