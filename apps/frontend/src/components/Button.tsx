import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
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

export function Button({ variant = "primary", loading = false, className = "", children, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses(variant)} ${className}`}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}
