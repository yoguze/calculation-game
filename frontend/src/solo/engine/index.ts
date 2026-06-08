/**
 * ソロモード用ゲームエンジン。
 * 静的ホスティングでも動作するよう、採点・CPU思考をすべてクライアントで完結させる。
 */
export { normalizeRules, diffFromTarget } from "./rules";
export { generateNumbers, generateRounds } from "./generator";
export { evalExpression, extractNumbersFromExpression } from "./evaluator";
export { validateUsedIndices, validateExpressionRules } from "./validator";
export { previewExpression } from "./preview";
export { solveWithBeamSearch, CPU_LEVELS, type CpuLevel, type CpuSolution } from "./cpuSolver";
export {
  gradePlayerExpressions,
  gradeCpuRounds,
  gradeCpuRoundsWithTiming,
  type CpuGradeResult,
  type CpuRoundTiming,
} from "./grader";
