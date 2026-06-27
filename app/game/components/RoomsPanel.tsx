import { Users } from "lucide-react";
import type React from "react";
import type { Room } from "../types.js";

export function RoomsPanel(props: {
  rooms: Room[];
  code: string;
  message: string;
  setCode: (value: string) => void;
  onJoin: (event: React.FormEvent) => void;
  onOpen: (code: string) => void;
}) {
  return (
    <section className="mb-6 rounded-lg border border-sky-300/20 bg-sky-300/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="text-sky-200" size={18} />
        <h2 className="font-semibold text-white">Friend Rooms</h2>
      </div>
      <form onSubmit={props.onJoin} className="mb-3 flex gap-2">
        <input
          value={props.code}
          onChange={(event) => props.setCode(event.target.value.toUpperCase())}
          placeholder="Room code"
          className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm font-semibold uppercase tracking-[0.12em] text-white outline-none focus:border-sky-300"
        />
        <button className="h-11 rounded-md bg-sky-300 px-4 text-sm font-black text-black">Join</button>
      </form>
      {props.message ? <div className="mb-3 text-sm text-red-200">{props.message}</div> : null}
      <div className="space-y-2">
        {props.rooms.slice(0, 3).map((room) => (
          <button
            key={room.id}
            onClick={() => props.onOpen(room.code)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-left"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{room.name}</div>
              <div className="text-xs text-white/45">{room.memberCount} players · {room.match.homeTeam} vs {room.match.awayTeam}</div>
            </div>
            <div className="rounded bg-white/10 px-2 py-1 text-xs font-black text-sky-100">{room.code}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
