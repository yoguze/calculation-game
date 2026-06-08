import { useEffect, useState } from "react";
import { previewExpression } from "../solo/engine/index";
import type { GameRules, PreviewResult, ProblemState } from "../types";
import { PreviewPanel } from "./PreviewPanel";

type ProblemBoardProps = {
  rounds: number[][];
  problemStates: ProblemState[];
  activeProblem: number;
  target: number;
  rules: GameRules;
  submitted: boolean;
  onActiveChange: (index: number) => void;
  onPickNumber: (questionIndex: number, numberIndex: number) => void;
};

const EMPTY_PREVIEW: PreviewResult = {
  value: null,
  diff: null,
  errors: [],
  valid: false,
  unused_numbers: [],
  numbers_needed: 5,
  numbers_selected: 0,
};

/**
 * 複数問の数字選択・式入力 UI。
 * プレビューはソロエンジンをローカル呼び出し（サーバー不要）。
 */
export function ProblemBoard({
  rounds,
  problemStates,
  activeProblem,
  target,
  rules,
  submitted,
  onActiveChange,
  onPickNumber,
}: ProblemBoardProps) {
  const [previews, setPreviews] = useState<PreviewResult[]>([]);

  useEffect(() => {
    const timers = rounds.map((numbers, questionIndex) => {
      const state = problemStates[questionIndex];
      return window.setTimeout(() => {
        const result = previewExpression(
          state?.expression ?? "",
          numbers,
          state?.usedIdx ?? [],
          target,
          rules
        );
        setPreviews((previous) => {
          const next = [...previous];
          next[questionIndex] = result;
          return next;
        });
      }, 150);
    });

    return () => timers.forEach(clearTimeout);
  }, [rounds, problemStates, target, rules]);

  return (
    <div className="problems-container">
      {rounds.map((numbers, questionIndex) => {
        const state = problemStates[questionIndex];
        const preview = previews[questionIndex] ?? EMPTY_PREVIEW;
        const isActive = questionIndex === activeProblem;

        return (
          <div
            key={questionIndex}
            className={`problem-panel${isActive ? " active" : ""}`}
            onClick={() => onActiveChange(questionIndex)}
          >
            <h4>問題 {questionIndex + 1}</h4>
            <div className="nums">
              {numbers.map((number, numberIndex) => (
                <button
                  key={numberIndex}
                  type="button"
                  className="num-btn"
                  disabled={
                    submitted ||
                    state.usedIdx.includes(numberIndex) ||
                    state.usedIdx.length >= rules.numbers_to_use
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onPickNumber(questionIndex, numberIndex);
                  }}
                >
                  {number}
                </button>
              ))}
            </div>
            <div className="expr-box">{state.expression || "（式を入力）"}</div>
            <PreviewPanel preview={preview} hasExpression={Boolean(state.expression?.trim())} />
          </div>
        );
      })}
    </div>
  );
}
