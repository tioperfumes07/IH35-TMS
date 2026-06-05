import type { ReactNode } from "react";

export type FlatField = {
  label: string;
  value: ReactNode;
  span?: 1 | 2 | 3;
};

type Props = {
  fields: FlatField[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
};

const COLUMN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
};

export function FlatFieldGrid({ fields, columns = 3, className = "" }: Props) {
  return (
    <div className={`grid gap-x-4 gap-y-3 ${COLUMN_CLASS[columns]} ${className}`.trim()} data-flat-field-grid>
      {fields.map((field, index) => (
        <div
          key={`${field.label}-${index}`}
          className={
            field.span === 3 ? "col-span-full" : field.span === 2 ? "md:col-span-2" : undefined
          }
        >
          <div className="text-xs uppercase tracking-wide text-gray-500">{field.label}</div>
          <div className="text-base font-medium text-gray-900">{field.value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}
