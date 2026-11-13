// frontend/src/App.jsx
import { lazy, memo, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LiveCallPanel from "./components/LiveCallPanel";
import TranscriptPanel from "./components/TranscriptPanel";
import SummaryPanel from "./components/SummaryPanel";
import HistoryTable from "./components/HistoryTable";
import { useCall } from "./hooks/useCall";

// Admin is loaded on demand, so regular users never download it.
const loadAdmin = () => import("./components/AdminPage");
const AdminPage = lazy(loadAdmin);

// These only depend on a prop or two, so they should not re-render
// every time a new transcript line arrives.
const Summary = memo(SummaryPanel);
const History = memo(HistoryTable);

const PAGES = {
  live: { title: "Live call", subtitle: "Run an AI-assisted sales call in real time" },
  history: { title: "Call history", subtitle: "Recordings, transcripts and AI summaries" },
  admin: { title: "Email approvals", subtitle: "Review calls and approve follow-up emails" },
};

function Splash() {
  return (
    <div role="status" aria-label="Loading" className="grid min-h-[50dvh] place-items-center">
      <div aria-hidden className="flex h-8 items-end gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="animate-eq h-full w-1 rounded-full bg-brand-500"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { apiFetch } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [view, setView] = useState("live"); // live | history | admin
  const [isAdmin, setIsAdmin] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // mobile drawer

  const onCallEnded = useCallback(
    () => setTimeout(() => setRefreshKey((k) => k + 1), 2000),
    []
  );
  // The call lives here, above the pages, so it keeps running while you browse History.
  const call = useCall(onCallEnded);

  const navigate = useCallback((v) => {
    setView(v);
    setNavOpen(false);
  }, []);
  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // Only decides whether to SHOW the Admin link. The server enforces access.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/me");
        if (!cancelled) setIsAdmin(res && typeof res.ok === "boolean" ? res.ok : true);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiFetch]);

  // Warm up the admin chunk in the background so the link feels instant.
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(loadAdmin, 1500);
    return () => clearTimeout(t);
  }, [isAdmin]);

  const page = view === "admin" && !isAdmin ? "live" : view;
  const { title, subtitle } = PAGES[page];
  const isLive = page === "live";

  return (
    <div className="min-h-dvh bg-white text-zinc-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-950 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar
        view={page}
        onNavigate={navigate}
        isAdmin={isAdmin}
        open={navOpen}
        onClose={closeNav}
        callPhase={call.phase}
        elapsed={call.elapsed}
        customerName={call.customerName}
      />

      <div className="lg:pl-64">
        <Header
          title={title}
          subtitle={subtitle}
          onMenu={openNav}
          phase={call.phase}
          elapsed={call.elapsed}
        />

        <main
          id="main"
          className={
            isLive
              ? "flex flex-col px-4 py-4 sm:px-6 xl:h-[calc(100dvh-4rem)] xl:py-5"
              : "mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"
          }
        >
          {isLive && (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_360px] xl:grid-rows-[minmax(0,1fr)]">
              <section className="animate-reveal min-h-0 min-w-0" style={{ "--i": 0 }} aria-label="Call controls">
                <LiveCallPanel
                  {...call}
                  onStart={call.startCall}
                  onEnd={call.endCall}
                  onToggleMute={call.toggleMute}
                  onToggleSpeaker={call.toggleSpeaker}
                />
              </section>

              <section className="animate-reveal min-h-0 min-w-0" style={{ "--i": 1 }} aria-label="Transcript">
                <TranscriptPanel
                  transcript={call.transcript}
                  phase={call.phase}
                  customerName={call.customerName}
                  typing={call.typing}
                  onSend={call.sendText}
                />
              </section>

              <section
                className="animate-reveal min-h-0 min-w-0 lg:col-span-2 xl:col-span-1"
                style={{ "--i": 2 }}
                aria-label="Call insights"
              >
                <Summary
                  ended={call.ended}
                  live={call.live}
                  phase={call.phase}
                  customerName={call.customerName}
                  consent={call.consent}
                />
              </section>
            </div>
          )}

          {page === "history" && (
            <div className="animate-view-in">
              <History refreshKey={refreshKey} />
            </div>
          )}

          {page === "admin" && (
            <Suspense fallback={<Splash />}>
              <div className="animate-view-in">
                <AdminPage onBack={() => navigate("live")} />
              </div>
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
