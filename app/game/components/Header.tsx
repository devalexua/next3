import { Flame, LogOut, Zap } from "lucide-react";
import type { User } from "../types.js";

export function Header({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <header className="relative mb-5 overflow-hidden rounded-lg border border-lime-300/20 bg-black/35 p-4 shadow-2xl shadow-lime-950/30">
      <div className="score-sweep" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1 text-xs font-black uppercase tracking-normal text-lime-100">
            <Zap size={15} />
            Next3
          </div>
          <h1 className="text-4xl font-black leading-none tracking-normal text-white">World Cup Rush</h1>
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/65">
            <Flame className="text-rose-300" size={17} />
            3-minute prediction rounds
          </div>
        </div>
        {user ? (
          <button onClick={onLogout} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/8 text-white" aria-label="Log out">
            <LogOut size={18} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
