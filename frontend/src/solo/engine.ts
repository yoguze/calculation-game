import type { GameRules, GradeResult, PreviewResult } from "../types";
import { DEFAULT_RULES } from "../types";

const CPU_LEVELS = {
  weak: { beam_width: 40, random_tries: 60 },
  medium: { beam_width: 120, random_tries: 300 },
  strong: { beam_width: 260, random_tries: 700 },
} as const;

export function normalizeRules(rules?: Partial<GameRules>): GameRules {
  const base: GameRules = { ...DEFAULT_RULES, ...rules };
  base.num_lo = Math.max(1, Math.floor(base.num_lo));
  base.num_hi = Math.max(base.num_lo, Math.min(99, Math.floor(base.num_hi)));
  base.pool_size = Math.max(6, Math.min(20, Math.floor(base.pool_size)));
  base.numbers_to_use = Math.max(2, Math.min(base.pool_size, Math.floor(base.numbers_to_use)));
  return base;
}

export function generateNumbers(count: number, lo: number, hi: number): number[] {
  return Array.from({ length: count }, () => lo + Math.floor(Math.random() * (hi - lo + 1)));
}

export function generateRounds(problemCount: number, rules?: Partial<GameRules>): number[][] {
  const cfg = normalizeRules(rules);
  return Array.from({ length: problemCount }, () =>
    generateNumbers(cfg.pool_size, cfg.num_lo, cfg.num_hi)
  );
}

function intDiv(a: number, b: number): number {
  if (b === 0) throw new Error("ゼロで割っています");
  return Math.trunc(a / b);
}

type Tok =
  | { k: "num"; v: number }
  | { k: "op"; v: string }
  | { k: "lp" }
  | { k: "rp" };

function tokenize(expr: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ k: "lp" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ k: "rp" });
      i++;
      continue;
    }
    if ("+-*/".includes(c)) {
      tokens.push({ k: "op", v: c });
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9]/.test(expr[j])) j++;
      tokens.push({ k: "num", v: parseInt(expr.slice(i, j), 10) });
      i = j;
      continue;
    }
    throw new Error("使えない文字があります");
  }
  return tokens;
}

function parseTokens(tokens: Tok[]): number {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function consume() {
    return tokens[pos++];
  }

  function parseExpr(): number {
    return parseAddSub();
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek()?.k === "op" && (peek() as { k: "op"; v: string }).v.match(/[+-]/)) {
      const op = (consume() as { k: "op"; v: string }).v;
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parseUnary();
    while (peek()?.k === "op" && (peek() as { k: "op"; v: string }).v.match(/[*/]/)) {
      const op = (consume() as { k: "op"; v: string }).v;
      const right = parseUnary();
      left = op === "*" ? left * right : intDiv(left, right);
    }
    return left;
  }

  function parseUnary(): number {
    if (peek()?.k === "op" && (peek() as { k: "op"; v: string }).v === "-") {
      consume();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error("式が不正です");
    if (t.k === "num") {
      consume();
      return t.v;
    }
    if (t.k === "lp") {
      consume();
      const v = parseExpr();
      if (peek()?.k !== "rp") throw new Error("式が不正です");
      consume();
      return v;
    }
    throw new Error("式が不正です");
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error("式が不正です");
  return result;
}

export function evalExpression(expr: string, rules?: Partial<GameRules>): number {
  const text = expr.trim();
  if (!text) throw new Error("式が空です");
  const allowed = /^[0-9+\-*/().\s]+$/;
  if (!allowed.test(text)) throw new Error("使えない文字があります");
  const cfg = normalizeRules(rules);
  if (!cfg.allow_mul && text.includes("*")) throw new Error("掛け算は使えません");
  if (!cfg.allow_div && text.includes("/")) throw new Error("割り算は使えません");
  return parseTokens(tokenize(text));
}

export function extractNumbersFromExpr(expr: string): number[] {
  const text = expr.trim();
  if (!text) return [];
  const tokens = tokenize(text);
  const nums: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.k === "op" && t.v === "-" && tokens[i + 1]?.k === "num") {
      nums.push(-(tokens[i + 1] as { k: "num"; v: number }).v);
      i++;
    } else if (t.k === "num") {
      nums.push(t.v);
    }
  }
  return nums;
}

function counterEqual(a: number[], b: number[]): boolean {
  const ca = new Map<number, number>();
  const cb = new Map<number, number>();
  for (const n of a) ca.set(n, (ca.get(n) ?? 0) + 1);
  for (const n of b) cb.set(n, (cb.get(n) ?? 0) + 1);
  if (ca.size !== cb.size) return false;
  for (const [k, v] of ca) if (cb.get(k) !== v) return false;
  return true;
}

export function validateUsedIndices(
  usedIndices: number[],
  numbers: number[],
  rules?: Partial<GameRules>
): string[] {
  const cfg = normalizeRules(rules);
  const need = cfg.numbers_to_use;
  const errors: string[] = [];
  const indices = usedIndices ?? [];

  if (indices.length !== need) {
    errors.push(`数字は${need}個選ぶ必要があります（現在${indices.length}個）`);
  }
  if (new Set(indices).size !== indices.length) {
    errors.push("同じ数字ボタンは2回使えません");
  }
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= numbers.length) {
      errors.push("無効な数字の選択です");
      break;
    }
  }
  return errors;
}

export function validateExpressionRules(
  expr: string,
  numbers: number[],
  usedIndices: number[],
  rules?: Partial<GameRules>
): string[] {
  const cfg = normalizeRules(rules);
  const errors = [...validateUsedIndices(usedIndices, numbers, cfg)];
  const text = (expr ?? "").trim();

  if (!text) {
    if (errors.length === 0) errors.push("式を入力してください");
    return errors;
  }

  try {
    const exprNums = extractNumbersFromExpr(text);
    const validIndices = (usedIndices ?? []).filter(
      (i) => Number.isInteger(i) && i >= 0 && i < numbers.length
    );
    const expected = validIndices.map((i) => numbers[i]);
    if (!counterEqual(exprNums, expected)) {
      errors.push("式の数字が選んだ数字と一致しません");
    }
    evalExpression(text, cfg);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "式の形が不正です");
  }
  return errors;
}

export function previewExpression(
  expr: string,
  numbers: number[],
  usedIndices: number[],
  target: number,
  rules?: Partial<GameRules>
): PreviewResult {
  const cfg = normalizeRules(rules);
  const errors = validateExpressionRules(expr, numbers, usedIndices, cfg);
  let value: number | null = null;
  let diff: number | null = null;

  const text = (expr ?? "").trim();
  const blocking = ["式の形が不正です", "使えない文字があります", "ゼロで割っています"];
  if (text && !errors.some((e) => blocking.includes(e))) {
    try {
      value = evalExpression(text, cfg);
      diff = Math.abs(target - value);
    } catch {
      /* ignore */
    }
  }

  const validIndices = (usedIndices ?? []).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < numbers.length
  );
  const need = cfg.numbers_to_use;
  const remaining = need - validIndices.length;
  if (remaining > 0) errors.push(`数字をあと${remaining}個選んでください`);

  const unused = numbers
    .map((n, i) => (validIndices.includes(i) ? null : String(n)))
    .filter((x): x is string => x !== null);

  return {
    value,
    diff,
    errors,
    valid: errors.length === 0 && value !== null,
    unused_numbers: unused,
    numbers_needed: need,
    numbers_selected: validIndices.length,
  };
}

function diffFromTarget(value: number, target: number): number {
  return Math.abs(target - value);
}

type CpuResult = {
  expr: string;
  value: number;
  diff: number;
  used_indices: number[];
};

function cpuOpSymbols(rules: GameRules): string[] {
  const s = ["+", "-"];
  if (rules.allow_mul) s.push("*");
  if (rules.allow_div) s.push("/");
  return s;
}

export function beamSearchCpu(
  numbers: number[],
  target: number,
  cpuLevel: keyof typeof CPU_LEVELS,
  rules?: Partial<GameRules>
): CpuResult {
  const cfg = normalizeRules(rules);
  const level = CPU_LEVELS[cpuLevel] ?? CPU_LEVELS.medium;
  const need = cfg.numbers_to_use;
  const symbols = cpuOpSymbols(cfg);

  let best: CpuResult = {
    expr: "",
    value: 0,
    diff: Infinity,
    used_indices: [],
  };

  const consider = (value: number, expr: string, used: Set<number>) => {
    const d = diffFromTarget(value, target);
    if (d < best.diff) {
      best = { expr, value, diff: d, used_indices: [...used].sort((a, b) => a - b) };
    }
  };

  if (need < 1 || need > numbers.length) {
    return { expr: "0", value: 0, diff: diffFromTarget(0, target), used_indices: [] };
  }

  type Beam = { val: number; expr: string; used: Set<number> };
  let beam: Beam[] = numbers.map((n, i) => ({ val: n, expr: String(n), used: new Set([i]) }));

  for (let step = 0; step < need - 1; step++) {
    const nxt: Beam[] = [];
    for (const { val, expr, used } of beam) {
      for (let j = 0; j < numbers.length; j++) {
        if (used.has(j)) continue;
        const num = numbers[j];
        for (const sym of symbols) {
          try {
            let v: number;
            let nextExpr: string;
            if (sym === "+") {
              v = val + num;
              nextExpr = `(${expr})+${num}`;
            } else if (sym === "-") {
              v = val - num;
              nextExpr = `(${expr})-${num}`;
            } else if (sym === "*") {
              v = val * num;
              nextExpr = `(${expr})*${num}`;
            } else {
              v = intDiv(val, num);
              nextExpr = `(${expr})/${num}`;
            }
            const nu = new Set(used);
            nu.add(j);
            nxt.push({ val: v, expr: nextExpr, used: nu });
          } catch {
            /* skip */
          }
        }
      }
    }
    if (!nxt.length) break;
    nxt.sort((a, b) => diffFromTarget(a.val, target) - diffFromTarget(b.val, target));
    beam = nxt.slice(0, level.beam_width);
    for (const { val, expr, used } of beam) {
      if (used.size === need) consider(val, expr, used);
    }
  }

  if (need >= 2) {
    for (let t = 0; t < level.random_tries; t++) {
      const idxs = shuffleIndexes(numbers.length).slice(0, need);
      const nums = idxs.map((i) => numbers[i]);
      const ops = Array.from({ length: need - 1 }, () =>
        symbols[Math.floor(Math.random() * symbols.length)]
      );
      let expr = String(nums[0]);
      let val = nums[0];
      let ok = true;
      for (let i = 0; i < need - 1; i++) {
        const sym = ops[i];
        const n = nums[i + 1];
        expr += sym + n;
        try {
          if (sym === "+") val += n;
          else if (sym === "-") val -= n;
          else if (sym === "*") val *= n;
          else val = intDiv(val, n);
        } catch {
          ok = false;
          break;
        }
      }
      if (ok) consider(val, expr, new Set(idxs));
    }
  }

  if (best.diff === Infinity) {
    best = { expr: "0", value: 0, diff: diffFromTarget(0, target), used_indices: [] };
  }
  return best;
}

function shuffleIndexes(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function gradeExpressions(
  expressions: string[],
  usedIndicesList: number[][],
  rounds: number[][],
  target: number,
  rules?: Partial<GameRules>
): { total: number; results: GradeResult[] } {
  const cfg = normalizeRules(rules);
  const results: GradeResult[] = [];
  let total = 0;

  for (let i = 0; i < rounds.length; i++) {
    const expr = (expressions[i] ?? "").trim();
    const used = usedIndicesList[i] ?? [];
    const errors = expr ? validateExpressionRules(expr, rounds[i], used, cfg) : ["未提出"];

    if (!expr || errors.length) {
      const diff = diffFromTarget(0, target);
      results.push({ expr, value: null, diff, valid: false, errors: expr ? errors : ["未提出"] });
      total += diff;
      continue;
    }
    const value = evalExpression(expr, cfg);
    const diff = diffFromTarget(value, target);
    results.push({ expr, value, diff, valid: true, errors: [] });
    total += diff;
  }
  return { total, results };
}

export function cpuGradeRounds(
  rounds: number[][],
  target: number,
  cpuLevel: keyof typeof CPU_LEVELS,
  rules?: Partial<GameRules>
): { total: number; results: CpuResult[] } {
  const results = rounds.map((nums) => beamSearchCpu(nums, target, cpuLevel, rules));
  const total = results.reduce((s, r) => s + r.diff, 0);
  return { total, results };
}
