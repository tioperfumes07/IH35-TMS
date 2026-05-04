import type { ReactNode } from "react";

type Props = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function PwaCard({ title, subtitle, children, className = "" }: Props) {
  return (
    <section className={`rounded-xl border border-pwa-border bg-pwa-card p-4 ${className}`}>
      {title ? <h2 className="text-base font-semibold text-pwa-text-primary">{title}</h2> : null}
      {subtitle ? <p className="mt-1 text-xs text-pwa-text-secondary">{subtitle}</p> : null}
      <div className={title || subtitle ? "mt-3" : ""}>{children}</div>
    </section>
  );
}
