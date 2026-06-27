import { Copy, Users } from "lucide-react";
import { useState } from "react";
import type { Room } from "../types.js";

export function RoomHeader({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    const text = `Join my Next3 room ${room.code} for ${room.match.homeTeam} vs ${room.match.awayTeam}`;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mb-4 rounded-lg border border-sky-300/25 bg-sky-300/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-sky-100">
            <Users size={15} />
            Private Room
          </div>
          <div className="truncate text-lg font-black text-white">{room.name}</div>
          <div className="text-xs text-white/50">{room.memberCount} players joined</div>
        </div>
        <button onClick={copyCode} className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-sky-300 text-black" aria-label="Copy room code">
          <Copy size={18} />
        </button>
      </div>
      <div className="flex items-center justify-between rounded-md bg-black/25 px-3 py-2">
        <span className="text-xs font-semibold text-white/50">Share code</span>
        <span className="text-lg font-black tracking-[0.18em] text-sky-100">{copied ? "COPIED" : room.code}</span>
      </div>
    </section>
  );
}
