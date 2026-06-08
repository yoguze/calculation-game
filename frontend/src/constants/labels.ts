/** オンライン対戦の時間モード */
export const ONLINE_MODES = {
  quick: { label: "すぱっと", duration: 10 },
  normal: { label: "ふつう", duration: 30 },
  slow: { label: "じっくり", duration: 60 },
} as const;

export type OnlineModeId = keyof typeof ONLINE_MODES;
