import type { GameRules } from "../../types";
import { evalExpression, extractNumbersFromExpression } from "./evaluator";
import { normalizeRules } from "./rules";

function haveSameNumberMultiset(a: number[], b: number[]): boolean {
  const countA = new Map<number, number>();
  const countB = new Map<number, number>();
  for (const value of a) countA.set(value, (countA.get(value) ?? 0) + 1);
  for (const value of b) countB.set(value, (countB.get(value) ?? 0) + 1);
  if (countA.size !== countB.size) return false;
  for (const [key, count] of countA) {
    if (countB.get(key) !== count) return false;
  }
  return true;
}

/** 使用インデックスがルール上妥当か検証する */
export function validateUsedIndices(
  usedIndices: number[],
  numbers: number[],
  rules?: Partial<GameRules>
): string[] {
  const config = normalizeRules(rules);
  const maxCount = config.numbers_to_use;
  const errors: string[] = [];
  const indices = usedIndices ?? [];

  if (indices.length > maxCount) {
    errors.push(`数字は最大${maxCount}個まで使えます（現在${indices.length}個）`);
  }
  if (new Set(indices).size !== indices.length) {
    errors.push("同じ数字ボタンは2回使えません");
  }
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= numbers.length) {
      errors.push("無効な数字の選択です");
      break;
    }
  }

  return errors;
}

/** 式・選択数字・演算子制限を総合的に検証する */
export function validateExpressionRules(
  expression: string,
  numbers: number[],
  usedIndices: number[],
  rules?: Partial<GameRules>
): string[] {
  const config = normalizeRules(rules);
  const errors = [...validateUsedIndices(usedIndices, numbers, config)];
  const text = (expression ?? "").trim();

  if (!text) {
    if (errors.length === 0) errors.push("式を入力してください");
    return errors;
  }

  try {
    const expressionNumbers = extractNumbersFromExpression(text);
    if (expressionNumbers.length > config.numbers_to_use) {
      errors.push(`数字は最大${config.numbers_to_use}個まで使えます`);
    }

    const validIndices = (usedIndices ?? []).filter(
      (index) => Number.isInteger(index) && index >= 0 && index < numbers.length
    );
    const expectedNumbers = validIndices.map((index) => numbers[index]);

    if (!haveSameNumberMultiset(expressionNumbers, expectedNumbers)) {
      errors.push("式の数字が選んだ数字と一致しません");
    }
    evalExpression(text, config);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "式の形が不正です");
  }

  return errors;
}
