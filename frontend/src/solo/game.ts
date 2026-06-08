import type { ProblemState, SoloResult, SoloSettings } from "../types";
import {
  cpuGradeRounds,
  generateRounds,
  gradeExpressions,
  normalizeRules,
} from "./engine";

export type SoloSession = {
  startedAt: number;
  duration: number;
  target: number;
  rounds: number[][];
  rules: ReturnType<typeof normalizeRules>;
  cpuLevel: SoloSettings["cpu_level"];
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
    cpuLevel: settings.cpu_level,
    problems: settings.problems,
  };
}

export function getSoloTimeLeft(session: SoloSession): number {
  const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
  return Math.max(0, session.duration - elapsed);
}

export function finishSolo(
  session: SoloSession,
  problemStates: ProblemState[],
  timedOut = false
): SoloResult {
  const expressions = problemStates.map((s) => s.expression);
  const usedIndices = problemStates.map((s) => s.usedIdx);
  const { total: playerTotal, results: playerResults } = gradeExpressions(
    expressions,
    usedIndices,
    session.rounds,
    session.target,
    session.rules
  );
  const { total: cpuTotal, results: cpuResults } = cpuGradeRounds(
    session.rounds,
    session.target,
    session.cpuLevel,
    session.rules
  );

  let winner: SoloResult["winner"];
  if (playerTotal < cpuTotal) winner = "player";
  else if (playerTotal > cpuTotal) winner = "cpu";
  else winner = "draw";

  return {
    target: session.target,
    winner,
    player_total_diff: playerTotal,
    cpu_total_diff: cpuTotal,
    player_results: playerResults,
    cpu_results: cpuResults.map((r) => ({
      expr: r.expr,
      value: r.value,
      diff: r.diff,
      valid: true,
    })),
    timed_out: timedOut,
    rules: session.rules,
  };
}
