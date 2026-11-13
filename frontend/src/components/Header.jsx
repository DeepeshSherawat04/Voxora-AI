// frontend/src/components/Header.jsx
// Top bar: page title on the left; call status and language on the right.
import { memo } from "react";
import { Languages, Menu } from "lucide-react";
import { fmtClock } from "../lib/format";
import { BrandMark } from "./ui";

function CallStatus({ phase, elapsed }) {
  if (phase === "in_call") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-600/20">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        In call <span className="tabular-nums">{fmtClock(elapsed)}</span>
      </span>
    );
  }
  if (phase === "connecting") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/25">
        <span className="size-1.5 rounded-full bg-amber-500" />
        Connecting…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-500/20">
      <span className="size-1.5 rounded-full bg-zinc-400" />
      Ready
    </span>
  );
}

function Header({ title, subtitle, onMenu, phase, elapsed }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button type="button" onClick={onMenu} aria-label="Open navigation" className="btn-icon lg:hidden">
        <Menu className="size-[18px]" />
      </button>
      <span className="lg:hidden">
        <BrandMark size="sm" animate="none" />
      </span>

      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-tight text-zinc-950">{title}</h1>
        <p className="hidden truncate text-xs text-zinc-500 sm:block">{subtitle}</p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        <CallStatus phase={phase} elapsed={elapsed} />
        <span className="hidden items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 sm:inline-flex">
          <Languages className="size-3.5" />
          Hinglish
        </span>
      </div>
    </header>
  );
}

export default memo(Header);
