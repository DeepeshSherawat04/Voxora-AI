// frontend/src/components/Sidebar.jsx
import { memo } from "react";
import { ArrowRight, History, LogOut, PhoneCall, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../auth";
import { fmtClock } from "../lib/format";
import { Avatar, BrandMark, Wordmark } from "./ui";

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-zinc-100 text-zinc-950" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
      }`}
    >
      {active && (
        <span aria-hidden className="bg-brand-gradient absolute inset-y-1.5 left-0 w-[3px] rounded-full" />
      )}
      <Icon
        className={`size-[18px] shrink-0 ${active ? "text-zinc-950" : "text-zinc-500 group-hover:text-zinc-800"}`}
        strokeWidth={1.75}
      />
      {label}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</p>
  );
}

function Sidebar({ view, onNavigate, isAdmin, open, onClose, callPhase, elapsed, customerName }) {
  const { user, logout } = useAuth();
  const inCallElsewhere = callPhase === "in_call" && view !== "live";

  return (
    <>
      {/* Mobile backdrop */}
      {open && <div aria-hidden className="fixed inset-0 z-30 bg-zinc-950/40 lg:hidden" onClick={onClose} />}

      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white transition-[transform,visibility] duration-200 ease-out-expo ${
          open ? "" : "max-lg:invisible max-lg:-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-5">
          <div className="group/brand flex items-center gap-2.5">
            <BrandMark />
            <Wordmark />
          </div>
          <button type="button" onClick={onClose} aria-label="Close navigation" className="btn-icon lg:hidden">
            <X className="size-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <div>
            <SectionLabel>Workspace</SectionLabel>
            <div className="space-y-0.5">
              <NavItem icon={PhoneCall} label="Live call" active={view === "live"} onClick={() => onNavigate("live")} />
              <NavItem icon={History} label="Call history" active={view === "history"} onClick={() => onNavigate("history")} />
            </div>
          </div>

          {isAdmin && (
            <div>
              <SectionLabel>Administration</SectionLabel>
              <div className="space-y-0.5">
                <NavItem
                  icon={ShieldCheck}
                  label="Email approvals"
                  active={view === "admin"}
                  onClick={() => onNavigate("admin")}
                />
              </div>
            </div>
          )}
        </nav>

        {/* A call keeps running while you browse. Make that obvious. */}
        {inCallElsewhere && (
          <button
            type="button"
            onClick={() => onNavigate("live")}
            className="animate-fade-up mx-3 mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition-colors hover:bg-emerald-100/70"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <span className="size-2 rounded-full bg-emerald-500" /> Call in progress
            </span>
            <span className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-zinc-900">{customerName}</span>
              <span className="text-sm tabular-nums text-emerald-800">{fmtClock(elapsed)}</span>
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800">
              Return to call <ArrowRight className="size-3" />
            </span>
          </button>
        )}

        {/* Signed-in user */}
        <div className="shrink-0 border-t border-zinc-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg p-2">
            <Avatar name={user?.name} src={user?.picture} dark />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-950">{user?.name || "Signed in"}</p>
              {user?.email && <p className="truncate text-xs text-zinc-500">{user.email}</p>}
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default memo(Sidebar);
