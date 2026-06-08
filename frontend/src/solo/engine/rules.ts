import type { GameRules } from "../../types";
import { DEFAULT_RULES } from "../../types";

/** ゲームルールを安全な範囲に正規化する */
export function normalizeRules(rules?: Partial<GameRules>): GameRules {
  const normalized: GameRules = { ...DEFAULT_RULES, ...rules };
  normalized.num_lo = Math.max(1, Math.floor(normalized.num_lo));
  normalized.num_hi = Math.max(normalized.num_lo, Math.min(99, Math.floor(normalized.num_hi)));
  normalized.pool_size = Math.max(6, Math.min(20, Math.floor(normalized.pool_size)));
  normalized.numbers_to_use = Math.max(
    1,
    Math.min(normalized.pool_size, Math.floor(normalized.numbers_to_use))
  );
  return normalized;
}

/** 目標値との差（小さいほど良い） */
export function diffFromTarget(value: number, target: number): number {
  return Math.abs(target - value);
}
