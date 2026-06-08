import type { GameRules, ProblemState } from "../types";

/** 問題数に応じた空の入力状態を初期化する */
export function createEmptyProblemStates(count: number): ProblemState[] {
  return Array.from({ length: count }, () => ({
    expression: "",
    usedIdx: [],
  }));
}

/** ルールに応じて利用可能な演算子ボタンを返す */
export function availableOperators(rules: GameRules): string[] {
  const ops = ["(", ")", "+", "-"];
  if (rules.allow_mul) ops.push("*");
  if (rules.allow_div) ops.push("/");
  return ops;
}
