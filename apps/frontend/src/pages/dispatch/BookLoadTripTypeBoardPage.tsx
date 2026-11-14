/**
 * ROUND 9.4 Board 17 — docs/design/v3/Dispatch-BookLoad-TripType.dc.html
 * What appears under trip type for NB / TR / SB — same cards as the live Book Load wizard.
 */
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader, V3_HEADER_ACTION_STYLE } from "../../components/forms/shared/PageHeader";
import { V3Panel } from "../../components/v3/V3Panel";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { V3 } from "../../design/v3-tokens";

type TripCode = "NB" | "TR" | "SB";

const CARDS: Array<{ code: TripCode; icon: string; label: string; desc: string; live: string }> = [
  {
    code: "NB",
    icon: "▲",
    label: "Northbound",
    desc: "Cross-border load — record the port of entry",
    live: "Live: shows BORDER CROSSING * — the crossing stop and the Customs tab appear on the load on their own.",
  },
  {
    code: "TR",
    icon: "▶",
    label: "Triangulation",
    desc: "Joins this unit's tour after its most recent Northbound leg",
    live: 'Live: "Part of this unit\'s tour — follows its most recent Northbound leg (joined automatically)." No border crossing.',
  },
  {
    code: "SB",
    icon: "▼",
    label: "Southbound",
    desc: "Joins the tour + cross-border port of entry",
    live: "Live: joins the tour (same line as TR) AND shows BORDER CROSSING *.",
  },
];

export default function BookLoadTripTypeBoardPage() {
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  const openWizard = withReturnContext("/dispatch/book-load?book_load=1", originHref);
  const [selected, setSelected] = useState<TripCode>("NB");
  const active = CARDS.find((c) => c.code === selected)!;

  return (
    <div data-v3-board="Dispatch-BookLoad-TripType" data-testid="book-load-trip-type-board" style={{ lineHeight: "normal", fontFamily: V3.font, color: V3.ink, display: "flex", flexDirection: "column", gap: 12 }}>
      <PageHeader
        variant="v3"
        crumb="Dispatch › Book load"
        title="Book load — trip type NB / TR / SB"
        subtitle="What appears under the trip type for each choice — read from the live wizard 7:28 PM CT"
        actions={
          <Link to={openWizard} style={{ ...V3_HEADER_ACTION_STYLE, textDecoration: "none" }}>
            Same engines
          </Link>
        }
      />

      <V3Panel
        board
        title={`${active.code} · ${active.label} selected`}
        viewAllHref={openWizard}
        testId="book-load-trip-type-panel"
      >
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ font: `600 10.5px ${V3.font}`, color: V3.muted }}>
            Trip type<span style={{ color: V3.red }}> *</span>
          </div>
          <div
            role="radiogroup"
            aria-label="Trip type"
            data-testid="book-load-trip-type-radiogroup"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}
          >
            {CARDS.map((card) => {
              const on = selected === card.code;
              return (
                <button
                  key={card.code}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`book-load-trip-type-card-${card.code}`}
                  onClick={() => setSelected(card.code)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: on ? `2px solid ${V3.shell}` : `1px solid ${V3.border}`,
                    background: on ? "#EEF2F7" : "#F5F6F8",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: V3.font,
                    lineHeight: "normal",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: `700 12px ${V3.font}`,
                      background: on ? V3.shell : V3.headerBg,
                      color: on ? V3.onShell : V3.muted,
                      flexShrink: 0,
                    }}
                  >
                    {card.icon}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", font: `700 12px ${V3.font}`, color: V3.ink }}>
                      {card.code} · {card.label}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: V3.muted }}>{card.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {(selected === "NB" || selected === "SB") && (
            <div data-testid="book-load-trip-type-border" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ font: `600 11px ${V3.font}`, color: V3.ink }}>Border crossing — port of entry</div>
              <div
                style={{
                  height: 32,
                  padding: "0 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderRadius: 6,
                  border: `1px solid ${V3.border}`,
                  background: V3.surface,
                  font: `600 12px ${V3.font}`,
                  color: V3.ink,
                  maxWidth: 320,
                }}
              >
                <span>Select port of entry</span>
                <span>▾</span>
              </div>
              <div style={{ fontSize: 11, color: V3.muted }}>
                Cross-border load. The crossing stop and the Customs tab then appear on the load on their own.
              </div>
            </div>
          )}

          {selected === "TR" && (
            <div style={{ fontSize: 12, color: V3.ink }}>
              Part of this unit&apos;s tour — follows its most recent Northbound leg (joined automatically).
            </div>
          )}

          <div style={{ fontSize: 12, color: V3.ink, borderTop: `1px solid ${V3.borderSoft}`, paddingTop: 10 }}>
            {active.live}
          </div>
        </div>
      </V3Panel>
    </div>
  );
}
