import type { FriendRules, GameRules, VersusResult } from "../types";

/** サーバーから送られる Socket.IO イベントの型定義 */
export type GameStartPayload = {
  rounds: number[][];
  target: number;
  duration: number;
  problems: number;
  rules: GameRules;
  mode_label?: string;
};

export type ExhibitionJoinedPayload = {
  is_host: boolean;
  message?: string;
  password?: string;
};

export type RulesProposedPayload = { rules: FriendRules };
export type ReadyPhasePayload = { rules: FriendRules; message: string };
export type MessagePayload = { message: string };
export type CountdownPayload = { count: number };
export type MatchedPayload = { role: string; mode_label?: string };
export type ReadyStatusPayload = { ready_count: number; need: number };
export type TimeUpdatePayload = { time_left?: number };
export type SubmitResultPayload = { total_diff?: number; message?: string };

export type { VersusResult };
