import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createMultiplayerSocket, MULTIPLAYER_ENABLED } from "./config";
import { createSoloSession, finishSolo, getSoloTimeLeft, type SoloSession } from "./solo/game";
import {
  appendOperator,
  clearExpression,
  pickNumber,
  ProblemBoard,
  undoExpression,
} from "./components/ProblemBoard";
import { RulesForm, rulesSummary } from "./components/RulesForm";
import type {
  FriendRules,
  GameRules,
  GradeResult,
  PlayMode,
  ProblemState,
  Screen,
  SoloResult,
  SoloSettings,
  VersusResult,
} from "./types";
import { DEFAULT_RULES as defaultRules } from "./types";

const CPU_LABELS: Record<string, string> = { weak: "弱", medium: "中", strong: "強" };
const ONLINE_LABELS: Record<string, string> = { quick: "すぱっと", normal: "ふつう", slow: "じっくり" };

function initProblemStates(count: number): ProblemState[] {
  return Array.from({ length: count }, () => ({ expression: "", usedIdx: [] }));
}

function formatResults(label: string, results: GradeResult[], total: number | null) {
  let s = `${label} 合計差: ${total ?? "—"}\n`;
  results.forEach((r, i) => {
    if (!r || !r.expr) s += `  問${i + 1}: 未提出${r.errors?.length ? `（${r.errors.join("、")}）` : ""}\n`;
    else s += `  問${i + 1}: ${r.expr} = ${r.value}（差 ${r.diff}）${r.valid ? "" : " ※無効"}\n`;
  });
  return s;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [playMode, setPlayMode] = useState<PlayMode>("solo");
  const [message, setMessage] = useState("");

  const [soloSettings, setSoloSettings] = useState<SoloSettings>({
    problems: 3,
    duration: 30,
    target: 200,
    cpu_level: "medium",
    ...defaultRules,
  });
  const lastSoloSettings = useRef<SoloSettings | null>(null);

  const [friendPassword, setFriendPassword] = useState("");
  const [friendRules, setFriendRules] = useState<FriendRules>({
    problems: 3,
    duration: 30,
    target: 200,
    ...defaultRules,
  });
  const [reviewRules, setReviewRules] = useState<FriendRules | null>(null);
  const [readyRules, setReadyRules] = useState<FriendRules | null>(null);
  const [, setIsHost] = useState(false);

  const soloSessionRef = useRef<SoloSession | null>(null);
  const [rounds, setRounds] = useState<number[][]>([]);
  const [target, setTarget] = useState(200);
  const [rules, setRules] = useState<GameRules>(defaultRules);
  const [problemStates, setProblemStates] = useState<ProblemState[]>([]);
  const [activeProblem, setActiveProblem] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [submitted, setSubmitted] = useState(false);
  const [gameTitle, setGameTitle] = useState("ゲーム");
  const [gameHint, setGameHint] = useState("");

  const [resultText, setResultText] = useState("");
  const [resultWinner, setResultWinner] = useState<"win" | "lose" | "draw" | null>(null);

  const [matchMode, setMatchMode] = useState("normal");
  const [matchMessage, setMatchMessage] = useState("");
  const [matchCountdown, setMatchCountdown] = useState(12);
  const [readyStatus, setReadyStatus] = useState("開始ボタンを押してください");

  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soloFinishedRef = useRef(false);
  const problemStatesRef = useRef(problemStates);

  useEffect(() => {
    problemStatesRef.current = problemStates;
  }, [problemStates]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    soloSessionRef.current = null;
  }, []);

  const stopSocket = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  const goTitle = useCallback(() => {
    stopPoll();
    stopSocket();
    setSubmitted(false);
    setMessage("");
    setScreen("title");
  }, [stopPoll, stopSocket]);

  const showSoloResult = (data: SoloResult, timedOut = false) => {
    let msg = `目標 ${data.target}\n\n`;
    msg += formatResults("あなた", data.player_results, data.player_total_diff);
    msg += "\n" + formatResults("CPU", data.cpu_results, data.cpu_total_diff);
    if (timedOut) msg += "\n時間切れ（未提出あり）";
    setResultText(msg);
    if (data.winner === "player") setResultWinner("win");
    else if (data.winner === "cpu") setResultWinner("lose");
    else setResultWinner("draw");
    setScreen("result");
  };

  const showVersusResult = (data: VersusResult) => {
    const role = data.role || "A";
    let msg = `目標 ${data.target}\n\n`;
    msg += formatResults("あなた", data.my_results, data.my_total_diff);
    msg += "\n" + formatResults("相手", data.op_results, data.op_total_diff);
    setResultText(msg);
    if (data.winner === role) setResultWinner("win");
    else if (data.winner === "引き分け") setResultWinner("draw");
    else setResultWinner("lose");
    setScreen("result");
  };

  const setupGame = (
    title: string,
    hint: string,
    newRounds: number[][],
    newTarget: number,
    newDuration: number,
    newRules: GameRules
  ) => {
    setGameTitle(title);
    setGameHint(hint);
    setRounds(newRounds);
    setTarget(newTarget);
    setRules(newRules);
    setTimeLeft(newDuration);
    setProblemStates(initProblemStates(newRounds.length));
    setActiveProblem(0);
    setSubmitted(false);
    setMessage("");
    setScreen("game");
  };

  const startSolo = (settings: SoloSettings) => {
    stopPoll();
    stopSocket();
    soloFinishedRef.current = false;
    lastSoloSettings.current = settings;

    const session = createSoloSession(settings);
    soloSessionRef.current = session;
    setPlayMode("solo");
    setupGame(
      "1人 vs CPU",
      `${session.problems}問・${session.duration}秒・CPU:${CPU_LABELS[settings.cpu_level]}`,
      session.rounds,
      session.target,
      session.duration,
      session.rules
    );

    pollRef.current = setInterval(() => {
      const s = soloSessionRef.current;
      if (!s || soloFinishedRef.current) return;
      const left = getSoloTimeLeft(s);
      setTimeLeft(left);
      if (left <= 0) {
        soloFinishedRef.current = true;
        setSubmitted(true);
        stopPoll();
        showSoloResult(finishSolo(s, problemStatesRef.current, true), true);
      }
    }, 250);
  };

  const handleSubmitSolo = () => {
    const session = soloSessionRef.current;
    if (!session || submitted) return;
    soloFinishedRef.current = true;
    setSubmitted(true);
    stopPoll();
    showSoloResult(finishSolo(session, problemStates));
  };

  const bindFriendSocket = (socket: Socket) => {
    socket.on("exhibition_joined", (d: { is_host: boolean; message?: string }) => {
      setIsHost(d.is_host);
      if (d.is_host && d.message?.includes("相手")) {
        setScreen("friendHostRules");
      } else if (d.is_host) {
        setMessage(d.message ?? "相手の参加を待っています…");
        setScreen("friendPassword");
      } else {
        setMessage("参加しました。ホストのルール設定を待っています…");
        setScreen("friendPassword");
      }
    });
    socket.on("host_set_rules", () => setScreen("friendHostRules"));
    socket.on("guest_waiting_rules", (d: { message: string }) => {
      setMessage(d.message);
      setScreen("friendPassword");
    });
    socket.on("rules_proposed", (d: { rules: FriendRules }) => {
      setReviewRules(d.rules);
      setScreen("friendReview");
    });
    socket.on("rules_sent", (d: { message: string }) => setMessage(d.message));
    socket.on("ready_phase", (d: { rules: FriendRules; message: string }) => {
      setReadyRules(d.rules);
      setReadyStatus(d.message);
      setScreen("ready");
    });
    socket.on("ready_status", (d: { ready_count: number; need: number }) => {
      setReadyStatus(`準備 ${d.ready_count}/${d.need}`);
    });
    socket.on("waiting_opponent", (d: { message: string }) => setReadyStatus(d.message));
    socket.on("opponent_waiting", (d: { message: string }) => setReadyStatus(d.message));
    socket.on("all_ready", (d: { message: string }) => setReadyStatus(d.message));
    socket.on("start_countdown", (d: { count: number }) => {
      setReadyStatus(`スタートまで ${d.count}…`);
    });
    socket.on("game_start", (d: {
      rounds: number[][];
      target: number;
      duration: number;
      problems: number;
      rules: GameRules;
    }) => {
      setPlayMode("friend");
      setupGame(
        "フレンド対戦",
        `${d.problems}問・${d.duration}秒`,
        d.rounds,
        d.target,
        d.duration,
        d.rules
      );
    });
    socket.on("update", (d: { time_left?: number }) => {
      if (d.time_left !== undefined) setTimeLeft(d.time_left);
    });
    socket.on("submit_ok", () => {
      setSubmitted(true);
      setMessage("提出しました。相手を待っています…");
    });
    socket.on("submit_error", (d: { message: string }) => setMessage(d.message));
    socket.on("opponent_submitted", (d: { message: string }) => setMessage(d.message));
    socket.on("game_over", (d: VersusResult) => {
      setSubmitted(true);
      stopSocket();
      showVersusResult(d);
    });
    socket.on("opponent_left", (d: { message: string }) => {
      setMessage(d.message);
      setReadyStatus(d.message);
      setSubmitted(true);
    });
    socket.on("error_msg", (d: { message: string }) => setMessage(d.message));
  };

  const startOnline = (mode: string) => {
    stopPoll();
    stopSocket();
    setPlayMode("online");
    setMatchMode(mode);
    setMatchMessage("対戦相手を探しています…");
    setMatchCountdown(12);
    setScreen("match");

    const socket = createMultiplayerSocket();
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join_online", { mode }));
    socket.on("waiting", (d: { message: string }) => setMatchMessage(d.message));
    socket.on("matched", (d: { role: string }) => setMatchMessage(`あなたは ${d.role} です`));
    socket.on("countdown", (d: { count: number }) => setMatchCountdown(d.count));
    socket.on("game_start", (d: {
      rounds: number[][];
      target: number;
      duration: number;
      mode_label: string;
      rules: GameRules;
    }) => {
      setupGame(
        `オンライン ${d.mode_label}`,
        "200固定・3問・まとめて提出",
        d.rounds,
        d.target,
        d.duration,
        d.rules
      );
    });
    socket.on("update", (d: { time_left?: number }) => {
      if (d.time_left !== undefined) setTimeLeft(d.time_left);
    });
    socket.on("submit_ok", () => {
      setSubmitted(true);
      setMessage("提出しました。相手を待っています…");
    });
    socket.on("submit_error", (d: { message: string }) => setMessage(d.message));
    socket.on("opponent_submitted", (d: { message: string }) => setMessage(d.message));
    socket.on("game_over", (d: VersusResult) => {
      setSubmitted(true);
      stopSocket();
      showVersusResult(d);
    });
    socket.on("opponent_left", (d: { message: string }) => {
      setMessage(d.message);
      setSubmitted(true);
    });
    socket.on("error_msg", (d: { message: string }) => setMatchMessage(d.message));
  };

  const joinFriend = () => {
    if (!/^\d{4}$/.test(friendPassword.trim())) {
      setMessage("4桁の数字を入力してください");
      return;
    }
    stopPoll();
    stopSocket();
    setPlayMode("friend");
    const socket = createMultiplayerSocket();
    socketRef.current = socket;
    bindFriendSocket(socket);
    socket.on("connect", () => socket.emit("join_exhibition", { password: friendPassword.trim() }));
  };

  const submitMulti = () => {
    if (submitted || !socketRef.current) return;
    socketRef.current.emit("submit_multi", {
      expressions: problemStates.map((s) => s.expression),
      used_indices: problemStates.map((s) => s.usedIdx),
    });
  };

  useEffect(() => () => {
    stopPoll();
    stopSocket();
  }, [stopPoll, stopSocket]);

  const opButtons = ["(", ")", "+", "-"];
  if (rules.allow_mul) opButtons.push("*");
  if (rules.allow_div) opButtons.push("/");

  const winnerLabel =
    resultWinner === "win" ? "勝ち！" : resultWinner === "lose" ? "負け…" : "引き分け！";

  return (
    <>
      {screen === "title" && (
        <div className="container">
          <h1>200計算ゲーム</h1>
          <p className="subtitle">数字を選んで目標値に近づけ！</p>
          <div className="menu-list">
            <button type="button" className="menu-btn solo" onClick={() => setScreen("soloSettings")}>
              1人プレイ
            </button>
            {MULTIPLAYER_ENABLED && (
              <>
                <button type="button" className="menu-btn online" onClick={() => setScreen("onlineSelect")}>
                  オンライン対戦
                </button>
                <button
                  type="button"
                  className="menu-btn friend"
                  onClick={() => {
                    setFriendPassword("");
                    setMessage("");
                    setScreen("friendPassword");
                  }}
                >
                  フレンド対戦
                </button>
              </>
            )}
          </div>
          {!MULTIPLAYER_ENABLED && (
            <p className="hint">1人プレイはオフラインで動作します。対戦にはサーバー接続が必要です。</p>
          )}
        </div>
      )}

      {screen === "soloSettings" && (
        <div className="container">
          <h2>1人プレイ 設定</h2>
          <div className="form-grid">
            <label>
              問題数
              <input
                type="number" min={1} max={5}
                value={soloSettings.problems}
                onChange={(e) => setSoloSettings({ ...soloSettings, problems: Number(e.target.value) })}
              />
            </label>
            <label>
              制限時間（秒）
              <input
                type="number" min={5} max={300}
                value={soloSettings.duration}
                onChange={(e) => setSoloSettings({ ...soloSettings, duration: Number(e.target.value) })}
              />
            </label>
            <label>
              目標値
              <input
                type="number" min={10} max={2000}
                value={soloSettings.target}
                onChange={(e) => setSoloSettings({ ...soloSettings, target: Number(e.target.value) })}
              />
            </label>
            <label>
              CPU
              <select
                value={soloSettings.cpu_level}
                onChange={(e) => setSoloSettings({ ...soloSettings, cpu_level: e.target.value as SoloSettings["cpu_level"] })}
              >
                <option value="weak">弱</option>
                <option value="medium">中</option>
                <option value="strong">強</option>
              </select>
            </label>
            <RulesForm
              rules={soloSettings}
              onChange={(r) => setSoloSettings({ ...soloSettings, ...r })}
            />
          </div>
          <div className="controls">
            <button type="button" className="btn btn-primary" onClick={() => startSolo(soloSettings)}>
              開始
            </button>
            <button type="button" className="btn btn-back" onClick={goTitle}>戻る</button>
          </div>
        </div>
      )}

      {screen === "onlineSelect" && (
        <div className="container">
          <h2>オンライン対戦</h2>
          <p className="hint">200固定・3問・数字5個使用・まとめて提出</p>
          <div className="menu-list">
            {(["quick", "normal", "slow"] as const).map((mode) => (
              <button key={mode} type="button" className="menu-btn online" onClick={() => startOnline(mode)}>
                {ONLINE_LABELS[mode]}（{mode === "quick" ? 10 : mode === "normal" ? 30 : 60}秒）
              </button>
            ))}
          </div>
          <div className="controls">
            <button type="button" className="btn btn-back" onClick={goTitle}>戻る</button>
          </div>
        </div>
      )}

      {screen === "match" && (
        <div className="container">
          <h2>オンライン <span className="badge">{ONLINE_LABELS[matchMode]}</span></h2>
          <p className="message">{matchMessage}</p>
          <p>スタートまで: <strong>{matchCountdown}</strong> 秒</p>
          <div className="controls">
            <button type="button" className="btn btn-back" onClick={goTitle}>戻る</button>
          </div>
        </div>
      )}

      {screen === "friendPassword" && (
        <div className="container">
          <h2>フレンド対戦</h2>
          <p className="hint">4桁のパスワードを相手と揃えてください</p>
          <input
            className="pwd-input"
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={friendPassword}
            onChange={(e) => setFriendPassword(e.target.value)}
          />
          <div className="controls">
            <button type="button" className="btn btn-primary" onClick={joinFriend}>参加</button>
            <button type="button" className="btn btn-back" onClick={goTitle}>戻る</button>
          </div>
          <p className="message">{message}</p>
        </div>
      )}

      {screen === "friendHostRules" && (
        <div className="container">
          <h2>ルール設定（ホスト）</h2>
          <div className="form-grid">
            <label>
              問題数
              <input
                type="number" min={1} max={5}
                value={friendRules.problems}
                onChange={(e) => setFriendRules({ ...friendRules, problems: Number(e.target.value) })}
              />
            </label>
            <label>
              制限時間（秒）
              <input
                type="number" min={5} max={300}
                value={friendRules.duration}
                onChange={(e) => setFriendRules({ ...friendRules, duration: Number(e.target.value) })}
              />
            </label>
            <label>
              目標値
              <input
                type="number" min={10} max={2000}
                value={friendRules.target}
                onChange={(e) => setFriendRules({ ...friendRules, target: Number(e.target.value) })}
              />
            </label>
            <RulesForm
              rules={friendRules}
              onChange={(r) => setFriendRules({ ...friendRules, ...r })}
            />
          </div>
          <div className="controls">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => socketRef.current?.emit("set_exhibition_rules", friendRules)}
            >
              ルールを送る
            </button>
          </div>
          <p className="message">{message}</p>
        </div>
      )}

      {screen === "friendReview" && reviewRules && (
        <div className="container">
          <h2>ルール確認</h2>
          <div className="rules-box">{rulesSummary(reviewRules, reviewRules)}</div>
          <div className="controls">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => socketRef.current?.emit("approve_exhibition_rules")}
            >
              承認する
            </button>
          </div>
          <p className="message">{message}</p>
        </div>
      )}

      {screen === "ready" && readyRules && (
        <div className="container">
          <h2>プレイ開始！</h2>
          <div className="rules-box">{rulesSummary(readyRules, readyRules)}</div>
          <p className="message">{readyStatus}</p>
          <div className="controls">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => socketRef.current?.emit("ready_start")}
            >
              開始
            </button>
          </div>
        </div>
      )}

      {screen === "game" && (
        <div className="container container-wide">
          <h2>
            {gameTitle} <span className="badge">{target}</span>
          </h2>
          <p className={`timer-line${timeLeft <= 10 ? " urgent" : ""}`}>
            残り時間: {timeLeft} 秒
          </p>
          {gameHint && <p className="hint">{gameHint}</p>}

          <ProblemBoard
            rounds={rounds}
            problemStates={problemStates}
            activeProblem={activeProblem}
            target={target}
            rules={rules}
            submitted={submitted}
            onActiveChange={setActiveProblem}
            onPickNumber={(qi, ni) =>
              setProblemStates((prev) => pickNumber(prev, qi, ni, rounds, rules))
            }
          />

          <h3 className="section-label">演算子（選択中の問題に追加）</h3>
          <div className="btn-row">
            {opButtons.map((op) => (
              <button
                key={op}
                type="button"
                className="op-btn"
                disabled={submitted}
                onClick={() => setProblemStates((prev) => appendOperator(prev, activeProblem, op))}
              >
                {op}
              </button>
            ))}
          </div>
          <div className="controls">
            <button
              type="button"
              className="btn btn-sub"
              disabled={submitted}
              onClick={() => setProblemStates((prev) => undoExpression(prev, activeProblem))}
            >
              1文字戻す
            </button>
            <button
              type="button"
              className="btn btn-sub"
              disabled={submitted}
              onClick={() => setProblemStates((prev) => clearExpression(prev, activeProblem))}
            >
              式クリア
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitted}
              onClick={() => (playMode === "solo" ? handleSubmitSolo() : submitMulti())}
            >
              まとめて提出
            </button>
          </div>
          <div className="controls sub-controls">
            <button
              type="button"
              className="btn btn-back"
              onClick={() => {
                if (playMode === "friend") socketRef.current?.emit("leave_exhibition");
                goTitle();
              }}
            >
              やめる
            </button>
          </div>
          <p className="message">{message}</p>
        </div>
      )}

      {screen === "result" && (
        <div className="container container-wide">
          <h2>結果</h2>
          <div className="result-box">{resultText}</div>
          {resultWinner && (
            <div className={`result-winner ${resultWinner}`}>{winnerLabel}</div>
          )}
          <div className="controls">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (playMode === "solo" && lastSoloSettings.current) {
                  setSoloSettings(lastSoloSettings.current);
                  startSolo(lastSoloSettings.current);
                } else if (playMode === "online") {
                  startOnline(matchMode);
                } else {
                  setScreen("friendPassword");
                }
              }}
            >
              もう一度
            </button>
            <button type="button" className="btn btn-back" onClick={goTitle}>
              タイトルに戻る
            </button>
          </div>
        </div>
      )}
    </>
  );
}
