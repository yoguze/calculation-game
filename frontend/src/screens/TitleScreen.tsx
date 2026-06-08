import { MULTIPLAYER_AVAILABLE } from "../config";

type TitleScreenProps = {
  onSolo: () => void;
  onOnline: () => void;
  onFriend: () => void;
};

export function TitleScreen({ onSolo, onOnline, onFriend }: TitleScreenProps) {
  return (
    <div className="container">
      <h1>200calclation</h1>
      <p className="subtitle">数字を選んで目標値に近づけ！</p>
      <div className="menu-list">
        <button type="button" className="menu-btn solo" onClick={onSolo}>
          1人プレイ
        </button>
        <button type="button" className="menu-btn online" onClick={onOnline}>
          オンライン対戦
        </button>
        <button type="button" className="menu-btn friend" onClick={onFriend}>
          フレンド対戦
        </button>
      </div>
      <p className="hint">
        {MULTIPLAYER_AVAILABLE
          ? "1人プレイはオフラインで動作します。"
          : "1人プレイは今すぐ遊べます。対戦はサーバー接続後に利用可能です。"}
      </p>
    </div>
  );
}
