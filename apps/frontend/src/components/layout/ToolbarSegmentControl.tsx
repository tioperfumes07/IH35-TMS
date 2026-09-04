import type { ReactNode } from "react";

export type ToolbarSegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  testId?: string;
};

type Props<T extends string> = {
  value: T;
  options: Array<ToolbarSegmentOption<T>>;
  onChange: (value: T) => void;
  /** e.g. data-view-mode-toggle="customers" */
  dataAttributes?: Record<string, string>;
  className?: string;
};

/**
 * CLICKABLE-BOX-SIZE LAW (owner ruling 2026-09-04, ORCH-measured) — this is ORCH's own "view
 * toggles" example, measured at 32px/4px radius and named wrong. Fixed to the one clickable-box
 * target: 28px height, 12px font, 2px radius, 0 8px padding.
 * (Was LAY-10: matched FILTER_CONTROL_SIZE_CLASS (h-9) so Filters/Create/view-mode read as one
 * row in a toolbar. That coupling is superseded here — segment toggles are clickable boxes, not
 * filter inputs, per the 2026-09-04 spec's own split between the two.)
 */
export function ToolbarSegmentControl<T extends string>({
  value,
  options,
  onChange,
  dataAttributes,
  className = "",
}: Props<T>) {
  return (
    <div
      className={`inline-flex h-7 items-stretch rounded-sm border border-gray-300 bg-white p-0.5 text-center ${className}`.trim()}
      {...dataAttributes}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-testid={option.testId}
            className={`inline-flex h-full items-center justify-center rounded-sm px-2 text-xs font-medium ${
              active ? "bg-[#1F2A44] text-white" : "text-gray-700 hover:bg-gray-50"
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
