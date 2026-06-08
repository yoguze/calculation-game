import type { PreviewResult } from "../../types";
import { evalExpression } from "./evaluator";
import { normalizeRules } from "./rules";
import { validateExpressionRules } from "./validator";

const SYNTAX_ERRORS = ["式の形が不正です", "使えない文字があります", "ゼロで割っています"];

/** 入力中の式をリアルタイムプレビューする */
export function previewExpression(
  expression: string,
  numbers: number[],
  usedIndices: number[],
  target: number,
  rules?: Parameters<typeof normalizeRules>[0]
): PreviewResult {
  const config = normalizeRules(rules);
  const errors = validateExpressionRules(expression, numbers, usedIndices, config);

  let value: number | null = null;
  let diff: number | null = null;
  const text = (expression ?? "").trim();

  if (text && !errors.some((message) => SYNTAX_ERRORS.includes(message))) {
    try {
      value = evalExpression(text, config);
      diff = Math.abs(target - value);
    } catch {
      /* 途中入力のため黙ってスキップ */
    }
  }

  const validIndices = (usedIndices ?? []).filter(
    (index) => Number.isInteger(index) && index >= 0 && index < numbers.length
  );
  const unusedNumbers = numbers
    .map((number, index) => (validIndices.includes(index) ? null : String(number)))
    .filter((label): label is string => label !== null);

  return {
    value,
    diff,
    errors,
    valid: errors.length === 0 && value !== null,
    unused_numbers: unusedNumbers,
    numbers_needed: config.numbers_to_use,
    numbers_selected: validIndices.length,
  };
}
