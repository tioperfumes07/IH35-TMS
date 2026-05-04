import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "md" | "sm";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

function variantClasses(variant: ButtonVariant) {
  if (variant === "secondary") {
    return "border-gray-300 bg-white text-gray-700 hover:bg-gray-50";
  }
  if (variant === "danger") {
    return "border-crit bg-crit text-white hover:bg-red-700";
  }
  return "border-info bg-info text-white hover:bg-blue-700";
}

function sizeClasses(variant: ButtonVariant, size: ButtonSize) {
  if (size === "sm") return "h-7 px-2 text-[11px]";
  if (variant === "primary" || variant === "danger") return "h-9 px-3 text-[13px]";
  return "h-8 px-3 text-xs";
}

export function Button({ variant = "primary", size = "md", loading = false, className = "", children, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-1 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses(variant)} ${sizeClasses(variant, size)} ${className}`}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}
