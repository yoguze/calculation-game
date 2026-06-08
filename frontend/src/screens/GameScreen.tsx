import { useEffect, useRef } from "react";
import { ProblemBoard } from "../components/ProblemBoard";
import { ProblemTabBar } from "../components/ProblemTabBar";
import { keyboardHintText, useGameKeyboard } from "../hooks/useGameKeyboard";
import type { GameRules, ProblemState } from "../types";
import { availableOperators } from "../utils/problemState";
import {
  appendNumberToExpression,
  appendOperator,
  clearExpression,
  undoLastInput,
} from "../utils/expressionInput";

type GameScreenProps = {
  title: string;
  hint: string;
  target: number;
  timeLeft: number;
  rules: GameRules;
  rounds: number[][];
  problemStates: ProblemState[];
  activeProblem: number;
  submitted: boolean;
  message: string;
  onActiveProblemChange: (index: number) => void;
  onProblemStatesChange: (states: ProblemState[]) => void;
  onSubmit: () => void;
  onQuit: () => void;
};

export function GameScreen({
  title,
  hint,
  target,
  timeLeft,
  rules,
  rounds,
  problemStates,
  activeProblem,
  submitted,
  message,
  onActiveProblemChange,
  onProblemStatesChange,
  onSubmit,
  onQuit,
}: GameScreenProps) {
  const operators = availableOperators(rules);

  const updateStates = (updater: (states: ProblemState[]) => ProblemState[]) => {
    onProblemStatesChange(updater(problemStates));
  };

  const problemStatesRef = useRef(problemStates);
  useEffect(() => {
    problemStatesRef.current = problemStates;
  }, [problemStates]);

  useGameKeyboard({
    enabled: true,
    submitted,
    activeProblem,
    rounds,
    rules,
    onProblemStatesChange,
    onSubmit,
    getProblemStates: () => problemStatesRef.current,
  });

  return (
    <div className="container container-wide game-screen">
      <header className="game-screen-header">
        <h2>
          {title} <span className="badge">{target}</span>
        </h2>
        <p className={`timer-line${timeLeft <= 10 ? " urgent" : ""}`}>
          残り時間: {timeLeft} 秒
        </p>
        {hint && <p className="hint game-hint">{hint}</p>}
      </header>

      <div className="game-screen-body">
        <ProblemTabBar
          count={rounds.length}
          activeIndex={activeProblem}
          problemStates={problemStates}
          onSelect={onActiveProblemChange}
        />
        <ProblemBoard
          rounds={rounds}
          problemStates={problemStates}
          activeProblem={activeProblem}
          target={target}
          rules={rules}
          submitted={submitted}
          onActiveChange={onActiveProblemChange}
          onPickNumber={(questionIndex, numberIndex) =>
            updateStates((states) =>
              appendNumberToExpression(states, questionIndex, numberIndex, rounds, rules)
            )
          }
        />
        {message && <p className="message game-message">{message}</p>}
      </div>

      <footer className="game-screen-toolbar">
        <p className="toolbar-label">演算子（問{activeProblem + 1}）</p>
        <div className="btn-row op-row">
          {operators.map((operator) => (
            <button
              key={operator}
              type="button"
              className="op-btn"
              disabled={submitted}
              aria-label={`演算子 ${operator}`}
              onClick={() =>
                updateStates((states) => appendOperator(states, activeProblem, operator))
              }
            >
              {operator}
            </button>
          ))}
        </div>

        <div className="toolbar-edit-actions">
          <button
            type="button"
            className="btn btn-sub btn-undo"
            disabled={submitted || !problemStates[activeProblem]?.expression}
            onClick={() => updateStates((states) => undoLastInput(states, activeProblem))}
          >
            1つ戻す
          </button>
          <button
            type="button"
            className="btn btn-clear-all"
            disabled={submitted || !problemStates[activeProblem]?.expression}
            onClick={() => updateStates((states) => clearExpression(states, activeProblem))}
          >
            一括消去
          </button>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-primary btn-submit"
            disabled={submitted}
            onClick={onSubmit}
          >
            提出
          </button>
        </div>

        <p className="keyboard-hint">{keyboardHintText()}</p>

        <button type="button" className="btn btn-ghost btn-quit" onClick={onQuit}>
          やめる
        </button>
      </footer>
    </div>
  );
}
