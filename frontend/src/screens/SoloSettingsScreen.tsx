import { RulesForm } from "../components/RulesForm";
import type { SoloSettings } from "../types";

type SoloSettingsScreenProps = {
  settings: SoloSettings;
  onChange: (settings: SoloSettings) => void;
  onStart: () => void;
  onBack: () => void;
};

export function SoloSettingsScreen({
  settings,
  onChange,
  onStart,
  onBack,
}: SoloSettingsScreenProps) {
  return (
    <div className="container">
      <h2>1人プレイ 設定</h2>
      <div className="form-grid">
        <label>
          問題数
          <input
            type="number"
            min={1}
            max={5}
            value={settings.problems}
            onChange={(e) => onChange({ ...settings, problems: Number(e.target.value) })}
          />
        </label>
        <label>
          制限時間（秒）
          <input
            type="number"
            min={5}
            max={300}
            value={settings.duration}
            onChange={(e) => onChange({ ...settings, duration: Number(e.target.value) })}
          />
        </label>
        <label>
          目標値
          <input
            type="number"
            min={10}
            max={2000}
            value={settings.target}
            onChange={(e) => onChange({ ...settings, target: Number(e.target.value) })}
          />
        </label>
        <RulesForm rules={settings} onChange={(rules) => onChange({ ...settings, ...rules })} />
      </div>
      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onStart}>
          開始
        </button>
        <button type="button" className="btn btn-back" onClick={onBack}>
          戻る
        </button>
      </div>
    </div>
  );
}
