import type { ProblemState, SoloResult, SoloSettings } from "../types";
import { generateRounds, gradePlayerExpressions, normalizeRules } from "./engine/index";

/** ブラウザ内で完結するソロゲームのセッション */
export type SoloSession = {
  startedAt: number;
  duration: number;
  target: number;
  rounds: number[][];
  rules: ReturnType<typeof normalizeRules>;
  problems: number;
};

export function createSoloSession(settings: SoloSettings): SoloSession {
  const rules = normalizeRules(settings);
  return {
    startedAt: Date.now(),
    duration: settings.duration,
    target: settings.target,
    rounds: generateRounds(settings.problems, rules),
    rules,
    problems: settings.problems,
  };
}

export function getSoloTimeLeft(session: SoloSession): number {
  const elapsedSec = getElapsedSec(session);
  return Math.max(0, session.duration - elapsedSec);
}

export function getElapsedSec(session: SoloSession, at = Date.now()): number {
  return Math.min(session.duration, Math.floor((at - session.startedAt) / 1000));
}

export function finishSolo(
  session: SoloSession,
  problemStates: ProblemState[],
  timedOut = false,
  playerSubmittedAtSec?: number
): SoloResult {
  const expressions = problemStates.map((state) => state.expression);
  const usedIndices = problemStates.map((state) => state.usedIdx);
  const playerSec = playerSubmittedAtSec ?? getElapsedSec(session);

  const { totalDiff: playerTotal, results: playerResults } = gradePlayerExpressions(
    expressions,
    usedIndices,
    session.rounds,
    session.target,
    session.rules
  );

  return {
    target: session.target,
    player_total_diff: playerTotal,
    player_results: playerResults,
    player_submitted_at_sec: playerSec,
    timed_out: timedOut,
    rules: session.rules,
  };
}
