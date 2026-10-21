// TranscriptPanel.jsx
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

const fmtTs = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function TranscriptPanel({ transcript, phase, customerName, typing, onSend }) {
  const bottomRef = useRef(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length, typing]);

  const submit = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-200 shadow-xl flex flex-col h-[620px]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className="font-bold">Live Transcript</h3>
          {phase === "in_call" && (
            <span className="text-[10px] font-bold text-red-600 bg-red-100 rounded-md px-1.5 py-0.5">LIVE</span>
          )}
        </div>
        <span className="text-xs bg-purple-50 text-purple-600 rounded-full px-2.5 py-1 font-medium">
          Auto-detected: English + Hinglish
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {transcript.length === 0 && (
          <p className="text-center text-sm text-slate-400 mt-24">Start a call to see the live transcript…</p>
        )}
        {transcript.map((m, i) =>
          m.sender === "ai" ? (
            <div key={i} className="animate-fade-up">
              <p className="text-[11px] text-slate-400 mb-1">Aria · {fmtTs(m.timestamp)}</p>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-purple-50 border border-purple-100 px-4 py-2.5 text-sm text-slate-700">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-end animate-fade-up">
              <p className="text-[11px] text-slate-400 mb-1">{customerName} · {fmtTs(m.timestamp)}</p>
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-white border border-slate-200 px-4 py-2.5 text-sm text-slate-700 shadow-sm">
                {m.text}
              </div>
            </div>
          )
        )}
        {typing && (
          <div className="flex items-center gap-2 text-purple-500 text-xs font-medium">
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                  style={{ animationDelay: `${d * 0.15}s` }} />
              ))}
            </span>
            Aria is typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {phase === "in_call" && (
        <form onSubmit={submit} className="p-3 border-t border-slate-100 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a reply (or just speak)…"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
          <button className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700">
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}