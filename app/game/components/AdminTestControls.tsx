import { useState } from "react";
import { apiUrl } from "../config.js";
import type { TestGameStatus } from "../types.js";

export function AdminTestControls(props: {
  matchId: string;
  adminToken: string;
  setAdminToken: (value: string) => void;
  status: TestGameStatus;
  onRefresh: () => void;
}) {
  const [message, setMessage] = useState("");
  const enabledForThisMatch = props.status.enabled && props.status.matchId === props.matchId;

  async function toggleTestGame() {
    setMessage("");
    const url = enabledForThisMatch ? `${apiUrl}/api/admin/test-game/stop` : `${apiUrl}/api/admin/test-game/start`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": props.adminToken,
      },
      body: JSON.stringify(enabledForThisMatch ? {} : { matchId: props.matchId }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Test game action failed.");
      return;
    }

    setMessage(data.enabled ? "Test game enabled for this match." : "Test game disabled.");
    props.onRefresh();
  }

  return (
    <section className="mt-5 rounded-lg border border-sky-300/20 bg-sky-300/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-white">Admin Test Game</h2>
          <div className="text-xs text-white/50">Simulated only. No DB events, points, or leaderboard changes.</div>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${enabledForThisMatch ? "bg-sky-300 text-black" : "bg-white/10 text-white/60"}`}>
          {enabledForThisMatch ? `Live ${props.status.minute}'` : "Off"}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={props.adminToken}
          onChange={(event) => props.setAdminToken(event.target.value)}
          placeholder="Admin token"
          type="password"
          className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-sky-300"
        />
        <button onClick={toggleTestGame} className="h-11 rounded-md bg-sky-300 px-4 text-sm font-semibold text-black">
          {enabledForThisMatch ? "Disable" : "Enable"}
        </button>
      </div>
      {props.status.enabled && !enabledForThisMatch ? (
        <div className="mt-3 text-xs text-white/55">A test game is already running for another match.</div>
      ) : null}
      {message ? <div className="mt-3 text-sm text-white/70">{message}</div> : null}
    </section>
  );
}
