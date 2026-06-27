import { motion } from "framer-motion";
import type { EventRecord } from "../types.js";
import { eventIcon, formatPrediction } from "../utils.js";

export function Timeline({ events, compact = false }: { events: EventRecord[]; compact?: boolean }) {
  return (
    <section className={compact ? "" : "mb-5"}>
      {!compact ? <h2 className="mb-3 font-semibold text-white">Live Feed</h2> : null}
      <div className={`${compact ? "max-h-[360px] overflow-y-auto pr-1" : "min-h-[108px] rounded-lg border border-white/10 bg-black/25 p-3"} space-y-2`}>
        {events.length === 0 ? <div className="py-8 text-center text-sm text-white/45">Waiting for TxLINE events</div> : null}
        {events.map((event) => (
          <motion.div layout key={event.id} className={`flex items-center gap-3 rounded-md px-3 py-2 ${event.simulated ? "border border-sky-300/30 bg-sky-300/10" : "bg-white/[0.06]"}`}>
            <div className="w-10 text-sm font-semibold text-lime-200">{event.minute ?? "-"}'</div>
            <div className="text-lg">{eventIcon(event.eventType)}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{event.title ?? formatPrediction(event.eventType)}</div>
              <div className="truncate text-xs text-white/45">{event.subtitle ?? (event.simulated ? "Test game" : new Date(event.createdAt).toLocaleTimeString())}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
