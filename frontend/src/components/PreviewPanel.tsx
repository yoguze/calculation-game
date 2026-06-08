import type { PreviewResult } from "../types";

type PreviewPanelProps = {
  preview: PreviewResult;
  hasExpression: boolean;
};

function resolvePreviewClass(preview: PreviewResult, hasExpression: boolean): string {
  if (!hasExpression && preview.errors.length === 0) return "preview-box";
  if (preview.valid) return "preview-box ok";
  if (preview.value !== null) return "preview-box warn";
  return "preview-box err";
}

/** 式の評価結果・ルール違反を表示する */
export function PreviewPanel({ preview, hasExpression }: PreviewPanelProps) {
  return (
    <div className={resolvePreviewClass(preview, hasExpression)}>
      {preview.value !== null && (
        <div className="preview-value">
          = {preview.value}
          {preview.diff !== null && ` （目標との差: ${preview.diff}）`}
        </div>
      )}
      <div>
        選択: {preview.numbers_selected} / 最大{preview.numbers_needed}
        {preview.unused_numbers.length > 0 && ` ・未使用: ${preview.unused_numbers.join(", ")}`}
      </div>
      {preview.errors.length > 0 && (
        <ul className="preview-errors">
          {preview.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
