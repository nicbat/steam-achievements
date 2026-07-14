import { signed2, signed5 } from "../lib/format";

interface Props {
  count: number;
  delta: number; // projected points gained
  onClick: () => void;
}

export function PlanPill({ count, delta, onClick }: Props) {
  return (
    <button className="planpill" onClick={onClick} title="Open your plan">
      <span className="planpill__mark" aria-hidden="true">
        &#9670;
      </span>
      Plan &middot; {count}
      {count > 0 && (
        <span className="planpill__d" title={`exact ${signed5(delta)}`}>
          {signed2(delta)}
        </span>
      )}
    </button>
  );
}
