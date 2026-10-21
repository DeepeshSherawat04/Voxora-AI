// frontend/src/App.jsx
import { useState } from "react";
import Header from "./components/Header";
import LiveCallPanel from "./components/LiveCallPanel";
import TranscriptPanel from "./components/TranscriptPanel";
import SummaryPanel from "./components/SummaryPanel";
import HistoryTable from "./components/HistoryTable";
import { useCall } from "./hooks/useCall";

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const call = useCall(() => setTimeout(() => setRefreshKey((k) => k + 1), 2000));

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-blue-50 text-slate-800">
      <Header />
      <main className="max-w-[1600px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-4">
          <LiveCallPanel
          {...call}
          onStart={call.startCall}
          onEnd={call.endCall}
          onToggleMute={call.toggleMute}
          />
          </section>
        <section className="lg:col-span-4">
          <TranscriptPanel transcript={call.transcript} phase={call.phase}
            customerName={call.customerName} typing={call.typing} onSend={call.sendText} />
        </section>
        <section className="lg:col-span-4">
          <SummaryPanel ended={call.ended} />
        </section>
        <section className="lg:col-span-12">
          <HistoryTable refreshKey={refreshKey} />
        </section>
      </main>
    </div>
  );
}