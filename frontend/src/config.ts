import { io, Socket } from "socket.io-client";

/** Render 等のマルチプレイサーバー URL（末尾スラッシュなし） */
export const MULTIPLAYER_URL = (
  import.meta.env.VITE_MULTIPLAYER_URL as string | undefined
)?.replace(/\/$/, "") ?? "";

/** Render 等で Flask と同一オリジン配信するとき（ビルド時に true） */
const SAME_ORIGIN_MULTIPLAYER =
  import.meta.env.VITE_SAME_ORIGIN_MULTIPLAYER === "true";

/**
 * マルチプレイサーバーに接続できるか（UI表示とは別）。
 * 開発時は Vite プロキシ経由でローカル Flask に接続。
 */
export const MULTIPLAYER_AVAILABLE = Boolean(
  MULTIPLAYER_URL || import.meta.env.DEV || SAME_ORIGIN_MULTIPLAYER
);

export function createMultiplayerSocket(): Socket {
  return io(MULTIPLAYER_URL || undefined, {
    transports: ["websocket", "polling"],
  });
}
