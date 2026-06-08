import { io, Socket } from "socket.io-client";

/** Render 等のマルチプレイサーバー URL（末尾スラッシュなし） */
export const MULTIPLAYER_URL = (
  import.meta.env.VITE_MULTIPLAYER_URL as string | undefined
)?.replace(/\/$/, "") ?? "";

/**
 * 開発時は Vite プロキシ経由でローカル Flask に接続。
 * 本番静的ホスティングでは VITE_MULTIPLAYER_URL が必要。
 */
export const MULTIPLAYER_ENABLED = Boolean(MULTIPLAYER_URL || import.meta.env.DEV);

export function createMultiplayerSocket(): Socket {
  return io(MULTIPLAYER_URL || undefined, {
    transports: ["websocket", "polling"],
  });
}
