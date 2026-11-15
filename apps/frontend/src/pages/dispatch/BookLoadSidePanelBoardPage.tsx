/**
 * ROUND 9.5 Board 15 — docs/design/v3/Dispatch-BookLoad-SidePanel.dc.html
 * Measurement board for the 760px Side panel Book Load shell.
 * Live wizard opens from Truck Line "Assign a load →" with the same engines.
 */
import { Link, useLocation } from "react-router-dom";
import { PageHeader, V3_HEADER_ACTION_STYLE } from "../../components/forms/shared/PageHeader";
import { V3Panel } from "../../components/v3/V3Panel";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { V3 } from "../../design/v3-tokens";
import "../../assets/fonts/v3-maintenance/board-box.css";

const STEPS = [
  { id: "A", title: "Customer · invoice · charges", note: "Same fields / order as Center modal — single column at 760px" },
  { id: "B", title: "Equipment · driver · trailer", note: "Unit + driver prefilled from the Truck Line row" },
  { id: "C", title: "Stops and miles", note: "Stops stack vertically in the side drawer" },
  { id: "D", title: "Pre-dispatch validation", note: "Same engines as Center" },
  { id: "E", title: "Documents", note: "Same engines as Center" },
];

export default function BookLoadSidePanelBoardPage() {
  const { pathname, search } = useLocation();
  const originHref = currentOriginHref(pathname, search);
  const truckLine = withReturnContext("/dispatch?tab=truck_line", originHref);
  const openSide = withReturnContext("/dispatch/book-load?book_load=1&presentation=side", originHref);

  return (
    <div
      data-v3-board="Dispatch-BookLoad-SidePanel"
      data-testid="book-load-side-panel-board"
      style={{ lineHeight: "normal", fontFamily: V3.font, color: V3.ink, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <PageHeader
        variant="v3"
        crumb="Dispatch › Truck Line › Assign a load"
        title="Book load — side panel (760)"
        subtitle="Board 15 — identical to docs/design/v3/Dispatch-BookLoad-SidePanel.dc.html"
        actions={
          <>
            <Link to={truckLine} style={{ ...V3_HEADER_ACTION_STYLE, textDecoration: "none" }}>
              Truck Line
            </Link>
            <Link to={openSide} style={{ ...V3_HEADER_ACTION_STYLE, textDecoration: "none" }}>
              Open side wizard
            </Link>
          </>
        }
      />

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          background: "#F4F3EF",
          border: `1px solid ${V3.border}`,
          borderRadius: 6,
          minHeight: 420,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          data-testid="book-load-side-panel-shell"
          style={{
            width: 760,
            maxWidth: "100%",
            background: "#F4F3EF",
            borderLeft: `1px solid ${V3.border}`,
            boxShadow: "-12px 0 30px rgba(17,24,39,.14)",
            display: "flex",
            flexDirection: "column",
            minHeight: 420,
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 18px",
              background: V3.shell,
              color: "#fff",
            }}
          >
            <div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>Dispatch › Truck Line › T122 · Assign a load</div>
              <div style={{ font: `700 16px ${V3.font}` }}>Book load</div>
            </div>
            <span style={{ flex: 1 }} aria-hidden />
            <span
              style={{ display: "inline-flex", background: "rgba(255,255,255,.12)", borderRadius: 6, padding: 2 }}
              role="group"
              aria-label="Book load layout"
            >
              <span style={{ padding: "4px 10px", borderRadius: 4, font: `600 11px ${V3.font}`, background: "#fff", color: V3.shell }}>
                Side panel
              </span>
              <span style={{ padding: "4px 10px", borderRadius: 4, font: `600 11px ${V3.font}`, color: "#fff" }}>Center</span>
            </span>
            <span style={{ fontSize: 11, opacity: 0.75 }} data-v3="header.time">
              Thu, Oct 22, 2026
            </span>
            <span style={{ font: `600 16px ${V3.font}`, paddingLeft: 6 }}>×</span>
          </header>

          <V3Panel board title="Side panel sections A–E" titleDataV3="panel.title" testId="book-load-side-panel-sections">
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {STEPS.map((step) => (
                <div
                  key={step.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr",
                    gap: 10,
                    alignItems: "start",
                    padding: "8px 10px",
                    border: `1px solid ${V3.border}`,
                    borderRadius: 6,
                    background: "#fff",
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      font: `700 12px ${V3.font}`,
                      background: V3.shell,
                      color: "#fff",
                    }}
                  >
                    {step.id}
                  </span>
                  <span>
                    <span style={{ display: "block", font: `700 12px ${V3.font}` }}>{step.title}</span>
                    <span style={{ display: "block", fontSize: 11, color: V3.muted }}>{step.note}</span>
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  background: "#fff",
                  border: `1px solid ${V3.border}`,
                  borderLeft: "3px solid #B45309",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                }}
              >
                <b style={{ color: "#B45309", whiteSpace: "nowrap" }}>Measured</b>
                <span>
                  Live Side panel is 760px from Truck Line Assign a load → · header 700 16px · toggle Side|Center · bg #F4F3EF.
                  Same engines as Center (Board 14).
                </span>
              </div>
            </div>
          </V3Panel>
        </div>
      </div>
    </div>
  );
}
