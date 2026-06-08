import { ONLINE_MODES, type OnlineModeId } from "../constants/labels";

export function OnlineSelectScreen({
  onSelect,
  onBack,
}: {
  onSelect: (mode: OnlineModeId) => void;
  onBack: () => void;
}) {
  return (
    <div className="container">
      <h2>オンライン対戦</h2>
      <p className="hint">200固定・3問・数字は最大5個まで・まとめて提出（時間切れは入力中の式を採点）</p>
      <div className="menu-list">
        {(Object.keys(ONLINE_MODES) as OnlineModeId[]).map((mode) => (
          <button key={mode} type="button" className="menu-btn online" onClick={() => onSelect(mode)}>
            {ONLINE_MODES[mode].label}（{ONLINE_MODES[mode].duration}秒）
          </button>
        ))}
      </div>
      <div className="controls">
        <button type="button" className="btn btn-back" onClick={onBack}>
          戻る
        </button>
      </div>
    </div>
  );
}

export function MatchScreen({
  modeLabel,
  message,
  countdown,
  onBack,
}: {
  modeLabel: string;
  message: string;
  countdown: number;
  onBack: () => void;
}) {
  return (
    <div className="container">
      <h2>
        オンライン <span className="badge">{modeLabel}</span>
      </h2>
      <p className="message">{message}</p>
      <p>
        スタートまで: <strong>{countdown}</strong> 秒
      </p>
      <div className="controls">
        <button type="button" className="btn btn-back" onClick={onBack}>
          戻る
        </button>
      </div>
    </div>
  );
}
