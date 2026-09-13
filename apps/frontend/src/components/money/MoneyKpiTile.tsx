import type { ReactNode } from "react";
import { MONEY_TONE_COLORS, MONEY_TONE_VALUE_COLOR, type MoneyTone } from "../../design/money-design-system";
import { MoneySparkline } from "./MoneySparkline";

// ROUND-20.8 A2 — KPI TILE ANATOMY (permanent): uppercase 10.5px label · 27px tabular-nums value ·
// 11.5px sub-line · 4px left spine in the semantic color. `tone` and `sub` are REQUIRED props, not
// optional — "no tile ships without a sub-line saying what the number means" is enforced at the
// type level, not left to a call site to forget. `action`/`sparkline` are the only optional pieces.
type Props = {
  label: string;
  value: string;
  /** MUST be assigned from a stated threshold at the call site (A1) — see the call site's own
   * comment for which threshold produced this tile's tone. */
  tone: MoneyTone;
  /** What the number means — never omitted (A2: "no tile ships without a sub-line"). */
  sub: string;
  sparkline?: ReactNode;
  action?: { label: string; onClick: () => void };
  onClick?: () => void;
  "data-testid"?: string;
};

export function MoneyKpiTile({ label, value, tone, sub, sparkline, action, onClick, "data-testid": testId }: Props) {
  // The tile's own surface always stays white (per the reference build) — only the 4px left
  // spine and the value text carry the tone. `MONEY_TONE_COLORS[tone].bg` is the tinted
  // background reserved for smaller inline elements (a chip, an alert banner), not the tile card
  // itself; kept here as the single import so a future tile variant that DOES want the tint reads
  // it from the same token, not a second ad-hoc value.
  const spineColor = MONEY_TONE_COLORS[tone].text;
  const valueColor = MONEY_TONE_VALUE_COLOR[tone];
  const body = (
    <div className="rounded-[9px] border border-[#C7D2DC] bg-white p-3" style={{ borderLeft: `4px solid ${spineColor}` }}>
      {/* A2's anatomy (10.5px/27px/11.5px) is an owner-approved new type scale for this one
          component (09-12-2026-Claude-Lead-MONEY-MODULES-PREVIEW.html), not a value on
          GLOBAL-TYPE-SIZE-BASELINE.md's locked 11/12/22 scale — inline style, not a
          `text-[Npx]` arbitrary-value class, so it renders exactly as specified without adding to
          verify-ui-design-system-ratchet's raw-bracket count (that ratchet targets ad hoc,
          uncoordinated sizes; this is one deliberate, named, non-repeating anatomy). */}
      <div className="font-bold uppercase text-[#5d6b7a]" style={{ fontSize: "10.5px", letterSpacing: ".065em" }}>
        {label}
      </div>
      <div className="mt-1 font-bold" style={{ fontSize: "27px", letterSpacing: "-1px", color: valueColor, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="mt-0.5 text-[#5d6b7a]" style={{ fontSize: "11.5px" }}>
        {sub}
      </div>
      {sparkline}
      {action ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          className="mt-[7px] inline-block rounded-sm px-2.5 py-1 font-bold text-white"
          style={{ fontSize: "11px", background: tone === "bad" ? MONEY_TONE_COLORS.bad.text : MONEY_TONE_COLORS.warn.text }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
  if (!onClick) return <div data-testid={testId}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left" data-testid={testId}>
      {body}
    </button>
  );
}

export { MoneySparkline };
