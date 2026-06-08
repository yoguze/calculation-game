import { RulesForm, rulesSummary } from "../components/RulesForm";
import { MULTIPLAYER_AVAILABLE } from "../config";
import type { FriendRules } from "../types";

export function FriendPasswordScreen({
  password,
  message,
  onPasswordChange,
  onJoin,
  onBack,
}: {
  password: string;
  message: string;
  onPasswordChange: (value: string) => void;
  onJoin: () => void;
  onBack: () => void;
}) {
  return (
    <div className="container">
      <h2>フレンド対戦</h2>
      <p className="hint">4桁のパスワードを相手と揃えてください</p>
      {!MULTIPLAYER_AVAILABLE && (
        <p className="message">対戦サーバーが未接続のため、ルーム参加はいま利用できません。</p>
      )}
      <input
        className="pwd-input"
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder="0000"
        value={password}
        disabled={!MULTIPLAYER_AVAILABLE}
        onChange={(e) => onPasswordChange(e.target.value)}
      />
      <div className="controls">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!MULTIPLAYER_AVAILABLE}
          onClick={onJoin}
        >
          参加
        </button>
        <button type="button" className="btn btn-back" onClick={onBack}>
          戻る
        </button>
      </div>
      <p className="message">{message}</p>
    </div>
  );
}

export function FriendHostRulesScreen({
  rules,
  message,
  onChange,
  onSend,
}: {
  rules: FriendRules;
  message: string;
  onChange: (rules: FriendRules) => void;
  onSend: () => void;
}) {
  return (
    <div className="container">
      <h2>ルール設定（ホスト）</h2>
      <div className="form-grid">
        <label>
          問題数
          <input
            type="number"
            min={1}
            max={5}
            value={rules.problems}
            onChange={(e) => onChange({ ...rules, problems: Number(e.target.value) })}
          />
        </label>
        <label>
          制限時間（秒）
          <input
            type="number"
            min={5}
            max={300}
            value={rules.duration}
            onChange={(e) => onChange({ ...rules, duration: Number(e.target.value) })}
          />
        </label>
        <label>
          目標値
          <input
            type="number"
            min={10}
            max={2000}
            value={rules.target}
            onChange={(e) => onChange({ ...rules, target: Number(e.target.value) })}
          />
        </label>
        <RulesForm rules={rules} onChange={(next) => onChange({ ...rules, ...next })} />
      </div>
      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onSend}>
          ルールを送る
        </button>
      </div>
      <p className="message">{message}</p>
    </div>
  );
}

export function FriendReviewScreen({
  rules,
  message,
  onApprove,
}: {
  rules: FriendRules;
  message: string;
  onApprove: () => void;
}) {
  return (
    <div className="container">
      <h2>ルール確認</h2>
      <div className="rules-box">{rulesSummary(rules, rules)}</div>
      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onApprove}>
          承認する
        </button>
      </div>
      <p className="message">{message}</p>
    </div>
  );
}

export function ReadyScreen({
  rules,
  status,
  onStart,
}: {
  rules: FriendRules;
  status: string;
  onStart: () => void;
}) {
  return (
    <div className="container">
      <h2>プレイ開始！</h2>
      <div className="rules-box">{rulesSummary(rules, rules)}</div>
      <p className="message">{status}</p>
      <div className="controls">
        <button type="button" className="btn btn-primary" onClick={onStart}>
          開始
        </button>
      </div>
    </div>
  );
}
