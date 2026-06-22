import type { ButtonHTMLAttributes } from "react";
import { spacing } from "../design/tokens";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
type ButtonSize = "md" | "sm" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

function variantClasses(variant: ButtonVariant) {
  if (variant === "tertiary") {
    return "border-transparent bg-transparent text-slate-700 hover:bg-slate-100";
  }
  if (variant === "secondary") {
    return "border-gray-300 bg-white text-[#0F1219] hover:bg-gray-50";
  }
  if (variant === "danger") {
    return "border-crit bg-crit text-white hover:bg-red-700";
  }
  return "border-[#16A34A] bg-[#16A34A] text-white hover:bg-green-700";
}

function sizeClasses(variant: ButtonVariant, size: ButtonSize) {
  if (size === "icon") return "h-6 w-6 p-0 text-[11px]";
  if (size === "sm") return "h-6 px-2 text-[11px]";
  if (variant === "primary" || variant === "danger") return "h-8 px-3 text-[13px]";
  return "h-7 px-3 text-[13px]";
}

export function Button({ variant = "primary", size = "md", loading = false, className = "", children, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-1 border font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses(variant)} ${sizeClasses(variant, size)} ${className}`}
      style={{ borderRadius: spacing.radiusButton }}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}
