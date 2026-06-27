"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useGameController } from "./game/use-game-controller.js";
import { HomeTabs } from "./game/components/HomeTabs.js";
import { MatchViewTabs } from "./game/components/MatchViewTabs.js";
import { Header } from "./game/components/Header.js";
import { AuthPanel } from "./game/components/AuthPanel.js";
import { UserStrip } from "./game/components/UserStrip.js";
import { RoomsPanel } from "./game/components/RoomsPanel.js";
import { MatchList } from "./game/components/MatchList.js";
import { GlobalLeaderboard } from "./game/components/GlobalLeaderboard.js";
import { LiveOverlays } from "./game/components/LiveOverlays.js";
import { MatchExperience } from "./game/components/MatchExperience.js";

export default function Home() {
  const c = useGameController();
  const {
    user, matches, rooms, detail, roomDetail, matchLeaderboard, roomLeaderboard, globalLeaderboard,
    globalCurrentUserRank, authMode, homeTab, matchListView, username, password, joinRoomCode, roomMessage, error, notice,
    liveBanner, confetti, showAdminTest, adminToken, testGameStatus, simulatedEvents, now, selectedRoom, selectedMatch,
    submitAuth, logout, createRoom, joinRoom, submitPrediction, cancelPrediction, closeMatch, selectMatch, selectRoom,
    selectMatchView, loadTestGameStatus, setAuthMode, setHomeTab, setUsername, setPassword, setJoinRoomCode, setAdminToken,
  } = c;
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
          onBack={closeMatch}
          adminToken={adminToken}
          setAdminToken={setAdminToken}
          showAdminTest={showAdminTest}
          testGameStatus={testGameStatus}
          simulatedEvents={showAdminTest ? simulatedEvents : []}
          onRefreshTestGameStatus={loadTestGameStatus}
          onSubmit={submitPrediction}
          onCancelPrediction={cancelPrediction}
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
                  setActiveView={selectMatchView}
                  showMine={Boolean(user)}
                />
                <MatchList
                  matches={matches}
                  view={matchListView}
                  now={now}
                  user={user}
                  onSelect={selectMatch}
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
                  onOpen={selectRoom}
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
