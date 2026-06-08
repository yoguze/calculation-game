export type Screen =
  | "title"
  | "soloSettings"
  | "onlineSelect"
  | "match"
  | "friendPassword"
  | "friendHostRules"
  | "friendReview"
  | "ready"
  | "game"
  | "result";

export type PlayMode = "solo" | "online" | "friend";

export type GameRules = {
  num_lo: number;
  num_hi: number;
  pool_size: number;
  numbers_to_use: number;
  allow_mul: boolean;
  allow_div: boolean;
};

export type SoloSettings = {
  problems: number;
  duration: number;
  target: number;
} & GameRules;

export type FriendRules = {
  problems: number;
  duration: number;
  target: number;
} & GameRules;

export type ProblemState = {
  expression: string;
  usedIdx: number[];
};

export type PreviewResult = {
  value: number | null;
  diff: number | null;
  errors: string[];
  valid: boolean;
  unused_numbers: string[];
  numbers_needed: number;
  numbers_selected: number;
};

export type GradeResult = {
  expr: string;
  value: number | null;
  diff: number;
  valid: boolean;
  errors?: string[];
};

export type SoloResult = {
  target: number;
  player_total_diff: number;
  player_results: GradeResult[];
  player_submitted_at_sec?: number;
  timed_out?: boolean;
  rules?: GameRules;
};

export type VersusResult = {
  role: string;
  winner: string;
  target: number;
  my_total_diff: number | null;
  op_total_diff: number | null;
  my_results: GradeResult[];
  op_results: GradeResult[];
};

export const DEFAULT_RULES: GameRules = {
  num_lo: 1,
  num_hi: 20,
  pool_size: 10,
  numbers_to_use: 5,
  allow_mul: true,
  allow_div: true,
};
