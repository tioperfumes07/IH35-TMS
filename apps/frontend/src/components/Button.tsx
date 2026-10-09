import type { ButtonHTMLAttributes } from "react";
import { spacing, BUTTON_MD_SIZE_CLASS, BUTTON_ICON_SM_SIZE_CLASS } from "../design/tokens";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
type ButtonSize = "md" | "sm" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

/**
 * BUTTON-FEEL (owner 2026-10-09) — primary actions must read as filled clickable boxes, not
 * text links. Primary fill is actionNavy #14314F (NAVY-NOT-BLACK / ACTION-NAVY). Press
 * (active:), focus-visible ring, and cursor-pointer are required affordances on every variant.
 */
function variantClasses(variant: ButtonVariant) {
  if (variant === "tertiary") {
    return "border-transparent bg-transparent text-[#14314F] hover:bg-[#F7F8FA] active:bg-[#EAECF1]";
  }
  if (variant === "secondary") {
    return "border-gray-300 bg-white text-[#0F1219] hover:bg-gray-50 active:bg-[#EAECF1]";
  }
  if (variant === "danger") {
    return "border-crit bg-crit text-white hover:bg-red-700 active:bg-red-800";
  }
  return "border-[#14314F] bg-[#14314F] text-white hover:bg-[#0F1729] active:bg-[#0A1220]";
}

// UI CONTROL LAW (owner ruling 2026-09-01) — ONE height for every "md" button regardless of
// variant (was h-8 for primary/danger vs h-7 for secondary/tertiary — the direct, file-level
// cause of the owner's "three different box sizes" report). "md" also matches
// FILTER_CONTROL_SIZE_CLASS so a button and a filter in the same toolbar row read as one row.
function sizeClasses(_variant: ButtonVariant, size: ButtonSize) {
  if (size === "icon") return `${BUTTON_ICON_SM_SIZE_CLASS} w-8 p-0`;
  if (size === "sm") return `${BUTTON_ICON_SM_SIZE_CLASS} px-2`;
  return BUTTON_MD_SIZE_CLASS;
}

export function Button({ variant = "primary", size = "md", loading = false, className = "", children, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center gap-1 border font-medium transition select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14314F]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses(variant)} ${sizeClasses(variant, size)} ${className}`}
      style={{ borderRadius: spacing.radiusButton }}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}
