// frontend/src/components/TranscriptPanel.jsx
import { memo, useEffect, useRef, useState } from "react";
import { Languages, MessagesSquare, Send } from "lucide-react";
import { fmtTime } from "../lib/format";
import { ChatBubble, EmptyState, PanelHeader } from "./ui";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2.5 px-1 text-xs font-medium text-violet-700" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="size-1.5 animate-bounce rounded-full bg-violet-500"
            style={{ animationDelay: `${d * 0.15}s` }}
          />
        ))}
      </span>
      Voxora is typing…
    </div>
  );
}

function TranscriptPanel({ transcript, phase, customerName, typing, onSend }) {
  const scrollRef = useRef(null);
  const stickRef = useRef(true); // true while the user is reading the latest messages
  const [draft, setDraft] = useState("");

  // Don't yank the view down if the user scrolled up to re-read something.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (transcript.length === 0) stickRef.current = true;
    if (stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length, typing]);

  const submit = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    stickRef.current = true;
    onSend(draft);
    setDraft("");
  };

  const inCall = phase === "in_call";

  return (
    <div className="card flex h-[560px] flex-col overflow-hidden xl:h-full">
      <PanelHeader
        title="Live transcript"
        description={transcript.length ? `${transcript.length} message${transcript.length === 1 ? "" : "s"}` : undefined}
        right={
          <div className="flex items-center gap-2">
            {inCall && (
              // Static on purpose: nothing blinks while the customer is talking.
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-500/20 sm:inline-flex">
              <Languages className="size-3.5" />
              English + Hinglish
            </span>
          </div>
        }
      />

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label="Call transcript"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {transcript.length === 0 && (
          <EmptyState icon={MessagesSquare} title="No conversation yet" className="h-full">
            Start a call to see the live transcript.
          </EmptyState>
        )}

        {transcript.map((m, i) => {
          const isAi = m.sender === "ai";
          return (
            <ChatBubble
              key={i}
              isAi={isAi}
              name={isAi ? "Voxora AI" : customerName}
              time={fmtTime(m.timestamp)}
              text={m.text}
              partial={!!m.partial}
            />
          );
        })}

        {typing && <TypingIndicator />}
      </div>

      {/* Reply box */}
      {inCall && (
        <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-zinc-200 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a reply (or just speak)…"
            aria-label="Type a reply"
            className="field min-w-0 flex-1"
          />
          <button type="submit" aria-label="Send reply" disabled={!draft.trim()} className="btn btn-primary w-10 !px-0">
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}

export default memo(TranscriptPanel);
