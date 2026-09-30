import type { ReactNode } from "react";
import { MASTER_DETAIL } from "../design/master-detail";
import { QBO_SURFACE } from "../design/qbo-parity";

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: ReactNode;
  testId?: string;
};

type Props<T extends string> = {
  value: T;
  options: Array<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  /** e.g. data-view-mode-toggle="customers" */
  dataAttributes?: Record<string, string>;
  className?: string;
  /** Optional data-testid on the group container. */
  testId?: string;
};

/**
 * C-01 — ONE segmented control family for view toggles AND status toggles.
 * Measured defect (2026-09-30 /customers): view pills h=22 / status h=24, padding
 * `0px 8px` vs `4px 8px`, widths 67/93/52/61/31, inactive background rgba(0,0,0,0).
 *
 * Locked: 28px height (CLICKABLE-BOX-SIZE LAW), 12px font, 2px radius, 0 8px padding,
 * min-width so short labels share rhythm, group 1px border, inactive tint (never transparent).
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  dataAttributes,
  className = "",
  testId,
}: Props<T>) {
  return (
    <div
      role="group"
      data-testid={testId}
      data-segmented-control="true"
      className={`inline-flex h-7 items-stretch rounded-sm border bg-white p-0.5 text-center text-xs ${className}`.trim()}
      style={{ borderColor: QBO_SURFACE.border }}
      {...dataAttributes}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-testid={option.testId}
            data-segment-active={active ? "true" : "false"}
            className={`inline-flex h-full min-w-[4.5rem] items-center justify-center rounded-sm px-2 text-xs font-medium ${
              active ? MASTER_DETAIL.segmentActiveClass : MASTER_DETAIL.segmentInactiveClass
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
