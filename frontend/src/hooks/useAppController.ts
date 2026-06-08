import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { OnlineModeId } from "../constants/labels";
import { createMultiplayerSocket } from "../config";
import type {
  CountdownPayload,
  ExhibitionJoinedPayload,
  GameStartPayload,
  MatchedPayload,
  MessagePayload,
  ReadyPhasePayload,
  ReadyStatusPayload,
  RulesProposedPayload,
  TimeUpdatePayload,
  VersusResult,
} from "../multiplayer/events";
import {
  createSoloSession,
  finishSolo,
  getElapsedSec,
  getSoloTimeLeft,
  type SoloSession,
} from "../solo/game";
import type {
  FriendRules,
  GameRules,
  PlayMode,
  ProblemState,
  Screen,
  SoloResult,
  SoloSettings,
} from "../types";
import { DEFAULT_RULES } from "../types";
import { formatResults } from "../utils/formatResults";
import { createEmptyProblemStates } from "../utils/problemState";

type ResultOutcome = "win" | "lose" | "draw" | null;

/**
 * アプリ全体の状態遷移とゲームロジックを集約する。
 * 画面コンポーネントは表示のみ担当し、ロジックはここに集約する。
 */
export function useAppController() {
  const [screen, setScreen] = useState<Screen>("title");
  const [playMode, setPlayMode] = useState<PlayMode>("solo");
  const [message, setMessage] = useState("");

  const [soloSettings, setSoloSettings] = useState<SoloSettings>({
    problems: 3,
    duration: 30,
    target: 200,
    ...DEFAULT_RULES,
  });

  const [friendPassword, setFriendPassword] = useState("");
  const [friendRules, setFriendRules] = useState<FriendRules>({
    problems: 3,
    duration: 30,
    target: 200,
    ...DEFAULT_RULES,
  });
  const [reviewRules, setReviewRules] = useState<FriendRules | null>(null);
  const [readyRules, setReadyRules] = useState<FriendRules | null>(null);

  const [rounds, setRounds] = useState<number[][]>([]);
  const [target, setTarget] = useState(200);
  const [rules, setRules] = useState<GameRules>(DEFAULT_RULES);
  const [problemStates, setProblemStates] = useState<ProblemState[]>([]);
  const [activeProblem, setActiveProblem] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [submitted, setSubmitted] = useState(false);
  const [gameTitle, setGameTitle] = useState("ゲーム");
  const [gameHint, setGameHint] = useState("");

  const [resultText, setResultText] = useState("");
  const [resultOutcome, setResultOutcome] = useState<ResultOutcome>(null);

  const [matchMode, setMatchMode] = useState<OnlineModeId>("normal");
  const [matchMessage, setMatchMessage] = useState("");
  const [matchCountdown, setMatchCountdown] = useState(12);
  const [readyStatus, setReadyStatus] = useState("開始ボタンを押してください");

  const lastSoloSettings = useRef<SoloSettings | null>(null);
  const soloSessionRef = useRef<SoloSession | null>(null);
  const soloFinishedRef = useRef(false);
  const problemStatesRef = useRef(problemStates);
  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(submitted);
  const screenRef = useRef(screen);

  useEffect(() => {
    problemStatesRef.current = problemStates;
  }, [problemStates]);

  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

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

  const showSoloResult = useCallback((data: SoloResult, timedOut = false) => {
    let text = `目標 ${data.target}\n\n`;
    if (data.player_submitted_at_sec !== undefined) {
      text += `提出: ${data.player_submitted_at_sec}秒\n\n`;
    }
    text += formatResults("あなた", data.player_results, data.player_total_diff);
    text += `\n\n合計差 ${data.player_total_diff}（小さいほど目標に近い）`;
    if (timedOut) text += "\n時間切れ（入力中の式を採点）";

    setResultText(text);
    setResultOutcome(null);
    setScreen("result");
  }, []);

  const showVersusResult = useCallback((data: VersusResult) => {
    const role = data.role || "A";
    let text = `目標 ${data.target}\n\n`;
    text += formatResults("あなた", data.my_results, data.my_total_diff);
    text += "\n" + formatResults("相手", data.op_results, data.op_total_diff);

    setResultText(text);
    setResultOutcome(
      data.winner === role ? "win" : data.winner === "引き分け" ? "draw" : "lose"
    );
    setScreen("result");
  }, []);

  const beginGame = useCallback(
    (
      title: string,
      hint: string,
      newRounds: number[][],
      newTarget: number,
      newDuration: number,
      newRules: GameRules,
      mode: PlayMode
    ) => {
      setPlayMode(mode);
      setGameTitle(title);
      setGameHint(hint);
      setRounds(newRounds);
      setTarget(newTarget);
      setRules(newRules);
      setTimeLeft(newDuration);
      setProblemStates(createEmptyProblemStates(newRounds.length));
      setActiveProblem(0);
      setSubmitted(false);
      setMessage("");
      setScreen("game");
    },
    []
  );

  const startSolo = useCallback(
    (settings: SoloSettings) => {
      stopPoll();
      stopSocket();
      soloFinishedRef.current = false;
      lastSoloSettings.current = settings;

      const session = createSoloSession(settings);
      soloSessionRef.current = session;

      beginGame(
        "1人プレイ",
        `${session.problems}問・${session.duration}秒`,
        session.rounds,
        session.target,
        session.duration,
        session.rules,
        "solo"
      );

      pollRef.current = setInterval(() => {
        const activeSession = soloSessionRef.current;
        if (!activeSession || soloFinishedRef.current) return;

        const remaining = getSoloTimeLeft(activeSession);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          soloFinishedRef.current = true;
          setSubmitted(true);
          stopPoll();
          showSoloResult(finishSolo(activeSession, problemStatesRef.current, true), true);
        }
      }, 250);
    },
    [beginGame, showSoloResult, stopPoll, stopSocket]
  );

  const submitSolo = useCallback(() => {
    const session = soloSessionRef.current;
    if (!session || submitted) return;

    const playerSubmittedAtSec = getElapsedSec(session);
    soloFinishedRef.current = true;
    setSubmitted(true);
    stopPoll();
    showSoloResult(finishSolo(session, problemStatesRef.current, false, playerSubmittedAtSec));
  }, [showSoloResult, stopPoll, submitted]);

  const bindSharedMultiplayerEvents = useCallback(
    (socket: Socket) => {
      socket.on("game_start", (payload: GameStartPayload) => beginGame(
        payload.mode_label ? `オンライン ${payload.mode_label}` : "フレンド対戦",
        payload.mode_label
          ? "200固定・3問・数字最大5個・まとめて提出"
          : `${payload.problems}問・${payload.duration}秒`,
        payload.rounds,
        payload.target,
        payload.duration,
        payload.rules,
        payload.mode_label ? "online" : "friend"
      ));
      socket.on("update", (payload: TimeUpdatePayload) => {
        if (payload.time_left !== undefined) setTimeLeft(payload.time_left);
      });
      socket.on("submit_ok", () => {
        setSubmitted(true);
        setMessage("提出しました。相手を待っています…");
      });
      socket.on("submit_error", (payload: MessagePayload) => setMessage(payload.message));
      socket.on("opponent_submitted", (payload: MessagePayload) => setMessage(payload.message));
      socket.on("game_over", (payload: VersusResult) => {
        setSubmitted(true);
        stopSocket();
        showVersusResult(payload);
      });
    },
    [beginGame, showVersusResult, stopSocket]
  );

  const bindFriendEvents = useCallback((socket: Socket) => {
    socket.on("exhibition_joined", (payload: ExhibitionJoinedPayload) => {
      if (payload.is_host && payload.message?.includes("相手")) {
        setScreen("friendHostRules");
      } else if (payload.is_host) {
        setMessage(payload.message ?? "相手の参加を待っています…");
        setScreen("friendPassword");
      } else {
        setMessage("参加しました。ホストのルール設定を待っています…");
        setScreen("friendPassword");
      }
    });
    socket.on("host_set_rules", () => setScreen("friendHostRules"));
    socket.on("guest_waiting_rules", (payload: MessagePayload) => {
      setMessage(payload.message);
      setScreen("friendPassword");
    });
    socket.on("rules_proposed", (payload: RulesProposedPayload) => {
      setReviewRules(payload.rules);
      setScreen("friendReview");
    });
    socket.on("rules_sent", (payload: MessagePayload) => setMessage(payload.message));
    socket.on("ready_phase", (payload: ReadyPhasePayload) => {
      setReadyRules(payload.rules);
      setReadyStatus(payload.message);
      setScreen("ready");
    });
    socket.on("ready_status", (payload: ReadyStatusPayload) => {
      setReadyStatus(`準備 ${payload.ready_count}/${payload.need}`);
    });
    socket.on("waiting_opponent", (payload: MessagePayload) => setReadyStatus(payload.message));
    socket.on("opponent_waiting", (payload: MessagePayload) => setReadyStatus(payload.message));
    socket.on("all_ready", (payload: MessagePayload) => setReadyStatus(payload.message));
    socket.on("start_countdown", (payload: CountdownPayload) => {
      setReadyStatus(`スタートまで ${payload.count}…`);
    });
    socket.on("opponent_left", (payload: MessagePayload) => {
      setMessage(payload.message);
      setReadyStatus(payload.message);
      setSubmitted(true);
    });
    socket.on("error_msg", (payload: MessagePayload) => setMessage(payload.message));
  }, []);

  const startOnline = useCallback(
    (mode: OnlineModeId) => {
      stopPoll();
      stopSocket();
      setMatchMode(mode);
      setMatchMessage("対戦相手を探しています…");
      setMatchCountdown(12);
      setScreen("match");

      const socket = createMultiplayerSocket();
      socketRef.current = socket;
      bindSharedMultiplayerEvents(socket);

      socket.on("connect", () => socket.emit("join_online", { mode }));
      socket.on("waiting", (payload: MessagePayload) => setMatchMessage(payload.message));
      socket.on("matched", (payload: MatchedPayload) => {
        setMatchMessage(`あなたは ${payload.role} です`);
      });
      socket.on("countdown", (payload: CountdownPayload) => setMatchCountdown(payload.count));
      socket.on("opponent_left", (payload: MessagePayload) => {
        setMessage(payload.message);
        setSubmitted(true);
      });
      socket.on("error_msg", (payload: MessagePayload) => setMatchMessage(payload.message));
    },
    [bindSharedMultiplayerEvents, stopPoll, stopSocket]
  );

  const joinFriend = useCallback(() => {
    if (!/^\d{4}$/.test(friendPassword.trim())) {
      setMessage("4桁の数字を入力してください");
      return;
    }

    stopPoll();
    stopSocket();

    const socket = createMultiplayerSocket();
    socketRef.current = socket;
    bindSharedMultiplayerEvents(socket);
    bindFriendEvents(socket);
    socket.on("connect", () => {
      socket.emit("join_exhibition", { password: friendPassword.trim() });
    });
  }, [bindFriendEvents, bindSharedMultiplayerEvents, friendPassword, stopPoll, stopSocket]);

  const submitMultiplayer = useCallback(
    (timedOut = false) => {
      if (submittedRef.current || !socketRef.current) return;
      if (timedOut) {
        setMessage("時間切れ — 入力中の式を提出しました");
      }
      submittedRef.current = true;
      setSubmitted(true);
      socketRef.current.emit("submit_multi", {
        expressions: problemStatesRef.current.map((state) => state.expression),
        used_indices: problemStatesRef.current.map((state) => state.usedIdx),
      });
    },
    []
  );

  useEffect(() => {
    if (timeLeft > 0 || screenRef.current !== "game" || submittedRef.current) return;
    if (playMode === "online" || playMode === "friend") {
      submitMultiplayer(true);
    }
  }, [timeLeft, playMode, submitMultiplayer]);

  const retry = useCallback(() => {
    if (playMode === "solo" && lastSoloSettings.current) {
      setSoloSettings(lastSoloSettings.current);
      startSolo(lastSoloSettings.current);
      return;
    }
    if (playMode === "online") {
      startOnline(matchMode);
      return;
    }
    setScreen("friendPassword");
  }, [matchMode, playMode, startOnline, startSolo]);

  useEffect(() => () => {
    stopPoll();
    stopSocket();
  }, [stopPoll, stopSocket]);

  return {
    screen,
    playMode,
    message,
    soloSettings,
    setSoloSettings,
    friendPassword,
    setFriendPassword,
    friendRules,
    setFriendRules,
    reviewRules,
    readyRules,
    readyStatus,
    matchMode,
    matchMessage,
    matchCountdown,
    rounds,
    target,
    rules,
    problemStates,
    setProblemStates,
    activeProblem,
    setActiveProblem,
    timeLeft,
    submitted,
    gameTitle,
    gameHint,
    resultText,
    resultOutcome,
    socketRef,
    goTitle,
    setScreen,
    startSolo,
    submitSolo,
    startOnline,
    joinFriend,
    submitMultiplayer,
    retry,
  };
}

export type AppController = ReturnType<typeof useAppController>;
