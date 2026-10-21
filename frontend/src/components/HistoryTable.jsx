// frontend/src/components/HistoryTable.jsx
import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API = `${API_BASE}/api`;
const RECORDINGS = API_BASE;

const fmt = (sec) =>
  `${String(Math.floor((sec || 0) / 60)).padStart(2, "0")}:${String((sec || 0) % 60).padStart(2, "0")}`;
const fmtDate = (iso) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const COLORS = {
  "Converted": "bg-green-100 text-green-700",
  "Interested": "bg-purple-100 text-purple-700",
  "Follow-up Required": "bg-amber-100 text-amber-700",
  "Not Interested": "bg-red-100 text-red-700",
  "Demo Requested": "bg-blue-100 text-blue-700",
  "No Response": "bg-slate-100 text-slate-500",
};

export default function HistoryTable({ refreshKey }) {
  const [calls, setCalls] = useState([]);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    fetch(`${API}/calls`).then((r) => r.json()).then(setCalls).catch(() => {});
  }, [refreshKey]);

  const viewTranscript = async (id) => {
    const r = await fetch(`${API}/calls/${id}`);
    if (r.ok) setDetail(await r.json());
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-200 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="font-bold">Call History</h3>
        <span className="text-xs text-slate-400">All calls</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-[11px] tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3 font-semibold">DATE & TIME</th>
              <th className="px-5 py-3 font-semibold">CUSTOMER</th>
              <th className="px-5 py-3 font-semibold">DURATION</th>
              <th className="px-5 py-3 font-semibold">STATUS</th>
              <th className="px-5 py-3 font-semibold">AI SUMMARY</th>
              <th className="px-5 py-3 font-semibold">RECORDING</th>
              <th className="px-5 py-3 font-semibold">TRANSCRIPT</th>
            </tr>
          </thead>
          <tbody>
            {calls.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400">No calls yet — start one above.</td></tr>
            )}
            {calls.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-purple-50/40">
                <td className="px-5 py-3.5 whitespace-nowrap">{fmtDate(c.started_at)}</td>
                <td className="px-5 py-3.5 font-semibold">{c.customer_name}</td>
                <td className="px-5 py-3.5 tabular-nums">{fmt(c.duration_seconds)}</td>
                <td className="px-5 py-3.5">
                  {c.sales_status ? (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${COLORS[c.sales_status] || "bg-slate-100 text-slate-500"}`}>
                      {c.sales_status}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">In Call</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-slate-500 max-w-[280px] truncate">{c.summary || "—"}</td>
                <td className="px-5 py-3.5">
                  {c.recording_url ? (
                    <audio controls preload="none" src={`${RECORDINGS}${c.recording_url}`} className="h-8 w-44" />
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <button onClick={() => viewTranscript(c.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-purple-300 hover:text-purple-600">
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDetail(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h4 className="font-bold">Transcript · {detail.customer_name}</h4>
                <p className="text-xs text-slate-400">{fmtDate(detail.started_at)} · {detail.sales_status || "In Call"}</p>
              </div>
              <button onClick={() => setDetail(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {detail.messages?.map((m, i) => (
                <div key={i} className={m.sender === "ai" ? "" : "flex flex-col items-end"}>
                  <p className="text-[11px] text-slate-400 mb-0.5">
                    {m.sender === "ai" ? "Aria" : detail.customer_name} · {fmtDate(m.timestamp)}
                  </p>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.sender === "ai" ? "bg-purple-50 border border-purple-100 text-slate-700"
                                      : "bg-slate-100 text-slate-700"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}