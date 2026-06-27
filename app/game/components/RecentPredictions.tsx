import type { Prediction } from "../types.js";
import { formatPrediction, formatScore } from "../utils.js";

export function RecentPredictions({ predictions, compact = false }: { predictions: Prediction[]; compact?: boolean }) {
  const recent = predictions.filter((prediction) => prediction.status !== "CANCELED").slice(0, 4);
  if (recent.length === 0) {
    return compact ? <div className="py-8 text-center text-sm text-white/45">No predictions yet</div> : null;
  }

  return (
    <section className={compact ? "" : "mb-5"}>
      {!compact ? <h2 className="mb-3 font-semibold text-white">Your Rounds</h2> : null}
      <div className="space-y-2">
        {recent.map((prediction) => (
          <div key={prediction.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-white">{formatPrediction(prediction.predictionType)}</div>
              <div className="text-xs text-white/50">{prediction.round.startMinute}' - {prediction.round.endMinute}'</div>
            </div>
            <div className={`rounded px-2 py-1 text-xs font-semibold ${prediction.status === "WON" ? "bg-lime-300 text-black" : prediction.status === "LOST" ? "bg-red-400 text-white" : "bg-white/10 text-white/70"}`}>
              {prediction.status === "WON" ? `+${formatScore(prediction.pointsAwarded)}` : prediction.status}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
