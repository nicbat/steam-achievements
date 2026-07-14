import { usePlan } from "../context/PlanContext";
import type { PlanItem } from "../lib/plan";

interface Props {
  item: PlanItem;
  label?: string;
}

/** A small +/✓ toggle that adds a move to the shared plan. */
export function AddButton({ item, label }: Props) {
  const plan = usePlan();
  const on = plan.has(item);
  return (
    <button
      className={`addbtn${on ? " addbtn--on" : ""}`}
      aria-pressed={on}
      title={label ?? (on ? "Remove from plan" : "Add to plan")}
      onClick={(e) => {
        e.stopPropagation();
        plan.toggle(item);
      }}
    >
      {on ? "✓" : "+"}
    </button>
  );
}
