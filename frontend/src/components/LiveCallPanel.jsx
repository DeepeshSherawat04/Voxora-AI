// frontend/src/components/LiveCallPanel.jsx
import { useState } from "react";
import { Bot, Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from "lucide-react";

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function LiveCallPanel({ phase, elapsed, live, customerName, consent,
                                        muted, error, hasVoice,
                                        onStart, onEnd, onToggleMute }) {
  const [name, setName] = useState("Rahul Verma");
  const [agree, setAgree] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);

  if (phase !== "in_call") {
    return (
      <div className="rounded-3xl bg-white/70 backdrop-blur border border-purple-100 shadow-xl p-6 h-[620px] flex flex-col items-center justify-center text-center gap-4">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-300">
          <Phone className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {phase === "ended" ? "Start a new call" : "Start a sales call"}
          </h2>
          <p className="text-sm text-slate-500 mt-1">Aria will pitch CloudDesk CRM live.</p>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name"
          className="w-full max-w-xs rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
        <label className="flex items-start gap-2 text-xs text-slate-500 text-left max-w-xs">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 accent-purple-600" />
          <span>The customer consents to this call being recorded for quality and training purposes.</span>
        </label>
        <button disabled={!agree || phase === "connecting"}
          onClick={() => onStart({ name: name.trim() || "Customer", consent: agree })}
          className="rounded-full px-8 py-3 font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-200 hover:opacity-95 disabled:opacity-50">
          {phase === "connecting" ? "Connecting…" : "Start Call"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {!hasVoice && (
          <p className="text-xs text-amber-600 max-w-xs">
            Voice input isn't supported in this browser — you can still type replies during the call. Use Chrome/Edge for full voice.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-gradient-to-b from-purple-100/80 to-blue-100/60 border border-purple-100 shadow-xl p-6 h-[620px] overflow-y-auto flex flex-col items-center">
      <div className="flex items-center justify-between self-stretch">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-700">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> In Call
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Recording · consent {consent ? "given" : "declined"}
        </span>
      </div>

      <div className="mt-5 text-5xl font-extrabold tracking-tight text-slate-800 tabular-nums">
        {fmt(elapsed)}
      </div>

      <div className="relative my-7">
        {live.speaking && <div className="absolute inset-0 rounded-full bg-purple-400/40 animate-ping" />}
        <div className="w-36 h-36 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center shadow-2xl shadow-purple-300 ring-8 ring-purple-200/60">
          <Bot className="w-14 h-14 text-white" />
        </div>
      </div>

      <div className="flex items-end gap-[3px] h-8">
        {Array.from({ length: 28 }).map((_, i) => (
          <span key={i} className="w-1 rounded-full bg-gradient-to-t from-purple-500 to-blue-400 animate-eq"
            style={{ animationDelay: `${(i % 7) * 0.13}s`, height: `${10 + ((i * 7) % 22)}px` }} />
        ))}
      </div>

      <p className="mt-3 text-sm text-slate-600">
        <span className="font-semibold text-slate-800">
          {live.speaking ? "Aria is speaking" : muted ? "Microphone muted" : "Listening…"}
        </span>
        {" · talking to "}{customerName}
      </p>

      <div className="mt-6 flex items-center gap-6">
        <button onClick={onToggleMute} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800">
          <span className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center">
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </span>
          <span className="text-xs">{muted ? "Unmute" : "Mute"}</span>
        </button>
        <button onClick={onEnd} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800">
          <span className="w-16 h-16 rounded-full bg-red-500 shadow-lg shadow-red-200 flex items-center justify-center hover:bg-red-600">
            <PhoneOff className="w-7 h-7 text-white" />
          </span>
          <span className="text-xs">End Call</span>
        </button>
        <button onClick={() => setSpeakerOn((s) => !s)} className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-800">
          <span className="w-12 h-12 rounded-full bg-white shadow flex items-center justify-center">
            {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </span>
          <span className="text-xs">Speaker</span>
        </button>
      </div>

      <div className="mt-8 w-full rounded-2xl bg-white/80 p-4">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="tracking-wider text-slate-500">LIVE BUYING INTENT</span>
          <span className="text-purple-700 text-base">{live.buying_intent}%</span>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-600 transition-all duration-700"
            style={{ width: `${live.buying_intent}%` }} />
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <span className="rounded-full bg-green-100 text-green-700 px-3 py-1 text-xs font-medium">
            Sentiment: {live.sentiment}
          </span>
          <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-medium">
            Topic: {live.topic}
          </span>
        </div>
      </div>
    </div>
  );
}