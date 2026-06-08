import { normalizeRules } from "./rules";

/** 指定範囲のランダム整数配列を生成する */
export function generateNumbers(count: number, lo: number, hi: number): number[] {
  return Array.from({ length: count }, () => lo + Math.floor(Math.random() * (hi - lo + 1)));
}

/** 複数問分の数字プールを生成する */
export function generateRounds(problemCount: number, rules?: Parameters<typeof normalizeRules>[0]) {
  const config = normalizeRules(rules);
  return Array.from({ length: problemCount }, () =>
    generateNumbers(config.pool_size, config.num_lo, config.num_hi)
  );
}
