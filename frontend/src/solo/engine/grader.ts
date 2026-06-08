import type { GradeResult } from "../../types";
import { evalExpression } from "./evaluator";
import { solveWithBeamSearch, type CpuLevel, type CpuSolution } from "./cpuSolver";
import { diffFromTarget, normalizeRules } from "./rules";
import { validateExpressionRules } from "./validator";

export type CpuRoundTiming = {
  solveMs: number;
  finishedAtSec: number;
};

export type CpuGradeResult = {
  totalDiff: number;
  results: CpuSolution[];
  roundTimings: CpuRoundTiming[];
  totalSolveMs: number;
  submittedAtSec: number;
};

/** プレイヤーの全問を採点する */
export function gradePlayerExpressions(
  expressions: string[],
  usedIndicesList: number[][],
  rounds: number[][],
  target: number,
  rules?: Parameters<typeof normalizeRules>[0]
): { totalDiff: number; results: GradeResult[] } {
  const config = normalizeRules(rules);
  const results: GradeResult[] = [];
  let totalDiff = 0;

  for (let i = 0; i < rounds.length; i++) {
    const expression = (expressions[i] ?? "").trim();
    const usedIndices = usedIndicesList[i] ?? [];
    const errors = expression
      ? validateExpressionRules(expression, rounds[i], usedIndices, config)
      : ["式なし"];

    if (!expression || errors.length) {
      const diff = diffFromTarget(0, target);
      results.push({
        expr: expression,
        value: null,
        diff,
        valid: false,
        errors: expression ? errors : ["式なし"],
      });
      totalDiff += diff;
      continue;
    }

    const value = evalExpression(expression, config);
    const diff = diffFromTarget(value, target);
    results.push({ expr: expression, value, diff, valid: true, errors: [] });
    totalDiff += diff;
  }

  return { totalDiff, results };
}

/** CPU の全問回答を生成して採点する（各問の思考時間・提出秒も記録） */
export function gradeCpuRoundsWithTiming(
  rounds: number[][],
  target: number,
  cpuLevel: CpuLevel,
  rules?: Parameters<typeof normalizeRules>[0],
  startedAtMs?: number
): CpuGradeResult {
  const startedAt = startedAtMs ?? Date.now();
  const results: CpuSolution[] = [];
  const roundTimings: CpuRoundTiming[] = [];
  let totalSolveMs = 0;

  for (const numbers of rounds) {
    const solveStart = performance.now();
    const result = solveWithBeamSearch(numbers, target, cpuLevel, rules);
    const solveMs = performance.now() - solveStart;
    totalSolveMs += solveMs;
    results.push(result);
    roundTimings.push({
      solveMs,
      finishedAtSec: Math.floor((Date.now() - startedAt) / 1000),
    });
  }

  const totalDiff = results.reduce((sum, result) => sum + result.diff, 0);
  const submittedAtSec = Math.floor((Date.now() - startedAt) / 1000);

  return { totalDiff, results, roundTimings, totalSolveMs, submittedAtSec };
}

/** CPU の全問回答を生成して採点する */
export function gradeCpuRounds(
  rounds: number[][],
  target: number,
  cpuLevel: CpuLevel,
  rules?: Parameters<typeof normalizeRules>[0]
) {
  return gradeCpuRoundsWithTiming(rounds, target, cpuLevel, rules);
}
