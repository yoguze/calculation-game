import { extractNumbersFromExpression } from "../solo/engine/evaluator";
import type { GameRules, ProblemState } from "../types";

const OPERATOR_CHARS = ["+", "-", "*", "/", "(", ")"];

/** 式に含まれる数字をプールのインデックスに割り当てる（重複値は左から貪欲に） */
export function assignIndicesFromExpression(
  expression: string,
  numbers: number[]
): number[] {
  let values: number[];
  try {
    values = extractNumbersFromExpression(expression);
  } catch {
    return [];
  }

  const available = new Set(numbers.map((_, index) => index));
  const assigned: number[] = [];

  for (const value of values) {
    let matched = -1;
    for (let index = 0; index < numbers.length; index++) {
      if (available.has(index) && numbers[index] === value) {
        matched = index;
        break;
      }
    }
    if (matched === -1) return assigned;
    assigned.push(matched);
    available.delete(matched);
  }

  return assigned;
}

/** 数字ボタンを式に追加する（インデックスで使用済みを管理） */
export function appendNumberToExpression(
  states: ProblemState[],
  questionIndex: number,
  numberIndex: number,
  rounds: number[][],
  rules: GameRules
): ProblemState[] {
  const next = states.map((state) => ({ ...state, usedIdx: [...state.usedIdx] }));
  const current = next[questionIndex];

  if (current.usedIdx.length >= rules.numbers_to_use) return next;
  if (current.usedIdx.includes(numberIndex)) return next;

  current.expression += String(rounds[questionIndex][numberIndex]);
  current.usedIdx.push(numberIndex);
  return next;
}

/** 演算子または括弧を末尾に追加する */
export function appendOperator(
  states: ProblemState[],
  activeIndex: number,
  operator: string
): ProblemState[] {
  return states.map((state, index) =>
    index === activeIndex
      ? { ...state, expression: state.expression + operator }
      : state
  );
}

/** 末尾の入力を1単位戻す（演算子は1文字、数字は選択したまとまりごと） */
export function undoLastInput(states: ProblemState[], activeIndex: number): ProblemState[] {
  const next = states.map((state) => ({ ...state, usedIdx: [...state.usedIdx] }));
  const current = next[activeIndex];
  const expression = current.expression;

  if (!expression) return next;

  const lastChar = expression.slice(-1);
  if (OPERATOR_CHARS.includes(lastChar)) {
    current.expression = expression.slice(0, -1);
  } else {
    while (current.expression.length && /[0-9]/.test(current.expression.slice(-1))) {
      current.expression = current.expression.slice(0, -1);
    }
    if (current.usedIdx.length) current.usedIdx.pop();
  }

  return next;
}

/** 選択中の問題の式をクリアする */
export function clearExpression(states: ProblemState[], activeIndex: number): ProblemState[] {
  return states.map((state, index) =>
    index === activeIndex ? { expression: "", usedIdx: [] } : state
  );
}

/** キーボードの数字キーで式に1桁追加する（プール内の数字のみ有効） */
export function appendKeyboardDigit(
  states: ProblemState[],
  activeIndex: number,
  digit: string,
  rounds: number[][],
  rules: GameRules
): ProblemState[] {
  const numbers = rounds[activeIndex];
  const next = states.map((state) => ({ ...state, usedIdx: [...state.usedIdx] }));
  const current = next[activeIndex];
  const newExpression = current.expression + digit;

  let valueCount = 0;
  try {
    valueCount = extractNumbersFromExpression(newExpression).length;
  } catch {
    return states;
  }
  if (valueCount > rules.numbers_to_use) return states;

  const newUsedIdx = assignIndicesFromExpression(newExpression, numbers);
  if (newUsedIdx.length > rules.numbers_to_use) return states;

  current.expression = newExpression;
  current.usedIdx = newUsedIdx;
  return next;
}
