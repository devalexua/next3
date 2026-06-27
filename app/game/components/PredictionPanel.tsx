import { AnimatePresence, motion } from "framer-motion";
import { predictionOptions } from "../config.js";
import type { Prediction, PredictionType } from "../types.js";

export function PredictionPanel({ halfTime, prediction, disabled, canCancel, seconds, progress, onSubmit, onCancel }: {
  halfTime: boolean; prediction?: Prediction; disabled: boolean; canCancel: boolean; seconds: number; progress: number;
  onSubmit: (type: PredictionType) => Promise<void>; onCancel: (id: string) => Promise<void>;
}) {
  return <section className="mb-5">
    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-white">Prediction</h2><span className="text-xs text-white/50">{halfTime ? "Paused" : "Closes in final 10 seconds"}</span></div>
    {halfTime ? <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-6 text-center text-sm font-semibold text-white/55">Waiting for second half kickoff</div> : <div className="relative">
      <div className="grid grid-cols-2 gap-2">{predictionOptions.map((option) => {
        const active = prediction?.predictionType === option.value;
        return <motion.button key={option.value} disabled={disabled} onClick={() => onSubmit(option.value)} className={`relative h-[82px] overflow-hidden rounded-lg border p-3 text-left transition disabled:opacity-40 ${active ? "border-white bg-lime-300 text-black shadow-lg shadow-lime-300/20" : "border-white/10 bg-white/8 text-white"}`} whileTap={{ scale: 0.96 }} animate={active ? { y: [0, -2, 0] } : { y: 0 }} transition={active ? { repeat: Infinity, duration: 1.4 } : undefined}>
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${option.tone}`} /><div className="mb-2 flex items-center justify-between"><span className="text-2xl leading-none">{option.icon}</span><span className={active ? "text-xs font-black text-black/60" : "text-xs font-black text-lime-200"}>+{option.points}</span></div><div className="text-sm font-black">{option.label}</div><div className={active ? "text-xs text-black/70" : "text-xs text-white/50"}>{option.points} base points</div>
        </motion.button>;
      })}</div>
      <AnimatePresence>{prediction ? <motion.div className="absolute inset-0 z-20 rounded-lg bg-black/55 p-3 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className={`rounded-lg border p-3 ${canCancel ? "border-lime-300/45 bg-[#202d18] shadow-lg shadow-lime-300/10" : "border-white/10 bg-[#151815]"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-white">{canCancel ? "Confirming prediction" : "Prediction locked"}</div><div className="mt-1 text-xs text-white/50">{canCancel ? "You can cancel before it activates. Events only count after activation." : "This round's prediction cannot be changed."}</div></div>{canCancel ? <button onClick={() => onCancel(prediction.id)} className="h-10 rounded-md border border-red-300/40 bg-red-400/10 px-3 text-xs font-black text-red-100">Cancel</button> : null}</div>{canCancel ? <div className="mt-3"><div className="mb-2 flex items-end justify-between"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-lime-100">Locks in</span><span className="font-mono text-3xl font-black leading-none text-white">{seconds}s</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-lime-300" animate={{ width: `${progress}%` }} transition={{ duration: 0.2, ease: "linear" }} /></div></div> : null}</div></motion.div> : null}</AnimatePresence>
    </div>}
  </section>;
}
