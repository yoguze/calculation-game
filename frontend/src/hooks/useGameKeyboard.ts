import { useEffect } from "react";
import type { GameRules, ProblemState } from "../types";
import { availableOperators } from "../utils/problemState";
import {
  appendKeyboardDigit,
  appendOperator,
  clearExpression,
  undoLastInput,
} from "../utils/expressionInput";

type UseGameKeyboardOptions = {
  enabled: boolean;
  submitted: boolean;
  activeProblem: number;
  rounds: number[][];
  rules: GameRules;
  onProblemStatesChange: (states: ProblemState[]) => void;
  onSubmit: () => void;
  getProblemStates: () => ProblemState[];
};

const OPERATOR_KEYS: Record<string, string> = {
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "(": "(",
  ")": ")",
};

const OPERATOR_CODES: Record<string, string> = {
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadMultiply: "*",
  NumpadDivide: "/",
};

function resolveOperator(event: KeyboardEvent): string | null {
  return OPERATOR_KEYS[event.key] ?? OPERATOR_CODES[event.code] ?? null;
}

/** Mac の delete キーは Backspace。全消去は Delete / fn+Delete / ⌘+delete */
function isClearAllShortcut(event: KeyboardEvent): boolean {
  if (event.altKey) return false;
  if (event.key === "Delete") return true;
  if (event.key === "Backspace" && (event.metaKey || event.ctrlKey)) return true;
  return false;
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey;
}

export function isMacKeyboard(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function keyboardHintText(): string {
  if (isMacKeyboard()) {
    return "キーボード: 0–9・記号 / deleteで1つ戻す / ⌘+deleteで全消去 / Enterで提出";
  }
  return "キーボード: 0–9・記号 / Backspaceで1つ戻す / Deleteで全消去 / Enterで提出";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** ゲーム画面のキーボード操作（記号入力・Backspace・Delete・Enter） */
export function useGameKeyboard({
  enabled,
  submitted,
  activeProblem,
  rounds,
  rules,
  onProblemStatesChange,
  onSubmit,
  getProblemStates,
}: UseGameKeyboardOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const updateStates = (updater: (states: ProblemState[]) => ProblemState[]) => {
      onProblemStatesChange(updater(getProblemStates()));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === "Enter") {
        if (!submitted) {
          event.preventDefault();
          onSubmit();
        }
        return;
      }

      if (submitted) return;

      if (isUndoShortcut(event)) {
        event.preventDefault();
        updateStates((states) => undoLastInput(states, activeProblem));
        return;
      }

      if (isClearAllShortcut(event)) {
        event.preventDefault();
        updateStates((states) => clearExpression(states, activeProblem));
        return;
      }

      const operator = resolveOperator(event);
      if (operator) {
        if (!availableOperators(rules).includes(operator)) return;
        event.preventDefault();
        updateStates((states) => appendOperator(states, activeProblem, operator));
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        updateStates((states) =>
          appendKeyboardDigit(states, activeProblem, event.key, rounds, rules)
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeProblem,
    enabled,
    getProblemStates,
    onProblemStatesChange,
    onSubmit,
    rounds,
    rules,
    submitted,
  ]);
}
