import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
};

function variantClass(variant: Variant): string {
  if (variant === "secondary") {
    return "border-pwa-border bg-[#121827] text-pwa-text-primary active:bg-[#0F1420]";
  }
  if (variant === "ghost") {
    return "border-transparent bg-transparent text-pwa-text-secondary active:bg-[#202737]";
  }
  return "border-hos-onduty_waiting/70 bg-hos-onduty_waiting text-[#111827] active:bg-[#d18604]";
}

export function PwaButton({ variant = "primary", icon, className = "", children, ...props }: Props) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${variantClass(variant)} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
