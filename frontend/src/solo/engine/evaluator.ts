import type { GameRules } from "../../types";
import { normalizeRules } from "./rules";

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" };

function intDiv(a: number, b: number): number {
  if (b === 0) throw new Error("ゼロで割っています");
  return Math.trunc(a / b);
}

/** 四則演算式をトークン列に分解する */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (char === " " || char === "\t") {
      index++;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lparen" });
      index++;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" });
      index++;
      continue;
    }
    if ("+-*/".includes(char)) {
      tokens.push({ kind: "op", value: char });
      index++;
      continue;
    }
    if (/[0-9]/.test(char)) {
      let end = index;
      while (end < expression.length && /[0-9]/.test(expression[end])) end++;
      tokens.push({ kind: "num", value: parseInt(expression.slice(index, end), 10) });
      index = end;
      continue;
    }
    throw new Error("使えない文字があります");
  }

  return tokens;
}

/** トークン列を再帰下降パーサで評価する（整数除算対応） */
function evaluateTokens(tokens: Token[]): number {
  let position = 0;

  const peek = () => tokens[position];
  const consume = () => tokens[position++];

  const parseExpression = (): number => parseAddSub();
  const parseAddSub = (): number => {
    let left = parseMulDiv();
    while (peek()?.kind === "op" && /[+-]/.test((peek() as { kind: "op"; value: string }).value)) {
      const op = (consume() as { kind: "op"; value: string }).value;
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  };
  const parseMulDiv = (): number => {
    let left = parseUnary();
    while (peek()?.kind === "op" && /[*/]/.test((peek() as { kind: "op"; value: string }).value)) {
      const op = (consume() as { kind: "op"; value: string }).value;
      const right = parseUnary();
      left = op === "*" ? left * right : intDiv(left, right);
    }
    return left;
  };
  const parseUnary = (): number => {
    if (peek()?.kind === "op" && (peek() as { kind: "op"; value: string }).value === "-") {
      consume();
      return -parseUnary();
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    const token = peek();
    if (!token) throw new Error("式が不正です");
    if (token.kind === "num") {
      consume();
      return token.value;
    }
    if (token.kind === "lparen") {
      consume();
      const value = parseExpression();
      if (peek()?.kind !== "rparen") throw new Error("式が不正です");
      consume();
      return value;
    }
    throw new Error("式が不正です");
  };

  const result = parseExpression();
  if (position < tokens.length) throw new Error("式が不正です");
  return result;
}

/** ルールを満たす四則演算式を評価して整数結果を返す */
export function evalExpression(expression: string, rules?: Partial<GameRules>): number {
  const text = expression.trim();
  if (!text) throw new Error("式が空です");
  if (!/^[0-9+\-*/().\s]+$/.test(text)) throw new Error("使えない文字があります");

  const config = normalizeRules(rules);
  if (!config.allow_mul && text.includes("*")) throw new Error("掛け算は使えません");
  if (!config.allow_div && text.includes("/")) throw new Error("割り算は使えません");

  return evaluateTokens(tokenize(text));
}

/** 式に含まれる数値リテラルを抽出する（採点時の照合用） */
export function extractNumbersFromExpression(expression: string): number[] {
  const text = expression.trim();
  if (!text) return [];

  const tokens = tokenize(text);
  const numbers: number[] = [];

  for (const token of tokens) {
    if (token.kind === "num") {
      numbers.push(token.value);
    }
  }

  return numbers;
}
