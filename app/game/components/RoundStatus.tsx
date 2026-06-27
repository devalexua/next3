import type { Prediction, Round } from "../types.js";
import { formatDuration, formatPrediction } from "../utils.js";

export function RoundStatus({ fullTime, halfTime, finalSeconds, round, timeToLock, closed, prediction, canCancel, locked }: {
  fullTime: boolean; halfTime: boolean; finalSeconds: boolean; round: Round | null; timeToLock: number | null;
  closed: boolean; prediction?: Prediction; canCancel: boolean; locked: boolean;
}) {
  if (fullTime) return <section className="mb-5 rounded-lg border border-lime-300/30 bg-lime-300/10 p-4 text-center">
    <div className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">Full Time</div>
    <div className="mt-2 text-2xl font-black text-white">Final Leaderboard</div>
    <div className="mt-1 text-sm text-white/55">Predictions are closed after 90 minutes.</div>
  </section>;
  return <>
    <section className={`mb-4 rounded-lg border p-4 ${finalSeconds ? "animate-pulse border-red-300/60 bg-red-400/10" : "border-lime-300/20 bg-lime-300/10"}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-lime-100">Current Prediction Round</div>
        <div className="text-sm text-white/60">{round ? `${round.startMinute}' - ${round.endMinute}'` : "Closed"}</div>
      </div>
      <div className="flex items-end justify-between">
        <div><div className="text-4xl font-semibold text-white">{timeToLock !== null ? formatDuration(timeToLock) : "--:--"}</div>
          <div className="mt-1 text-sm text-white/60">{halfTime ? "Half-time break. Predictions resume in the second half." : round ? closed ? "Predictions closed for this round" : "Predictions activate after 10 seconds" : "No prediction round is open"}</div>
        </div>
        {prediction ? <div className="rounded-md bg-black/30 px-3 py-2 text-right"><div className="text-xs text-white/50">{canCancel ? "Confirming" : locked ? "Locked pick" : "Your pick"}</div><div className="text-sm font-semibold text-white">{formatPrediction(prediction.predictionType)}</div></div> : null}
      </div>
    </section>
    {halfTime ? <section className="mb-5 rounded-lg border border-yellow-300/45 bg-yellow-300/12 p-4 text-center shadow-lg shadow-yellow-300/10"><div className="text-xs font-black uppercase tracking-[0.18em] text-yellow-100">Half-Time Break</div><div className="mt-2 text-2xl font-black text-white">Predictions Paused</div><div className="mt-1 text-sm text-white/60">Rounds resume automatically when TxLINE reports the second half has started.</div></section> : null}
  </>;
}
