import { useEffect, useState } from "react";
import { previewExpression } from "../solo/engine";
import type { GameRules, PreviewResult, ProblemState } from "../types";

type Props = {
  rounds: number[][];
  problemStates: ProblemState[];
  activeProblem: number;
  target: number;
  rules: GameRules;
  submitted: boolean;
  onActiveChange: (index: number) => void;
  onPickNumber: (qi: number, ni: number) => void;
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

export function ProblemBoard({
  rounds,
  problemStates,
  activeProblem,
  target,
  rules,
  submitted,
  onActiveChange,
  onPickNumber,
}: Props) {
  const [previews, setPreviews] = useState<PreviewResult[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    rounds.forEach((nums, qi) => {
      const st = problemStates[qi];
      const timer = setTimeout(() => {
        const result = previewExpression(
          st?.expression ?? "",
          nums,
          st?.usedIdx ?? [],
          target,
          rules
        );
        setPreviews((prev) => {
          const next = [...prev];
          next[qi] = result;
          return next;
        });
      }, 150);
      timers.push(timer);
    });
    return () => timers.forEach(clearTimeout);
  }, [rounds, problemStates, target, rules]);

  const previewClass = (p: PreviewResult | undefined, hasExpr: boolean) => {
    if (!p || (!hasExpr && p.errors.length === 0)) return "preview-box";
    if (p.valid) return "preview-box ok";
    if (p.value !== null) return "preview-box warn";
    return "preview-box err";
  };

  return (
    <div className="problems-container">
      {rounds.map((nums, qi) => {
        const st = problemStates[qi];
        const preview = previews[qi] ?? EMPTY_PREVIEW;
        const hasExpr = Boolean(st?.expression?.trim());

        return (
          <div
            key={qi}
            className={`problem-panel${qi === activeProblem ? " active" : ""}`}
            onClick={() => onActiveChange(qi)}
          >
            <h4>問題 {qi + 1}</h4>
            <div className="nums">
              {nums.map((n, ni) => (
                <button
                  key={ni}
                  type="button"
                  className="num-btn"
                  disabled={submitted || st.usedIdx.includes(ni) || st.usedIdx.length >= rules.numbers_to_use}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickNumber(qi, ni);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="expr-box">{st.expression || "（式を入力）"}</div>
            <div className={previewClass(preview, hasExpr)}>
              {preview.value !== null && (
                <div className="preview-value">
                  = {preview.value}
                  {preview.diff !== null && ` （目標との差: ${preview.diff}）`}
                </div>
              )}
              <div>
                選択: {preview.numbers_selected} / {preview.numbers_needed}
                {preview.unused_numbers.length > 0 && ` ・未使用: ${preview.unused_numbers.join(", ")}`}
              </div>
              {preview.errors.length > 0 && (
                <ul className="preview-errors">
                  {preview.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function undoExpression(states: ProblemState[], active: number): ProblemState[] {
  const next = states.map((s) => ({ ...s, usedIdx: [...s.usedIdx] }));
  const st = next[active];
  const expr = st.expression;
  if (!expr) return next;

  const ops = ["+", "-", "*", "/", "(", ")"];
  const last = expr.slice(-1);
  if (ops.includes(last)) {
    st.expression = expr.slice(0, -1);
  } else {
    while (st.expression.length && /[0-9]/.test(st.expression.slice(-1))) {
      st.expression = st.expression.slice(0, -1);
    }
    if (st.usedIdx.length) st.usedIdx.pop();
  }
  return next;
}

export function clearExpression(states: ProblemState[], active: number): ProblemState[] {
  return states.map((s, i) =>
    i === active ? { expression: "", usedIdx: [] } : s
  );
}

export function appendOperator(states: ProblemState[], active: number, op: string): ProblemState[] {
  return states.map((s, i) =>
    i === active ? { ...s, expression: s.expression + op } : s
  );
}

export function pickNumber(
  states: ProblemState[],
  qi: number,
  ni: number,
  rounds: number[][],
  rules: GameRules
): ProblemState[] {
  const next = states.map((s) => ({ ...s, usedIdx: [...s.usedIdx] }));
  const st = next[qi];
  if (st.usedIdx.length >= rules.numbers_to_use) return next;
  if (st.usedIdx.includes(ni)) return next;
  st.expression += String(rounds[qi][ni]);
  st.usedIdx.push(ni);
  return next;
}
