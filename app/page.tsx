"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Copy,
  Flame,
  History,
  LogOut,
  Plus,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type User = {
  id: string;
  username: string;
};

type Match = {
  id: string;
  txlineFixtureId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  clockSeconds: number;
  clockRunning: boolean;
  clockUpdatedAt: string | null;
  startTime: string;
  opensAt: string;
  status: "SCHEDULED" | "OPEN" | "LIVE" | "HALF_TIME" | "FINISHED";
};

type Round = {
  id: string;
  number: number;
  startMinute: number;
  endMinute: number;
  status: "UPCOMING" | "LOCKED" | "RESOLVED";
};

type EventRecord = {
  id: string;
  matchId: string;
  eventType: PredictionType | "UNKNOWN";
  minute: number | null;
  participant: number | null;
  rawAction: string;
  createdAt: string;
  simulated?: boolean;
  title?: string;
  subtitle?: string;
  teamName?: string | null;
  playerName?: string | null;
  playerId?: number | null;
  playerInId?: number | null;
  playerOutId?: number | null;
};

type PredictionType =
  | "GOAL"
  | "YELLOW_CARD"
  | "RED_CARD"
  | "CORNER"
  | "SUBSTITUTION"
  | "NOTHING_HAPPENS";

type Prediction = {
  id: string;
  roundId: string;
  predictionType: PredictionType;
  status: "PENDING" | "WON" | "LOST" | "CANCELED";
  pointsAwarded: number;
  effectiveAt: string;
  createdAt: string;
  round: Round;
};

type MatchDetail = {
  match: Match;
  rounds: Round[];
  activePredictionRound: Round | null;
  currentRound: Round | null;
  events: EventRecord[];
  myPredictions: Prediction[];
  myState: { score: number; streak: number } | null;
};

type Room = {
  id: string;
  code: string;
  name: string;
  matchId: string;
  createdByUserId: string;
  createdAt: string;
  memberCount: number;
  match: Match;
};

type RoomDetail = MatchDetail & {
  room: Room;
};

type LeaderboardRow = {
  rank: number;
  username: string;
  score: number;
  streak?: number;
  bestStreak?: number;
};

type TestGameStatus = {
  enabled: boolean;
  matchId: string | null;
  startedAt: string | null;
  minute: number;
};

type MatchPanelTab = "feed" | "leaderboard" | "rounds";
type HomeTab = "games" | "rooms" | "leaderboard";
type MatchListView = "active" | "mine" | "past";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const matchDurationMinutes = 90;

const predictionOptions: Array<{ label: string; value: PredictionType; points: number; icon: string; tone: string }> = [
  { label: "Goal", value: "GOAL", points: 7, icon: "⚽", tone: "from-lime-300 to-emerald-400" },
  { label: "Yellow Card", value: "YELLOW_CARD", points: 5, icon: "🟨", tone: "from-yellow-300 to-amber-400" },
  { label: "Red Card", value: "RED_CARD", points: 20, icon: "🟥", tone: "from-red-400 to-rose-500" },
  { label: "Corner", value: "CORNER", points: 2, icon: "🚩", tone: "from-sky-300 to-cyan-400" },
  { label: "Substitution", value: "SUBSTITUTION", points: 2, icon: "🔄", tone: "from-fuchsia-300 to-pink-400" },
  { label: "Nothing Happens", value: "NOTHING_HAPPENS", points: 1, icon: "⏱", tone: "from-zinc-200 to-slate-300" },
];

export default function Home() {
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

  return (
    <main className="game-shell mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5">
      <div className="stadium-lights" aria-hidden="true" />
      <LiveOverlays event={liveBanner} notice={notice} confetti={confetti} />

      {selectedMatch ? (
        <MatchExperience
          detail={selectedRoom ? roomDetail : detail}
          fallbackMatch={selectedMatch}
          room={selectedRoom}
          leaderboard={selectedRoom ? roomLeaderboard : matchLeaderboard}
          user={user}
          now={now}
          onBack={() => {
            setSelectedMatchId(null);
            setSelectedRoomCode(null);
            setDetail(null);
            setRoomDetail(null);
            setMatchLeaderboard([]);
            setRoomLeaderboard([]);
            setSimulatedEvents([]);
          }}
          adminToken={adminToken}
          setAdminToken={setAdminToken}
          showAdminTest={showAdminTest}
          testGameStatus={testGameStatus}
          simulatedEvents={showAdminTest ? simulatedEvents : []}
          onRefreshTestGameStatus={loadTestGameStatus}
          onSubmit={async (predictionType) => {
            if (!user) {
              setNotice("Log in to make predictions.");
              window.setTimeout(() => setNotice(""), 2600);
              return;
            }

            const response = await fetch(selectedRoom ? `${apiUrl}/api/rooms/${selectedRoom.code}/predictions` : `${apiUrl}/api/matches/${selectedMatch.id}/predictions`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ predictionType }),
            });
            const data = await response.json();
            if (!response.ok) {
              setNotice(data.error || "Prediction failed.");
              window.setTimeout(() => setNotice(""), 3200);
              return;
            }

            setNotice(`${formatPrediction(data.prediction.predictionType)} confirms in 10 seconds`);
            if (selectedRoom) loadRoomDetail(selectedRoom.code);
            else loadMatchDetail(selectedMatch.id);
            window.setTimeout(() => setNotice(""), 2600);
          }}
          onCancelPrediction={async (predictionId) => {
            if (!user) return;

            const response = await fetch(selectedRoom ? `${apiUrl}/api/rooms/${selectedRoom.code}/predictions/cancel` : `${apiUrl}/api/matches/${selectedMatch.id}/predictions/cancel`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ predictionId }),
            });
            const data = await response.json();
            if (!response.ok) {
              setNotice(data.error || "Could not cancel prediction.");
              window.setTimeout(() => setNotice(""), 3200);
              return;
            }

            setNotice("Prediction canceled. Choose another one.");
            if (selectedRoom) loadRoomDetail(selectedRoom.code);
            else loadMatchDetail(selectedMatch.id);
            window.setTimeout(() => setNotice(""), 2600);
          }}
        />
      ) : (
        <>
          <Header user={user} onLogout={logout} />
          {!user ? (
            <AuthPanel
              authMode={authMode}
              setAuthMode={setAuthMode}
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              error={error}
              onSubmit={submitAuth}
            />
          ) : (
            <UserStrip user={user} />
          )}
          <HomeTabs
            activeTab={homeTab}
            setActiveTab={setHomeTab}
            roomsCount={rooms.length}
            leadersCount={globalLeaderboard.length}
            showRooms={Boolean(user)}
          />
          <AnimatePresence mode="wait" initial={false}>
            {homeTab === "games" ? (
              <motion.div key="games" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <MatchViewTabs
                  activeView={matchListView}
                  setActiveView={(view) => {
                    setMatches([]);
                    setMatchListView(view);
                  }}
                  showMine={Boolean(user)}
                />
                <MatchList
                  matches={matches}
                  view={matchListView}
                  now={now}
                  user={user}
                  onSelect={(id) => {
                    setSelectedMatchId(id);
                    setSelectedRoomCode(null);
                  }}
                  onCreateRoom={createRoom}
                />
              </motion.div>
            ) : null}
            {homeTab === "rooms" && user ? (
              <motion.div key="rooms" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <RoomsPanel
                  rooms={rooms}
                  code={joinRoomCode}
                  message={roomMessage}
                  setCode={setJoinRoomCode}
                  onJoin={joinRoom}
                  onOpen={(code) => {
                    setSelectedRoomCode(code);
                    setSelectedMatchId(null);
                  }}
                />
              </motion.div>
            ) : null}
            {homeTab === "leaderboard" ? (
              <motion.div key="leaderboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <GlobalLeaderboard rows={globalLeaderboard} currentUserRank={globalCurrentUserRank} user={user} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </main>
  );
}

function HomeTabs(props: {
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

function MatchViewTabs({
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

function Header({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <header className="relative mb-5 overflow-hidden rounded-lg border border-lime-300/20 bg-black/35 p-4 shadow-2xl shadow-lime-950/30">
      <div className="score-sweep" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1 text-xs font-black uppercase tracking-normal text-lime-100">
            <Zap size={15} />
            Next3
          </div>
          <h1 className="text-4xl font-black leading-none tracking-normal text-white">World Cup Rush</h1>
          <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/65">
            <Flame className="text-rose-300" size={17} />
            3-minute prediction rounds
          </div>
        </div>
        {user ? (
          <button onClick={onLogout} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/8 text-white" aria-label="Log out">
            <LogOut size={18} />
          </button>
        ) : null}
      </div>
    </header>
  );
}

function AuthPanel(props: {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  error: string;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <section className="mb-5 rounded-lg border border-white/10 bg-black/25 p-4 shadow-2xl shadow-black/20">
      <div className="mb-4 flex rounded-md bg-black/35 p-1">
        {(["login", "register"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => props.setAuthMode(mode)}
            className={`h-10 flex-1 rounded text-sm font-medium capitalize ${props.authMode === mode ? "bg-lime-300 text-black" : "text-white/70"}`}
          >
            {mode}
          </button>
        ))}
      </div>
      <form onSubmit={props.onSubmit} className="space-y-3">
        <input value={props.username} onChange={(event) => props.setUsername(event.target.value)} placeholder="Username" className="h-12 w-full rounded-md border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-lime-300" />
        <input value={props.password} onChange={(event) => props.setPassword(event.target.value)} placeholder="Password" type="password" className="h-12 w-full rounded-md border border-white/10 bg-black/30 px-3 text-white outline-none focus:border-lime-300" />
        {props.error ? <p className="text-sm text-red-300">{props.error}</p> : null}
        <button className="h-12 w-full rounded-md bg-lime-300 font-semibold text-black">Continue</button>
      </form>
    </section>
  );
}

function UserStrip({ user }: { user: User }) {
  return (
    <section className="mb-5 flex items-center gap-3 rounded-lg border border-lime-300/20 bg-lime-300/10 p-3">
      <ShieldCheck className="text-lime-200" size={22} />
      <div>
        <div className="text-sm text-white/60">Signed in as</div>
        <div className="font-semibold text-white">{user.username}</div>
      </div>
    </section>
  );
}

function RoomsPanel(props: {
  rooms: Room[];
  code: string;
  message: string;
  setCode: (value: string) => void;
  onJoin: (event: React.FormEvent) => void;
  onOpen: (code: string) => void;
}) {
  return (
    <section className="mb-6 rounded-lg border border-sky-300/20 bg-sky-300/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="text-sky-200" size={18} />
        <h2 className="font-semibold text-white">Friend Rooms</h2>
      </div>
      <form onSubmit={props.onJoin} className="mb-3 flex gap-2">
        <input
          value={props.code}
          onChange={(event) => props.setCode(event.target.value.toUpperCase())}
          placeholder="Room code"
          className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-3 text-sm font-semibold uppercase tracking-[0.12em] text-white outline-none focus:border-sky-300"
        />
        <button className="h-11 rounded-md bg-sky-300 px-4 text-sm font-black text-black">Join</button>
      </form>
      {props.message ? <div className="mb-3 text-sm text-red-200">{props.message}</div> : null}
      <div className="space-y-2">
        {props.rooms.slice(0, 3).map((room) => (
          <button
            key={room.id}
            onClick={() => props.onOpen(room.code)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-left"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{room.name}</div>
              <div className="text-xs text-white/45">{room.memberCount} players · {room.match.homeTeam} vs {room.match.awayTeam}</div>
            </div>
            <div className="rounded bg-white/10 px-2 py-1 text-xs font-black text-sky-100">{room.code}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MatchList({
  matches,
  view,
  now,
  user,
  onSelect,
  onCreateRoom,
}: {
  matches: Match[];
  view: MatchListView;
  now: number;
  user: User | null;
  onSelect: (id: string) => void;
  onCreateRoom: (id: string) => void;
}) {
  const nextMatches = useMemo(() => matches.slice(0, view === "active" ? 12 : 20), [matches, view]);
  const heading = view === "active" ? "Pick a Match" : view === "mine" ? "My Games" : "Recent Results";
  const empty = view === "mine"
    ? "Your games appear here after you join a room or make a prediction."
    : view === "past"
      ? "No completed matches yet."
      : "No live or upcoming matches available.";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">{heading}</h2>
        <span className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">{matches.length} synced</span>
      </div>
      {nextMatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center text-sm leading-6 text-white/45">
          {empty}
        </div>
      ) : null}
      <div className="space-y-3">
        {nextMatches.map((match, index) => (
          <motion.div
            key={match.id}
            className="match-card group relative w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.07] p-4 text-left shadow-lg shadow-black/10"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.035, duration: 0.28 }}
          >
            <div className="match-card-stripe" aria-hidden="true" />
            <button onClick={() => onSelect(match.id)} className="relative block w-full text-left">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass(match.status)}`}>{formatStatus(match.status)}</span>
                <span className="text-xs text-white/50">#{match.txlineFixtureId}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <TeamName name={match.homeTeam} align="right" />
                <MatchScore match={match} compact />
                <TeamName name={match.awayTeam} align="left" />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2 text-white/65">
                  <Clock size={16} />
                  <span className="truncate">{new Date(match.startTime).toLocaleString()}</span>
                </div>
                <span className={match.status === "FINISHED" ? "text-white/55" : now >= new Date(match.opensAt).getTime() ? "text-lime-200" : "text-white/70"}>
                  {match.status === "FINISHED"
                    ? "Full time"
                    : now >= new Date(match.opensAt).getTime()
                      ? "Open"
                      : formatDuration(new Date(match.startTime).getTime() - now)}
                </span>
              </div>
            </button>
            {user && match.status !== "FINISHED" ? (
              <div className="relative mt-3 border-t border-white/10 pt-3">
                <button
                  onClick={() => onCreateRoom(match.id)}
                  className="flex w-full items-center justify-between rounded-md bg-black/20 px-3 py-2 text-left transition hover:bg-white/8"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-white/65">
                    <Users size={14} className="text-sky-200" />
                    Friends only
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-sky-300/15 px-2 py-1 text-xs font-black text-sky-100">
                    <Plus size={12} />
                    Create
                  </span>
                </button>
              </div>
            ) : null}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function MatchExperience(props: {
  detail: MatchDetail | null;
  fallbackMatch: Match;
  room?: Room | null;
  leaderboard: LeaderboardRow[];
  user: User | null;
  now: number;
  adminToken: string;
  setAdminToken: (value: string) => void;
  showAdminTest: boolean;
  testGameStatus: TestGameStatus;
  simulatedEvents: EventRecord[];
  onBack: () => void;
  onRefreshTestGameStatus: () => void;
  onSubmit: (predictionType: PredictionType) => Promise<void>;
  onCancelPrediction: (predictionId: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<MatchPanelTab>("feed");
  const match = props.detail?.match ?? props.fallbackMatch;
  const rounds = props.detail?.rounds ?? [];
  const predictionRound = getRoundAtTime(match, rounds, props.now);
  const currentRound = predictionRound;
  const myState = props.detail?.myState ?? { score: 0, streak: 0 };
  const selectedPrediction = props.detail?.myPredictions.find((prediction) => prediction.roundId === predictionRound?.id && prediction.status !== "CANCELED");
  const fullTime = match.status === "FINISHED" || getEffectiveClockSeconds(match, props.now) >= matchDurationMinutes * 60;
  const halfTime = isHalfTime(match, props.now);
  const timeToLock = predictionRound ? getMsUntilRoundEnd(match, predictionRound, props.now) : null;
  const finalSeconds = timeToLock !== null && timeToLock > 0 && timeToLock <= 10_000;
  const predictionsClosed = !predictionRound || finalSeconds || (timeToLock !== null && timeToLock <= 0);
  const activationRemainingMs = selectedPrediction ? new Date(selectedPrediction.effectiveAt).getTime() - props.now : 0;
  const canCancelPrediction = selectedPrediction?.status === "PENDING" && activationRemainingMs > 0;
  const selectedPredictionLocked = selectedPrediction?.status === "PENDING" && activationRemainingMs <= 0;
  const predictionButtonsDisabled = predictionsClosed || Boolean(selectedPrediction);
  const confirmationSecondsRemaining = Math.max(0, Math.ceil(activationRemainingMs / 1000));
  const confirmationProgress = canCancelPrediction ? Math.min(100, Math.max(0, ((10_000 - activationRemainingMs) / 10_000) * 100)) : 100;

  const recentPredictions = props.detail?.myPredictions ?? [];
  const visibleEvents = dedupeTimelineEvents([...props.simulatedEvents, ...(props.detail?.events ?? [])]).slice(0, 30);
  const tabCounts: Record<MatchPanelTab, number> = {
    feed: visibleEvents.length,
    leaderboard: props.leaderboard.length,
    rounds: recentPredictions.length,
  };
  const leader = props.leaderboard[0];

  useEffect(() => {
    if (fullTime) setActiveTab("leaderboard");
  }, [fullTime]);

  return (
    <section className="pb-6">
      <button onClick={props.onBack} className="mb-4 flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/8 px-3 text-sm font-medium text-white">
        <ArrowLeft size={17} />
        Matches
      </button>

      {props.room ? <RoomHeader room={props.room} /> : null}

      <div className="match-stage mb-4 overflow-hidden rounded-lg border border-white/10 bg-black/30">
        <div className="relative border-b border-white/10 bg-white/[0.06] p-4">
          <div className="pulse-ring" aria-hidden="true" />
          <div className="mb-2 flex items-center justify-between">
            <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass(match.status)}`}>{formatStatus(match.status)}</span>
            <span className="text-xs text-white/50">{props.room ? `Room ${props.room.code}` : `TxLINE #${match.txlineFixtureId}`}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamName name={match.homeTeam} align="right" />
            <MatchScore match={match} />
            <TeamName name={match.awayTeam} align="left" />
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-white/10">
          <Stat label="Score" value={formatScore(myState.score)} />
          <Stat label="Streak" value={`x${formatMultiplier(myState.streak)}`} active={myState.streak >= 3} />
          <Stat label="Round" value={fullTime ? "FT" : halfTime ? "HT" : currentRound ? `${currentRound.startMinute}-${currentRound.endMinute}` : "Pre"} />
        </div>
      </div>

      {fullTime ? (
        <section className="mb-5 rounded-lg border border-lime-300/30 bg-lime-300/10 p-4 text-center">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">Full Time</div>
          <div className="mt-2 text-2xl font-black text-white">Final Leaderboard</div>
          <div className="mt-1 text-sm text-white/55">Predictions are closed after 90 minutes.</div>
        </section>
      ) : (
        <>
          <section className={`mb-4 rounded-lg border p-4 ${finalSeconds ? "animate-pulse border-red-300/60 bg-red-400/10" : "border-lime-300/20 bg-lime-300/10"}`}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-lime-100">Current Prediction Round</div>
              <div className="text-sm text-white/60">{predictionRound ? `${predictionRound.startMinute}' - ${predictionRound.endMinute}'` : "Closed"}</div>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-4xl font-semibold text-white">{timeToLock !== null ? formatDuration(timeToLock) : "--:--"}</div>
                <div className="mt-1 text-sm text-white/60">
                  {halfTime ? "Half-time break. Predictions resume in the second half." : predictionRound ? (predictionsClosed ? "Predictions closed for this round" : "Predictions activate after 10 seconds") : "No prediction round is open"}
                </div>
              </div>
              {selectedPrediction ? (
                <div className="rounded-md bg-black/30 px-3 py-2 text-right">
                  <div className="text-xs text-white/50">{canCancelPrediction ? "Confirming" : selectedPredictionLocked ? "Locked pick" : "Your pick"}</div>
                  <div className="text-sm font-semibold text-white">{formatPrediction(selectedPrediction.predictionType)}</div>
                </div>
              ) : null}
            </div>
          </section>

          {halfTime ? (
            <section className="mb-5 rounded-lg border border-yellow-300/45 bg-yellow-300/12 p-4 text-center shadow-lg shadow-yellow-300/10">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-yellow-100">Half-Time Break</div>
              <div className="mt-2 text-2xl font-black text-white">Predictions Paused</div>
              <div className="mt-1 text-sm text-white/60">Rounds resume automatically when TxLINE reports the second half has started.</div>
            </section>
          ) : null}

          <section className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-white">Prediction</h2>
              <span className="text-xs text-white/50">{halfTime ? "Paused" : "Closes in final 10 seconds"}</span>
            </div>
            {halfTime ? (
              <div className="rounded-lg border border-white/10 bg-black/25 px-4 py-6 text-center text-sm font-semibold text-white/55">
                Waiting for second half kickoff
              </div>
            ) : (
              <div className="relative">
                <div className="grid grid-cols-2 gap-2">
                  {predictionOptions.map((option) => {
                    const active = selectedPrediction?.predictionType === option.value;
                    return (
                      <motion.button
                        key={option.value}
                        disabled={predictionButtonsDisabled}
                        onClick={() => props.onSubmit(option.value)}
                        className={`relative h-[82px] overflow-hidden rounded-lg border p-3 text-left transition disabled:opacity-40 ${active ? "border-white bg-lime-300 text-black shadow-lg shadow-lime-300/20" : "border-white/10 bg-white/8 text-white"}`}
                        whileTap={{ scale: 0.96 }}
                        animate={active ? { y: [0, -2, 0] } : { y: 0 }}
                        transition={active ? { repeat: Infinity, duration: 1.4 } : undefined}
                      >
                        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${option.tone}`} />
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-2xl leading-none">{option.icon}</span>
                          <span className={active ? "text-xs font-black text-black/60" : "text-xs font-black text-lime-200"}>+{option.points}</span>
                        </div>
                        <div className="text-sm font-black">{option.label}</div>
                        <div className={active ? "text-xs text-black/70" : "text-xs text-white/50"}>{option.points} base points</div>
                      </motion.button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {selectedPrediction ? (
                    <motion.div
                      className="absolute inset-0 z-20 rounded-lg bg-black/55 p-3 backdrop-blur-[2px]"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className={`rounded-lg border p-3 ${canCancelPrediction ? "border-lime-300/45 bg-[#202d18] shadow-lg shadow-lime-300/10" : "border-white/10 bg-[#151815]"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {canCancelPrediction ? "Confirming prediction" : "Prediction locked"}
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              {canCancelPrediction
                                ? "You can cancel before it activates. Events only count after activation."
                                : "This round's prediction cannot be changed."}
                            </div>
                          </div>
                          {canCancelPrediction ? (
                            <button
                              onClick={() => props.onCancelPrediction(selectedPrediction.id)}
                              className="h-10 rounded-md border border-red-300/40 bg-red-400/10 px-3 text-xs font-black text-red-100 transition hover:bg-red-400/20"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                        {canCancelPrediction ? (
                          <div className="mt-3">
                            <div className="mb-2 flex items-end justify-between">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-lime-100">Locks in</span>
                              <span className="font-mono text-3xl font-black leading-none text-white">{confirmationSecondsRemaining}s</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-white/10">
                              <motion.div
                                className="h-full rounded-full bg-lime-300"
                                initial={false}
                                animate={{ width: `${confirmationProgress}%` }}
                                transition={{ duration: 0.2, ease: "linear" }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            )}
          </section>
        </>
      )}

      <section className="mb-5 rounded-lg border border-white/10 bg-black/25 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Match Center</h2>
            <div className="text-xs text-white/45">
              {leader ? `#1 ${leader.username} · ${formatScore(leader.score)} pts` : "Live feed and rankings"}
            </div>
          </div>
          {props.user ? (
            <div className="rounded bg-white/8 px-2 py-1 text-xs font-semibold text-white/70">
              {props.user.username}
            </div>
          ) : null}
        </div>

        {!fullTime ? <div className="mb-3 grid grid-cols-3 gap-1 rounded-md bg-white/8 p-1">
          {([
            ["feed", "Feed"],
            ["leaderboard", "Leaders"],
            ["rounds", "Rounds"],
          ] as Array<[MatchPanelTab, string]>).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`h-10 rounded px-2 text-xs font-black transition ${activeTab === value ? "bg-lime-300 text-black" : "text-white/60 hover:bg-white/8 hover:text-white"}`}
            >
              {label}
              <span className={activeTab === value ? "ml-1 text-black/55" : "ml-1 text-white/35"}>{tabCounts[value]}</span>
            </button>
          ))}
        </div> : null}

        <AnimatePresence mode="wait" initial={false}>
          {activeTab === "feed" ? (
            <motion.div key="feed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <Timeline events={visibleEvents} compact />
            </motion.div>
          ) : null}
          {(fullTime || activeTab === "leaderboard") ? (
            <motion.div key="leaderboard" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <MatchLeaderboard rows={props.leaderboard} user={props.user} compact />
            </motion.div>
          ) : null}
          {activeTab === "rounds" ? (
            <motion.div key="rounds" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <RecentPredictions predictions={recentPredictions} compact />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>

      {props.showAdminTest ? (
        <AdminTestControls
          matchId={match.id}
          adminToken={props.adminToken}
          setAdminToken={props.setAdminToken}
          status={props.testGameStatus}
          onRefresh={props.onRefreshTestGameStatus}
        />
      ) : null}
    </section>
  );
}

function RoomHeader({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    const text = `Join my Next3 room ${room.code} for ${room.match.homeTeam} vs ${room.match.awayTeam}`;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="mb-4 rounded-lg border border-sky-300/25 bg-sky-300/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-sky-100">
            <Users size={15} />
            Private Room
          </div>
          <div className="truncate text-lg font-black text-white">{room.name}</div>
          <div className="text-xs text-white/50">{room.memberCount} players joined</div>
        </div>
        <button onClick={copyCode} className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-sky-300 text-black" aria-label="Copy room code">
          <Copy size={18} />
        </button>
      </div>
      <div className="flex items-center justify-between rounded-md bg-black/25 px-3 py-2">
        <span className="text-xs font-semibold text-white/50">Share code</span>
        <span className="text-lg font-black tracking-[0.18em] text-sky-100">{copied ? "COPIED" : room.code}</span>
      </div>
    </section>
  );
}

function RecentPredictions({ predictions, compact = false }: { predictions: Prediction[]; compact?: boolean }) {
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

function Timeline({ events, compact = false }: { events: EventRecord[]; compact?: boolean }) {
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

function dedupeTimelineEvents(events: EventRecord[]): EventRecord[] {
  const accepted: EventRecord[] = [];

  for (const event of events) {
    if (isNonDisplayTimelineEvent(event)) continue;

    if (event.simulated) {
      if (!accepted.some((acceptedEvent) => acceptedEvent.id === event.id)) {
        accepted.push(event);
      }
      continue;
    }

    const eventTime = new Date(event.createdAt).getTime();
    const duplicate = accepted.some((acceptedEvent) => {
      if (acceptedEvent.simulated) return false;
      if (acceptedEvent.eventType !== event.eventType) return false;
      if (acceptedEvent.minute !== event.minute) return false;
      if (acceptedEvent.participant !== event.participant) return false;

      return Math.abs(new Date(acceptedEvent.createdAt).getTime() - eventTime) < 90_000;
    });

    if (!duplicate) accepted.push(event);
  }

  return accepted;
}

function isNonDisplayTimelineEvent(event: EventRecord): boolean {
  const primaryAction = event.rawAction.split(" ")[0]?.toLowerCase();
  return primaryAction === "var" || primaryAction === "score_adjustment" || primaryAction === "action_amend";
}

function shouldShowEventNotification(event: EventRecord, shownEvents: Map<string, number>): boolean {
  const now = Date.now();
  const key = eventNotificationKey(event);
  const previousTimestamp = shownEvents.get(key);

  for (const [storedKey, timestamp] of shownEvents) {
    if (now - timestamp > 90_000) shownEvents.delete(storedKey);
  }

  if (previousTimestamp && now - previousTimestamp < 90_000) {
    return false;
  }

  shownEvents.set(key, now);
  return true;
}

function eventNotificationKey(event: EventRecord): string {
  return [
    event.matchId,
    event.eventType,
    event.minute ?? "-",
    event.participant ?? "-",
    event.rawAction,
  ].join(":");
}

function MatchLeaderboard({ rows, user, compact = false }: { rows: LeaderboardRow[]; user: User | null; compact?: boolean }) {
  return (
    <section className={compact ? "" : "mb-5"}>
      {!compact ? <h2 className="mb-3 font-semibold text-white">Match Leaderboard</h2> : null}
      <LeaderboardList rows={rows} user={user} empty="No points yet" />
    </section>
  );
}

function AdminTestControls(props: {
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

function GlobalLeaderboard({
  rows,
  currentUserRank,
  user,
}: {
  rows: LeaderboardRow[];
  currentUserRank: LeaderboardRow | null;
  user: User | null;
}) {
  const currentUserVisible = rows.some((row) => row.username === user?.username);
  const pinnedUserRank = user && currentUserRank && !currentUserVisible ? currentUserRank : null;

  return (
    <section className="pb-6">
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="text-lime-200" size={18} />
        <h2 className="font-semibold text-white">Global Leaders</h2>
      </div>
      <LeaderboardList rows={rows} user={user} empty="Scores appear after live rounds resolve" />
      {pinnedUserRank ? (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Your position</div>
          <LeaderboardList rows={[pinnedUserRank]} user={user} empty="" />
        </div>
      ) : null}
    </section>
  );
}

function LeaderboardList({ rows, user, empty }: { rows: LeaderboardRow[]; user: User | null; empty: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-black/25 p-3">
      {rows.length === 0 ? <div className="py-6 text-center text-sm text-white/45">{empty}</div> : null}
      <AnimatePresence initial={false}>
        {rows.map((row) => (
          <motion.div
            layout
            key={row.username}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-3 rounded-md px-3 py-2 ${row.username === user?.username ? "bg-lime-300 text-black" : "bg-white/[0.06] text-white"}`}
          >
            <div className="grid h-8 w-8 place-items-center rounded-full bg-black/20 text-sm font-bold">{row.rank}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{row.username}</div>
              <div className={row.username === user?.username ? "text-xs text-black/60" : "text-xs text-white/45"}>
                Streak {row.streak ?? row.bestStreak ?? 0}
              </div>
            </div>
            <div className="text-lg font-semibold">{formatScore(row.score)}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function LiveOverlays({ event, notice, confetti }: { event: EventRecord | null; notice: string; confetti: boolean }) {
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

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 24 }).map((_, index) => (
        <span key={index} className="confetti-piece" style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 8) * 80}ms` }} />
      ))}
    </div>
  );
}

function Stat({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="p-3 text-center">
      <div className="text-xs text-white/45">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${active ? "text-lime-200" : "text-white"}`}>{value}</div>
    </div>
  );
}

function TeamName({ name, align }: { name: string; align: "left" | "right" }) {
  return <div className={`min-w-0 text-base font-semibold text-white ${align === "right" ? "text-right" : "text-left"}`}>{name}</div>;
}

function MatchScore({ match, compact = false }: { match: Match; compact?: boolean }) {
  if (match.status === "SCHEDULED") {
    return <div className="rounded bg-white/10 px-2 py-1 text-xs text-white/70">vs</div>;
  }

  return (
    <motion.div
      key={`${match.id}-${match.homeScore}-${match.awayScore}-${compact ? "compact" : "full"}`}
      className={
        compact
          ? "min-w-[54px] rounded bg-lime-300 px-2 py-1 text-center text-sm font-black text-black shadow shadow-lime-300/20"
          : "min-w-[78px] rounded-lg border border-lime-200/40 bg-lime-300 px-3 py-2 text-center text-2xl font-black text-black shadow-lg shadow-lime-300/20"
      }
      initial={{ scale: 1.08 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
    >
      {match.homeScore} - {match.awayScore}
    </motion.div>
  );
}

function statusClass(status: Match["status"]) {
  if (status === "LIVE") return "bg-red-400 text-black";
  if (status === "HALF_TIME") return "bg-yellow-300 text-black";
  if (status === "OPEN") return "bg-lime-300 text-black";
  if (status === "FINISHED") return "bg-white text-black";
  return "bg-white/10 text-white/70";
}

function formatStatus(status: Match["status"]) {
  return status.replace(/_/g, " ");
}

function eventIcon(eventType: string) {
  if (eventType === "GOAL") return "⚽";
  if (eventType === "YELLOW_CARD") return "🟨";
  if (eventType === "RED_CARD") return "🟥";
  if (eventType === "CORNER") return "🚩";
  if (eventType === "SUBSTITUTION") return "🔄";
  return "•";
}

function formatPrediction(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDuration(ms: number) {
  const abs = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function getRoundAtTime(match: Match, rounds: Round[], now: number) {
  if (match.status !== "LIVE" && match.status !== "OPEN" && !match.clockRunning) return null;
  if (isHalfTime(match, now)) return null;

  const elapsedMinute = getMatchElapsedMinute(match, now);
  if (elapsedMinute === null) return null;
  if (elapsedMinute >= matchDurationMinutes) return null;

  const roundNumber = Math.floor(elapsedMinute / 3) + 1;
  return rounds.find((round) => round.number === roundNumber) ?? null;
}

function getMatchElapsedMinute(match: Match, now: number) {
  const clockSeconds = getEffectiveClockSeconds(match, now);
  if (clockSeconds > 0 || match.clockRunning) return Math.floor(clockSeconds / 60);
  if (match.status === "LIVE") return null;

  const kickoff = new Date(match.startTime).getTime();
  if (!Number.isFinite(kickoff) || now < kickoff) return null;
  return Math.floor((now - kickoff) / 60_000);
}

function getMsUntilRoundEnd(match: Match, round: Round, now: number) {
  const clockSeconds = getEffectiveClockSeconds(match, now);
  if (clockSeconds > 0 || match.clockRunning) {
    return Math.max(0, (round.endMinute * 60 - clockSeconds) * 1000);
  }
  if (match.status === "LIVE") return null;

  const roundEndsAt = new Date(match.startTime).getTime() + round.endMinute * 60_000;
  return roundEndsAt - now;
}

function isHalfTime(match: Match, now: number) {
  const clockSeconds = getEffectiveClockSeconds(match, now);
  if (match.clockRunning && clockSeconds > 45 * 60) return false;
  if (match.status === "HALF_TIME") return true;
  if (match.status !== "LIVE") return false;
  if (clockSeconds >= 45 * 60 && clockSeconds < 46 * 60 && !match.clockRunning) return true;

  const kickoff = new Date(match.startTime).getTime();
  if (!Number.isFinite(kickoff)) return false;
  const wallClockMinute = Math.floor((now - kickoff) / 60_000);
  return match.clockSeconds === 0 && wallClockMinute >= 45 && wallClockMinute < 65;
}

function getEffectiveClockSeconds(match: Match, now: number): number {
  if (!match.clockRunning || !match.clockUpdatedAt) return match.clockSeconds;
  const syncedAt = new Date(match.clockUpdatedAt).getTime();
  if (!Number.isFinite(syncedAt)) return match.clockSeconds;
  return match.clockSeconds + Math.max(0, Math.floor((now - syncedAt) / 1000));
}

function formatMultiplier(streak: number) {
  if (streak >= 5) return "2";
  if (streak === 4) return "1.5";
  if (streak === 3) return "1.25";
  if (streak === 2) return "1.1";
  return streak > 0 ? "1" : "0";
}

function triggerConfetti(setConfetti: (value: boolean) => void) {
  setConfetti(true);
  window.setTimeout(() => setConfetti(false), 1800);
}
