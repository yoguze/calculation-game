import type { GradeResult } from "../types";

/** 採点結果を結果画面用のテキストに整形する */
export function formatResults(
  label: string,
  results: GradeResult[],
  total: number | null
): string {
  const lines = [`${label} 合計差: ${total ?? "—"}`];

  results.forEach((result, index) => {
    const questionNo = index + 1;
    if (!result?.expr) {
      const reason = result.errors?.length ? `（${result.errors.join("、")}）` : "";
      lines.push(`  問${questionNo}: 無回答${reason}`);
      return;
    }
    const invalidMark = result.valid ? "" : " ※無効";
    lines.push(
      `  問${questionNo}: ${result.expr} = ${result.value}（差 ${result.diff}）${invalidMark}`
    );
  });

  return lines.join("\n");
}
