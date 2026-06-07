import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function TouchOptimizedButton({ children, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-14 min-w-[44px] items-center justify-center gap-4 rounded-lg px-4 text-base font-semibold ${className}`}
      data-testid="touch-optimized-button"
      {...rest}
    >
      {children}
    </button>
  );
}
