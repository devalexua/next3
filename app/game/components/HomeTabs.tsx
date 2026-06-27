import type { HomeTab } from "../types.js";

export function HomeTabs(props: {
  activeTab: HomeTab;
  setActiveTab: (tab: HomeTab) => void;
  roomsCount: number;
  leadersCount: number;
  showRooms: boolean;
}) {
  const tabs: Array<{ value: HomeTab; label: string; count?: number }> = props.showRooms
    ? [
        { value: "games", label: "Games" },
        { value: "rooms", label: "Rooms", count: props.roomsCount },
        { value: "leaderboard", label: "Leaders", count: props.leadersCount },
      ]
    : [
        { value: "games", label: "Games" },
        { value: "leaderboard", label: "Leaders", count: props.leadersCount },
      ];

  return (
    <nav className={`mb-5 grid gap-1 rounded-md bg-black/30 p-1 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => props.setActiveTab(tab.value)}
          className={`h-10 rounded text-xs font-black transition ${props.activeTab === tab.value ? "bg-lime-300 text-black" : "text-white/60 hover:bg-white/8 hover:text-white"}`}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className={props.activeTab === tab.value ? "ml-1 text-black/55" : "ml-1 text-white/35"}>{tab.count}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
