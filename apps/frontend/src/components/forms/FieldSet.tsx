import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  columns?: 1 | 2 | 3;
};

export function FieldSet({ title, children, columns = 2 }: Props) {
  const gridClass =
    columns === 1 ? "grid-cols-1" : columns === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2";
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
      <div className={`grid gap-2 ${gridClass}`}>{children}</div>
    </section>
  );
}
