import { SegmentedControl } from "./SegmentedControl";
import type { EntityViewMode } from "../hooks/useViewModePref";

type Props = {
  entity: string;
  value: EntityViewMode;
  onChange: (mode: EntityViewMode) => void;
};

/**
 * C-55 — house Regular + Master-detail toggle.
 * Same control, same place (PageHeader actions), same size (SegmentedControl h-7 / min-w-[4.5rem]).
 * Label is Regular (the table), not "List view" — Round 300 C-40 / Round 301 C-55 wording.
 */
export function EntityViewModeToggle({ entity, value, onChange }: Props) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      dataAttributes={{ "data-view-mode-toggle": entity, "data-c55-view-toggle": "1" }}
      options={[
        { value: "list", label: "Regular", testId: `${entity}-view-list` },
        { value: "master-detail", label: "Master-detail", testId: `${entity}-view-master-detail` },
      ]}
    />
  );
}
