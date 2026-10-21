import { AudioLines } from "lucide-react";

export default function Header() {
  const tabs = ["Live Call"];
  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-purple-100">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-200">
            <AudioLines className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold leading-tight">Sankar Group</p>
            <p className="text-xs text-slate-500">Aria · AI Voice Sales Agent</p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1 rounded-full bg-slate-100 p-1">
          {tabs.map((t) => (
            <button key={t} className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              t === "Live Call" ? "bg-white shadow text-purple-700"
                                : "text-slate-500 hover:text-slate-700"}`}>
              {t}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-purple-600 text-white font-semibold">English</span>
            <span className="text-slate-400">हिंदी</span>
            <span className="text-slate-400">తెలుగు</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 text-white text-xs font-bold flex items-center justify-center">DS</span>
            <span className="hidden lg:block text-sm font-medium">Deepesh Sherawat</span>
          </div>
        </div>
      </div>
    </header>
  );
}