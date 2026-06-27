import { History, Radio, UserRound } from "lucide-react";
import type { MatchListView } from "../types.js";

export function MatchViewTabs({
  activeView,
  setActiveView,
  showMine,
}: {
  activeView: MatchListView;
  setActiveView: (view: MatchListView) => void;
  showMine: boolean;
}) {
  const tabs: Array<{ value: MatchListView; label: string; icon: typeof Radio }> = [
    { value: "active", label: "Now", icon: Radio },
    ...(showMine ? [{ value: "mine" as const, label: "My Games", icon: UserRound }] : []),
    { value: "past", label: "Past", icon: History },
  ];

  return (
    <div className={`mb-4 grid gap-1 border-b border-white/10 pb-3 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {tabs.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setActiveView(value)}
          className={`flex h-9 items-center justify-center gap-1.5 rounded text-xs font-semibold transition ${activeView === value ? "bg-white/12 text-lime-200" : "text-white/45 hover:bg-white/6 hover:text-white/75"}`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
