import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { EventRecord } from "../types.js";
import { eventIcon, formatPrediction } from "../utils.js";
import { Confetti } from "./Confetti.js";

export function LiveOverlays({ event, notice, confetti }: { event: EventRecord | null; notice: string; confetti: boolean }) {
  return (
    <>
      <AnimatePresence>
        {event ? (
          <motion.div
            className={`fixed left-4 right-4 top-5 z-30 mx-auto max-w-md rounded-lg border px-4 py-4 text-center shadow-2xl ${event.eventType === "GOAL" ? "border-lime-200 bg-lime-300 text-black" : "border-white/20 bg-[#172018] text-white"}`}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
          >
            <div className="mb-1 text-sm font-semibold opacity-70">{event.minute ?? "-"}' {event.teamName ? `· ${event.teamName}` : ""}</div>
            <div className="text-3xl font-black tracking-normal">{eventIcon(event.eventType)} {event.title ?? formatPrediction(event.eventType)}</div>
            <div className="mt-2 text-base font-semibold opacity-80">{event.subtitle ?? (event.simulated ? "Test game" : "Live match event")}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {notice ? (
          <motion.div className="fixed bottom-5 left-4 right-4 z-30 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-white/10 bg-white px-4 py-3 text-black shadow-2xl" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}>
            <Sparkles size={18} />
            <div className="text-sm font-semibold">{notice}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {confetti ? <Confetti /> : null}
    </>
  );
}
