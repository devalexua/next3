"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { apiUrl } from "./config.js";
import type { EventRecord, HomeTab, LeaderboardRow, Match, MatchDetail, MatchListView, PredictionType, Room, RoomDetail, TestGameStatus, User } from "./types.js";
import { formatPrediction, formatScore, shouldShowEventNotification, triggerConfetti } from "./utils.js";

export function useGameController() {
  const [user, setUser] = useState<User | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [roomDetail, setRoomDetail] = useState<RoomDetail | null>(null);
  const [matchLeaderboard, setMatchLeaderboard] = useState<LeaderboardRow[]>([]);
  const [roomLeaderboard, setRoomLeaderboard] = useState<LeaderboardRow[]>([]);
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardRow[]>([]);
  const [globalCurrentUserRank, setGlobalCurrentUserRank] = useState<LeaderboardRow | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [homeTab, setHomeTab] = useState<HomeTab>("games");
  const [matchListView, setMatchListView] = useState<MatchListView>("active");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [roomMessage, setRoomMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [liveBanner, setLiveBanner] = useState<EventRecord | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [showAdminTest, setShowAdminTest] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [testGameStatus, setTestGameStatus] = useState<TestGameStatus>({ enabled: false, matchId: null, startedAt: null, minute: 0 });
  const [simulatedEvents, setSimulatedEvents] = useState<EventRecord[]>([]);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef<Socket | null>(null);
  const shownEventNotificationsRef = useRef<Map<string, number>>(new Map());
  const shownPredictionWinsRef = useRef<Set<string>>(new Set());

  const loadMatches = useCallback(() => {
    fetch(`${apiUrl}/api/matches?view=${matchListView}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : { matches: [] })
      .then((data) => setMatches(data.matches ?? []))
      .catch(() => undefined);
  }, [matchListView]);

  const loadGlobalLeaderboard = useCallback(() => {
    fetch(`${apiUrl}/api/leaderboard`, { credentials: "include" })
      .then((response) => response.json())
      .then((data) => {
        setGlobalLeaderboard(data.leaderboard ?? []);
        setGlobalCurrentUserRank(data.currentUserRank ?? null);
      })
      .catch(() => undefined);
  }, []);

  const loadRooms = useCallback(() => {
    fetch(`${apiUrl}/api/rooms`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : { rooms: [] })
      .then((data) => setRooms(data.rooms ?? []))
      .catch(() => undefined);
  }, []);

  const loadTestGameStatus = useCallback(() => {
    fetch(`${apiUrl}/api/admin/test-game/status`)
      .then((response) => response.json())
      .then((data) => setTestGameStatus(data))
      .catch(() => undefined);
  }, []);

  const loadMatchDetail = useCallback((matchId: string) => {
    fetch(`${apiUrl}/api/matches/${matchId}`, { credentials: "include" })
      .then((response) => response.json())
      .then((data) => setDetail(data))
      .catch(() => undefined);

    fetch(`${apiUrl}/api/matches/${matchId}/leaderboard`)
      .then((response) => response.json())
      .then((data) => setMatchLeaderboard(data.leaderboard ?? []))
      .catch(() => undefined);
  }, []);

  const loadRoomDetail = useCallback((code: string) => {
    fetch(`${apiUrl}/api/rooms/${code}`, { credentials: "include" })
      .then((response) => response.json())
      .then((data) => setRoomDetail(data))
      .catch(() => undefined);

    fetch(`${apiUrl}/api/rooms/${code}/leaderboard`, { credentials: "include" })
      .then((response) => response.json())
      .then((data) => setRoomLeaderboard(data.leaderboard ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(`${apiUrl}/api/me`, { credentials: "include" })
      .then((response) => response.json())
      .then((data) => setUser(data.user ?? null))
      .catch(() => undefined);

    loadMatches();
    loadGlobalLeaderboard();
    const interval = setInterval(() => {
      loadMatches();
      loadGlobalLeaderboard();
    }, 10_000);

    return () => clearInterval(interval);
  }, [loadGlobalLeaderboard, loadMatches]);

  useEffect(() => {
    if (!user) return;
    loadRooms();
    const interval = setInterval(loadRooms, 30_000);
    return () => clearInterval(interval);
  }, [loadRooms, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setShowAdminTest(params.get("test") === "1" || params.get("adminTest") === "1");
  }, []);

  useEffect(() => {
    if (!showAdminTest) return;

    loadTestGameStatus();
    const interval = setInterval(loadTestGameStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadTestGameStatus, showAdminTest]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedMatchId) return;

    loadMatchDetail(selectedMatchId);
    const interval = setInterval(() => loadMatchDetail(selectedMatchId), 10_000);
    return () => clearInterval(interval);
  }, [loadMatchDetail, selectedMatchId]);

  useEffect(() => {
    if (!selectedRoomCode) return;

    loadRoomDetail(selectedRoomCode);
    const interval = setInterval(() => loadRoomDetail(selectedRoomCode), 10_000);
    return () => clearInterval(interval);
  }, [loadRoomDetail, selectedRoomCode]);

  const selectedRoom = selectedRoomCode
    ? roomDetail?.room ?? rooms.find((room) => room.code === selectedRoomCode) ?? null
    : null;
  const openMatchId = selectedRoom?.matchId ?? selectedMatchId;
  const openRoomId = selectedRoom?.id ?? null;
  const activeTimelineEvents = selectedRoomCode ? roomDetail?.events : detail?.events;

  const showEventBanner = useCallback((event: EventRecord) => {
    if (event.eventType === "UNKNOWN") return;
    if (!shouldShowEventNotification(event, shownEventNotificationsRef.current)) return;

    setLiveBanner(event);
    window.setTimeout(() => setLiveBanner(null), 3200);
  }, []);

  useEffect(() => {
    if (!openMatchId || !activeTimelineEvents?.length) return;

    const latestEvent = activeTimelineEvents[0];
    if (!latestEvent || latestEvent.matchId !== openMatchId) return;

    const eventAgeMs = Date.now() - new Date(latestEvent.createdAt).getTime();
    if (eventAgeMs > 15_000) return;

    showEventBanner(latestEvent);
  }, [activeTimelineEvents, openMatchId, showEventBanner]);

  useEffect(() => {
    const socket = io(apiUrl, { withCredentials: true, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("event_created", (event: EventRecord) => {
      const shouldNotifyForOpenMatch =
        openMatchId !== null &&
        event.matchId === openMatchId &&
        event.eventType !== "UNKNOWN";

      if (shouldNotifyForOpenMatch) {
        showEventBanner(event);
      }

      if (event.simulated) {
        if (!showAdminTest) return;
        if (event.matchId === openMatchId) {
          setSimulatedEvents((current) => [event, ...current].slice(0, 30));
        }
        return;
      }

      if (selectedRoomCode && event.matchId === openMatchId) {
        loadRoomDetail(selectedRoomCode);
      } else if (event.matchId === selectedMatchId) {
        loadMatchDetail(event.matchId);
      }
    });

    socket.on("prediction_won", (payload: { predictionId: string; userId: string; matchId: string; roomId?: string; pointsAwarded: number; streak: number; event: EventRecord }) => {
      if (payload.userId !== user?.id) return;
      if (openRoomId ? payload.roomId !== openRoomId : payload.roomId || payload.matchId !== selectedMatchId) return;
      if (shownPredictionWinsRef.current.has(payload.predictionId)) return;

      shownPredictionWinsRef.current.add(payload.predictionId);
      setNotice(`Correct! +${formatScore(payload.pointsAwarded)} points`);
      if (payload.event.eventType === "GOAL" || payload.streak >= 5) triggerConfetti(setConfetti);
      if (selectedRoomCode) loadRoomDetail(selectedRoomCode);
      else loadMatchDetail(payload.matchId);
      window.setTimeout(() => setNotice(""), 3600);
    });

    socket.on("leaderboard_updated", (payload: { matchId?: string; roomId?: string }) => {
      loadGlobalLeaderboard();
      if (openRoomId && payload.roomId === openRoomId && selectedRoomCode) loadRoomDetail(selectedRoomCode);
      else if (!openRoomId && payload.matchId && payload.matchId === selectedMatchId) loadMatchDetail(payload.matchId);
    });

    socket.on("match_score_updated", (payload: { matchId: string; homeScore: number; awayScore: number }) => {
      setMatches((current) =>
        current.map((match) =>
          match.id === payload.matchId ? { ...match, homeScore: payload.homeScore, awayScore: payload.awayScore } : match,
        ),
      );

      if (payload.matchId === selectedMatchId) {
        setDetail((current) =>
          current
            ? { ...current, match: { ...current.match, homeScore: payload.homeScore, awayScore: payload.awayScore } }
            : current,
        );
      }
      if (selectedRoomCode && payload.matchId === openMatchId) {
        setRoomDetail((current) =>
          current
            ? { ...current, match: { ...current.match, homeScore: payload.homeScore, awayScore: payload.awayScore } }
            : current,
        );
      }
    });

    socket.on("match_clock_updated", (payload: { matchId: string; status: Match["status"]; clockSeconds: number; clockRunning: boolean; clockUpdatedAt: string | null }) => {
      setMatches((current) =>
        current.map((match) =>
          match.id === payload.matchId
            ? { ...match, status: payload.status, clockSeconds: payload.clockSeconds, clockRunning: payload.clockRunning, clockUpdatedAt: payload.clockUpdatedAt }
            : match,
        ),
      );

      if (payload.matchId === selectedMatchId) {
        setDetail((current) =>
          current
            ? { ...current, match: { ...current.match, status: payload.status, clockSeconds: payload.clockSeconds, clockRunning: payload.clockRunning, clockUpdatedAt: payload.clockUpdatedAt } }
            : current,
        );
      }
      if (selectedRoomCode && payload.matchId === openMatchId) {
        setRoomDetail((current) =>
          current
            ? { ...current, match: { ...current.match, status: payload.status, clockSeconds: payload.clockSeconds, clockRunning: payload.clockRunning, clockUpdatedAt: payload.clockUpdatedAt } }
            : current,
        );
      }
    });

    socket.on("round_finished", (payload: { matchId?: string }) => {
      if (selectedRoomCode && (!payload.matchId || payload.matchId === openMatchId)) {
        loadRoomDetail(selectedRoomCode);
      } else if (selectedMatchId && (!payload.matchId || payload.matchId === selectedMatchId)) {
        loadMatchDetail(selectedMatchId);
      }
    });

    socket.on("round_started", (payload: { matchId?: string }) => {
      if (selectedRoomCode && (!payload.matchId || payload.matchId === openMatchId)) {
        loadRoomDetail(selectedRoomCode);
      } else if (selectedMatchId && (!payload.matchId || payload.matchId === selectedMatchId)) {
        loadMatchDetail(selectedMatchId);
      }
    });

    socket.on("test_game_status", (status: TestGameStatus) => {
      if (!showAdminTest) return;
      setTestGameStatus(status);
      if (!status.enabled) setSimulatedEvents([]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [loadGlobalLeaderboard, loadMatchDetail, loadRoomDetail, openMatchId, openRoomId, selectedMatchId, selectedRoomCode, showAdminTest, showEventBanner, user?.id]);

  const selectedMatch = selectedRoom
    ? selectedRoom.match
    : selectedMatchId ? matches.find((match) => match.id === selectedMatchId) ?? detail?.match ?? null : null;

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const response = await fetch(`${apiUrl}/api/auth/${authMode}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Authentication failed.");
      return;
    }

    setUser(data.user);
    loadRooms();
    if (selectedMatchId) loadMatchDetail(selectedMatchId);
  }

  async function logout() {
    await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
    setHomeTab("games");
    setMatchListView("active");
    setRooms([]);
    setSelectedRoomCode(null);
    setRoomDetail(null);
    setRoomLeaderboard([]);
    setDetail((current) => current ? { ...current, myPredictions: [], myState: null } : current);
  }

  async function createRoom(matchId: string) {
    if (!user) {
      setNotice("Log in to create rooms.");
      window.setTimeout(() => setNotice(""), 2600);
      return;
    }

    const response = await fetch(`${apiUrl}/api/rooms`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    });
    const data = await response.json();

    if (!response.ok) {
      setNotice(data.error || "Room creation failed.");
      window.setTimeout(() => setNotice(""), 3000);
      return;
    }

    setRooms((current) => [data.room, ...current.filter((room) => room.id !== data.room.id)]);
    setSelectedRoomCode(data.room.code);
    setSelectedMatchId(null);
    setNotice(`Room ${data.room.code} created`);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function joinRoom(event: React.FormEvent) {
    event.preventDefault();
    setRoomMessage("");

    const response = await fetch(`${apiUrl}/api/rooms/join`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinRoomCode }),
    });
    const data = await response.json();

    if (!response.ok) {
      setRoomMessage(data.error || "Could not join room.");
      return;
    }

    setJoinRoomCode("");
    setRooms((current) => [data.room, ...current.filter((room) => room.id !== data.room.id)]);
    setSelectedRoomCode(data.room.code);
    setSelectedMatchId(null);
  }

  function closeMatch() {
    setSelectedMatchId(null); setSelectedRoomCode(null); setDetail(null); setRoomDetail(null);
    setMatchLeaderboard([]); setRoomLeaderboard([]); setSimulatedEvents([]);
  }

  function selectMatch(id: string) { setSelectedMatchId(id); setSelectedRoomCode(null); }
  function selectRoom(code: string) { setSelectedRoomCode(code); setSelectedMatchId(null); }
  function selectMatchView(view: MatchListView) { setMatches([]); setMatchListView(view); }

  async function submitPrediction(predictionType: PredictionType) {
    if (!user || !selectedMatch) { setNotice("Log in to make predictions."); return; }
    const url = selectedRoom ? `${apiUrl}/api/rooms/${selectedRoom.code}/predictions` : `${apiUrl}/api/matches/${selectedMatch.id}/predictions`;
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ predictionType }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error || "Prediction failed."); window.setTimeout(() => setNotice(""), 3200); return; }
    setNotice(`${formatPrediction(data.prediction.predictionType)} confirms in 10 seconds`);
    if (selectedRoom) loadRoomDetail(selectedRoom.code); else loadMatchDetail(selectedMatch.id);
    window.setTimeout(() => setNotice(""), 2600);
  }

  async function cancelPrediction(predictionId: string) {
    if (!user || !selectedMatch) return;
    const url = selectedRoom ? `${apiUrl}/api/rooms/${selectedRoom.code}/predictions/cancel` : `${apiUrl}/api/matches/${selectedMatch.id}/predictions/cancel`;
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ predictionId }) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error || "Could not cancel prediction."); window.setTimeout(() => setNotice(""), 3200); return; }
    setNotice("Prediction canceled. Choose another one.");
    if (selectedRoom) loadRoomDetail(selectedRoom.code); else loadMatchDetail(selectedMatch.id);
    window.setTimeout(() => setNotice(""), 2600);
  }


  return {
    user, matches, rooms, selectedMatchId, selectedRoomCode, detail, roomDetail, matchLeaderboard, roomLeaderboard,
    globalLeaderboard, globalCurrentUserRank, authMode, homeTab, matchListView, username, password, joinRoomCode,
    roomMessage, error, notice, liveBanner, confetti, showAdminTest, adminToken, testGameStatus, simulatedEvents, now,
    selectedRoom, selectedMatch, submitAuth, logout, createRoom, joinRoom, submitPrediction, cancelPrediction,
    closeMatch, selectMatch, selectRoom, selectMatchView, loadTestGameStatus, loadMatchDetail, loadRoomDetail,
    setSelectedMatchId, setSelectedRoomCode, setDetail, setRoomDetail, setMatchLeaderboard, setRoomLeaderboard,
    setSimulatedEvents, setMatches, setAuthMode, setHomeTab, setMatchListView, setUsername, setPassword, setJoinRoomCode,
    setAdminToken, setNotice,
  };
}
