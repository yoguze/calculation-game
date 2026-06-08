import { MULTIPLAYER_ENABLED } from "../config";

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
        {MULTIPLAYER_ENABLED && (
          <>
            <button type="button" className="menu-btn online" onClick={onOnline}>
              オンライン対戦
            </button>
            <button type="button" className="menu-btn friend" onClick={onFriend}>
              フレンド対戦
            </button>
          </>
        )}
      </div>
      {!MULTIPLAYER_ENABLED && (
        <p className="hint">1人プレイはオフラインで動作します。対戦にはサーバー接続が必要です。</p>
      )}
    </div>
  );
}
