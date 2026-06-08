type ResultScreenProps = {
  resultText: string;
  outcome: "win" | "lose" | "draw" | null;
  onRetry: () => void;
  onBackToTitle: () => void;
};

const OUTCOME_LABELS = {
  win: "勝ち！",
  lose: "負け…",
  draw: "引き分け！",
} as const;

export function ResultScreen({ resultText, outcome, onRetry, onBackToTitle }: ResultScreenProps) {
  return (
    <div className="container container-wide">
      <h2>結果</h2>
      <div className="result-box">{resultText}</div>
      {outcome && <div className={`result-winner ${outcome}`}>{OUTCOME_LABELS[outcome]}</div>}
      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          もう一度
        </button>
        <button type="button" className="btn btn-back" onClick={onBackToTitle}>
          タイトルに戻る
        </button>
      </div>
    </div>
  );
}
