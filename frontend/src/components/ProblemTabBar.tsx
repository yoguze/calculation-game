import type { ProblemState } from "../types";

type ProblemTabBarProps = {
  count: number;
  activeIndex: number;
  problemStates: ProblemState[];
  onSelect: (index: number) => void;
};

type TabButtonProps = {
  index: number;
  isActive: boolean;
  hasInput: boolean;
  picked: number;
  onSelect: (index: number) => void;
};

function TabButton({ index, isActive, hasInput, picked, onSelect }: TabButtonProps) {
  const className = `problem-tab${isActive ? " active" : ""}${hasInput ? " filled" : ""}`;
  const label = (
    <>
      問{index + 1}
      {picked > 0 && <span className="problem-tab-badge">{picked}</span>}
    </>
  );

  if (isActive) {
    return (
      <button
        type="button"
        aria-current="page"
        className={className}
        onClick={() => onSelect(index)}
      >
        {label}
      </button>
    );
  }

  return (
    <button type="button" className={className} onClick={() => onSelect(index)}>
      {label}
    </button>
  );
}

/** スマホ向け: 横スクロールで問題を切り替えるタブ */
export function ProblemTabBar({
  count,
  activeIndex,
  problemStates,
  onSelect,
}: ProblemTabBarProps) {
  return (
    <nav className="problem-tabs" aria-label="問題選択">
      {Array.from({ length: count }, (_, index) => {
        const state = problemStates[index];
        return (
          <TabButton
            key={index}
            index={index}
            isActive={index === activeIndex}
            hasInput={Boolean(state?.expression?.trim())}
            picked={state?.usedIdx.length ?? 0}
            onSelect={onSelect}
          />
        );
      })}
    </nav>
  );
}
