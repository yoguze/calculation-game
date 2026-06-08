import type { GameRules } from "../../types";
import { evalExpression } from "./evaluator";
import { diffFromTarget, normalizeRules } from "./rules";

export const CPU_LEVELS = {
  weak: { beam_width: 40, random_tries: 60 },
  medium: { beam_width: 120, random_tries: 300 },
  strong: { beam_width: 260, random_tries: 700 },
} as const;

export type CpuLevel = keyof typeof CPU_LEVELS;

export type CpuSolution = {
  expr: string;
  value: number;
  diff: number;
  used_indices: number[];
};

function intDiv(a: number, b: number): number {
  if (b === 0) throw new Error("divide by zero");
  return Math.trunc(a / b);
}

function operatorSymbols(rules: GameRules): string[] {
  const symbols = ["+", "-"];
  if (rules.allow_mul) symbols.push("*");
  if (rules.allow_div) symbols.push("/");
  return symbols;
}

function shuffleIndexes(length: number): number[] {
  const indexes = Array.from({ length: length }, (_, i) => i);
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

/**
 * ビームサーチ + ランダム探索で CPU の回答を求める。
 * 探索空間が大きいため、完全最適解ではなくヒューリスティックに近い値を返す。
 */
export function solveWithBeamSearch(
  numbers: number[],
  target: number,
  cpuLevel: CpuLevel,
  rules?: Partial<GameRules>
): CpuSolution {
  const config = normalizeRules(rules);
  const level = CPU_LEVELS[cpuLevel] ?? CPU_LEVELS.medium;
  const requiredCount = config.numbers_to_use;
  const symbols = operatorSymbols(config);

  let best: CpuSolution = {
    expr: "",
    value: 0,
    diff: Infinity,
    used_indices: [],
  };

  const updateBest = (value: number, expr: string, used: Set<number>) => {
    const diff = diffFromTarget(value, target);
    if (diff < best.diff) {
      best = { expr, value, diff, used_indices: [...used].sort((a, b) => a - b) };
    }
  };

  if (requiredCount < 1 || requiredCount > numbers.length) {
    return { expr: "0", value: 0, diff: diffFromTarget(0, target), used_indices: [] };
  }

  type BeamState = { value: number; expr: string; used: Set<number> };
  let beam: BeamState[] = numbers.map((number, index) => ({
    value: number,
    expr: String(number),
    used: new Set([index]),
  }));

  for (let step = 0; step < requiredCount - 1; step++) {
    const candidates: BeamState[] = [];

    for (const state of beam) {
      for (let index = 0; index < numbers.length; index++) {
        if (state.used.has(index)) continue;
        const number = numbers[index];

        for (const symbol of symbols) {
          try {
            let nextValue: number;
            let nextExpr: string;
            if (symbol === "+") {
              nextValue = state.value + number;
              nextExpr = `(${state.expr})+${number}`;
            } else if (symbol === "-") {
              nextValue = state.value - number;
              nextExpr = `(${state.expr})-${number}`;
            } else if (symbol === "*") {
              nextValue = state.value * number;
              nextExpr = `(${state.expr})*${number}`;
            } else {
              nextValue = intDiv(state.value, number);
              nextExpr = `(${state.expr})/${number}`;
            }
            const nextUsed = new Set(state.used);
            nextUsed.add(index);
            candidates.push({ value: nextValue, expr: nextExpr, used: nextUsed });
          } catch {
            /* ゼロ除算などは候補から除外 */
          }
        }
      }
    }

    if (!candidates.length) break;
    candidates.sort((a, b) => diffFromTarget(a.value, target) - diffFromTarget(b.value, target));
    beam = candidates.slice(0, level.beam_width);

    for (const state of beam) {
      if (state.used.size === requiredCount) {
        updateBest(state.value, state.expr, state.used);
      }
    }
  }

  if (requiredCount >= 2) {
    for (let attempt = 0; attempt < level.random_tries; attempt++) {
      const indexes = shuffleIndexes(numbers.length).slice(0, requiredCount);
      const picked = indexes.map((index) => numbers[index]);
      const ops = Array.from({ length: requiredCount - 1 }, () =>
        symbols[Math.floor(Math.random() * symbols.length)]
      );

      let expr = String(picked[0]);
      let value = picked[0];
      let valid = true;

      for (let i = 0; i < requiredCount - 1; i++) {
        const symbol = ops[i];
        const number = picked[i + 1];
        expr += symbol + number;
        try {
          if (symbol === "+") value += number;
          else if (symbol === "-") value -= number;
          else if (symbol === "*") value *= number;
          else value = intDiv(value, number);
        } catch {
          valid = false;
          break;
        }
      }

      if (valid) updateBest(value, expr, new Set(indexes));
    }
  }

  if (best.diff === Infinity) {
    return { expr: "0", value: 0, diff: diffFromTarget(0, target), used_indices: [] };
  }

  // 生成した式が評価可能か最終確認（括弧付き式の整合性チェック）
  try {
    evalExpression(best.expr, config);
  } catch {
    return { expr: "0", value: 0, diff: diffFromTarget(0, target), used_indices: [] };
  }

  return best;
}
