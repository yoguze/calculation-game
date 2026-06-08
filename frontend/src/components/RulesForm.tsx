import type { GameRules } from "../types";

type Props = {
  rules: GameRules;
  onChange: (rules: GameRules) => void;
};

export function RulesForm({ rules, onChange }: Props) {
  const set = <K extends keyof GameRules>(key: K, value: GameRules[K]) => {
    const next = { ...rules, [key]: value };
    if (key === "pool_size" && typeof value === "number") {
      next.numbers_to_use = Math.min(next.numbers_to_use, value);
    }
    if (key === "num_lo" && typeof value === "number") {
      next.num_hi = Math.max(next.num_hi, value);
    }
    onChange(next);
  };

  return (
    <>
      <label>
        数字の最小値
        <input
          type="number"
          min={1}
          max={99}
          value={rules.num_lo}
          onChange={(e) => set("num_lo", Number(e.target.value))}
        />
      </label>
      <label>
        数字の最大値
        <input
          type="number"
          min={rules.num_lo}
          max={99}
          value={rules.num_hi}
          onChange={(e) => set("num_hi", Number(e.target.value))}
        />
      </label>
      <label>
        提示する数字の個数
        <input
          type="number"
          min={6}
          max={20}
          value={rules.pool_size}
          onChange={(e) => set("pool_size", Number(e.target.value))}
        />
      </label>
      <label>
        使える数字の最大数
        <input
          type="number"
          min={1}
          max={rules.pool_size}
          value={rules.numbers_to_use}
          onChange={(e) => set("numbers_to_use", Number(e.target.value))}
        />
      </label>
      <div className="checkbox-row">
        <label>
          <input
            type="checkbox"
            checked={rules.allow_mul}
            onChange={(e) => set("allow_mul", e.target.checked)}
          />
          掛け算OK
        </label>
        <label>
          <input
            type="checkbox"
            checked={rules.allow_div}
            onChange={(e) => set("allow_div", e.target.checked)}
          />
          割り算OK
        </label>
      </div>
    </>
  );
}

export function rulesSummary(rules: GameRules, extra?: { problems?: number; duration?: number; target?: number }) {
  const lines = [];
  if (extra?.problems !== undefined) lines.push(`問題数: ${extra.problems}`);
  if (extra?.duration !== undefined) lines.push(`制限時間: ${extra.duration}秒`);
  if (extra?.target !== undefined) lines.push(`目標値: ${extra.target}`);
  lines.push(`数字範囲: ${rules.num_lo}〜${rules.num_hi}`);
  lines.push(`提示数字: ${rules.pool_size}個 / 使用: 最大${rules.numbers_to_use}個`);
  const ops = ["＋", "－"];
  if (rules.allow_mul) ops.push("×");
  if (rules.allow_div) ops.push("÷");
  lines.push(`演算子: ${ops.join(" ")}`);
  return lines.join("\n");
}
