import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * ROUND 197 (owner-raised, 2026-09-28) — the ONE shared box/token implementation for every banking
 * transactions register control: tabs, money filter, presets, collapse-groupings, suggest-matches,
 * transaction-type filter trigger, categorize-by, pagination. Every literal below is transcribed
 * verbatim from docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md — surface #FFFFFF, border #E5E7EB, radius
 * 2px (rounded-sm), text primary #0F1219 / secondary #1F2A44 / muted #6B7280, 28px control height.
 * Active state uses navy #14314F: the ONE locked "strong dark" token left in the baseline after
 * #1F2A44/#1B2333 were explicitly retired 2026-09-04 (NAVY-NOT-BLACK LAW) for reading near-black;
 * green #16A34A is reserved for primary-action/status (a different semantic), so it is not reused
 * as an active-tab fill here. No new colors are invented — verify-banking-controls-boxed-and-
 * tokenized.mjs asserts every hex literal in the banking control components resolves to one of the
 * seven named here, and that this file is the only place a banking control box renders from.
 */
export const BANKING_BOX_SURFACE = "#FFFFFF";
export const BANKING_BOX_BORDER = "#E5E7EB";
export const BANKING_BOX_TEXT_PRIMARY = "#0F1219";
export const BANKING_BOX_TEXT_SECONDARY = "#1F2A44";
export const BANKING_BOX_TEXT_MUTED = "#6B7280";
export const BANKING_BOX_ACTIVE_BG = "#14314F";
export const BANKING_BOX_ACTIVE_TEXT = "#FFFFFF";
export const BANKING_BOX_PAGE_BG = "#F7F8FA";

/** 28px height, 2px radius, locked border/surface/text (owner ruling 2026-09-04, "clickable boxes
 *  size to their text"). Every standalone banking control button renders through this. */
const BOX_BASE =
  "flex h-7 items-center gap-1 rounded-sm border px-2.5 text-xs font-medium leading-none transition-colors " +
  "border-[#E5E7EB] bg-white text-[#1F2A44] hover:bg-[#F7F8FA] " +
  "disabled:cursor-not-allowed disabled:text-[#6B7280] disabled:hover:bg-white";

const BOX_ACTIVE = "border-[#14314F] bg-[#14314F] text-white hover:bg-[#14314F]";

export function bankingControlBoxClass(opts: { active?: boolean; className?: string } = {}): string {
  return [BOX_BASE, opts.active ? BOX_ACTIVE : "", opts.className ?? ""].filter(Boolean).join(" ");
}

type BankingControlBoxProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

/** A standalone control box (Presets trigger, Collapse all groupings, Suggest matches, …). */
export function BankingControlBox({ active, className, children, ...rest }: BankingControlBoxProps) {
  return (
    <button type="button" className={bankingControlBoxClass({ active, className })} {...rest}>
      {children}
    </button>
  );
}

/** A segment inside a BankingControlGroup — same tokens as BankingControlBox but no independent
 *  border/radius/height of its own; the group supplies the single outer box and internal dividers. */
export function BankingControlSegment({
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={[
        "flex h-7 items-center px-2.5 text-xs font-medium leading-none transition-colors",
        active ? "bg-[#14314F] text-white" : "text-[#1F2A44] hover:bg-[#F7F8FA]",
        "disabled:cursor-not-allowed disabled:text-[#6B7280] disabled:hover:bg-transparent",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The ONE shared box for a segmented control (tabs, money filter, group-by, categorize-by,
 * pagination): a single outer border/radius/surface with an internal divider between each
 * BankingControlSegment child, instead of each segment carrying its own separate box — this is what
 * makes the active segment "visually unmistakable, not a 1px tint difference" (owner requirement):
 * an unmistakable navy fill against plain-white siblings inside one continuous bordered box.
 */
export function BankingControlGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "inline-flex h-7 items-stretch overflow-hidden rounded-sm border border-[#E5E7EB] bg-white",
        "[&>button+button]:border-l [&>button+button]:border-[#E5E7EB]",
        "[&>*+*]:border-l [&>*+*]:border-[#E5E7EB]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

/** Section-label chrome for a group (e.g. "From", "Categorize by") — 11px/700/UPPERCASE/#4B5563,
 *  the locked "column/section headers (page subheads)" spec, transcribed verbatim. */
export const BANKING_CONTROL_LABEL_CLASS = "text-[11px] font-semibold uppercase tracking-[0.4px] text-[#4B5563]";
