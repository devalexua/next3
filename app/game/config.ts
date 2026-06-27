import type { PredictionType } from "./types.js";

export const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
export const matchDurationMinutes = 90;
export const predictionOptions: Array<{ label: string; value: PredictionType; points: number; icon: string; tone: string }> = [
  { label: "Goal", value: "GOAL", points: 7, icon: "⚽", tone: "from-lime-300 to-emerald-400" },
  { label: "Yellow Card", value: "YELLOW_CARD", points: 5, icon: "🟨", tone: "from-yellow-300 to-amber-400" },
  { label: "Red Card", value: "RED_CARD", points: 20, icon: "🟥", tone: "from-red-400 to-rose-500" },
  { label: "Corner", value: "CORNER", points: 2, icon: "🚩", tone: "from-sky-300 to-cyan-400" },
  { label: "Substitution", value: "SUBSTITUTION", points: 2, icon: "🔄", tone: "from-fuchsia-300 to-pink-400" },
  { label: "Nothing Happens", value: "NOTHING_HAPPENS", points: 1, icon: "⏱", tone: "from-zinc-200 to-slate-300" },
];
