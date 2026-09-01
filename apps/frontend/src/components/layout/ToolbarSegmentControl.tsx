import type { ReactNode } from "react";
import { FILTER_CONTROL_SIZE_CLASS } from "../../design/tokens";

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
 * LAY-10 — one control height for every segment toggle in a PageHeader toolbar row.
 * Matches FILTER_CONTROL_SIZE_CLASS (h-9) so Filters / Create / view-mode read as one row.
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
      className={`inline-flex ${FILTER_CONTROL_SIZE_CLASS} items-stretch rounded-sm border border-gray-300 bg-white p-0.5 ${className}`.trim()}
      {...dataAttributes}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-testid={option.testId}
            className={`inline-flex h-full items-center rounded-sm px-3 font-medium ${
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
