import { ONLINE_MODES } from "./constants/labels";
import { useAppController } from "./hooks/useAppController";
import { GameScreen } from "./screens/GameScreen";
import {
  FriendHostRulesScreen,
  FriendPasswordScreen,
  FriendReviewScreen,
  ReadyScreen,
} from "./screens/FriendScreens";
import { MatchScreen, OnlineSelectScreen } from "./screens/OnlineScreens";
import { ResultScreen } from "./screens/ResultScreen";
import { SoloSettingsScreen } from "./screens/SoloSettingsScreen";
import { TitleScreen } from "./screens/TitleScreen";

/**
 * ルートコンポーネント。
 * 画面の出し分けのみを担当し、状態管理は useAppController に委譲する。
 */
export default function App() {
  const app = useAppController();

  return (
    <>
      {app.screen === "title" && (
        <TitleScreen
          onSolo={() => app.setScreen("soloSettings")}
          onOnline={() => app.setScreen("onlineSelect")}
          onFriend={() => {
            app.setFriendPassword("");
            app.setScreen("friendPassword");
          }}
        />
      )}

      {app.screen === "soloSettings" && (
        <SoloSettingsScreen
          settings={app.soloSettings}
          onChange={app.setSoloSettings}
          onStart={() => app.startSolo(app.soloSettings)}
          onBack={app.goTitle}
        />
      )}

      {app.screen === "onlineSelect" && (
        <OnlineSelectScreen onSelect={app.startOnline} onBack={app.goTitle} />
      )}

      {app.screen === "match" && (
        <MatchScreen
          modeLabel={ONLINE_MODES[app.matchMode].label}
          message={app.matchMessage}
          countdown={app.matchCountdown}
          onBack={app.goTitle}
        />
      )}

      {app.screen === "friendPassword" && (
        <FriendPasswordScreen
          password={app.friendPassword}
          message={app.message}
          onPasswordChange={app.setFriendPassword}
          onJoin={app.joinFriend}
          onBack={app.goTitle}
        />
      )}

      {app.screen === "friendHostRules" && (
        <FriendHostRulesScreen
          rules={app.friendRules}
          message={app.message}
          onChange={app.setFriendRules}
          onSend={() => app.socketRef.current?.emit("set_exhibition_rules", app.friendRules)}
        />
      )}

      {app.screen === "friendReview" && app.reviewRules && (
        <FriendReviewScreen
          rules={app.reviewRules}
          message={app.message}
          onApprove={() => app.socketRef.current?.emit("approve_exhibition_rules")}
        />
      )}

      {app.screen === "ready" && app.readyRules && (
        <ReadyScreen
          rules={app.readyRules}
          status={app.readyStatus}
          onStart={() => app.socketRef.current?.emit("ready_start")}
        />
      )}

      {app.screen === "game" && (
        <GameScreen
          title={app.gameTitle}
          hint={app.gameHint}
          target={app.target}
          timeLeft={app.timeLeft}
          rules={app.rules}
          rounds={app.rounds}
          problemStates={app.problemStates}
          activeProblem={app.activeProblem}
          submitted={app.submitted}
          message={app.message}
          onActiveProblemChange={app.setActiveProblem}
          onProblemStatesChange={app.setProblemStates}
          onSubmit={app.playMode === "solo" ? app.submitSolo : app.submitMultiplayer}
          onQuit={() => {
            if (app.playMode === "friend") app.socketRef.current?.emit("leave_exhibition");
            app.goTitle();
          }}
        />
      )}

      {app.screen === "result" && (
        <ResultScreen
          resultText={app.resultText}
          outcome={app.resultOutcome}
          onRetry={app.retry}
          onBackToTitle={app.goTitle}
        />
      )}
    </>
  );
}
