// ROUND 16.1 (owner 2026-09-06 20:2xZ "THE LEGS, WHAT IS THAT, THE COLUMNS NEED TO AUTO ADJUST … WE
// CANNOT HAVE A COLUMN OCCUPY ALL SCREEN, BE LOGICAL"). The tour register's Legs cell used to be one
// long wrapping string ("7 · NB 13519 → NB 13550 → …") that blew a row up to 265px tall. This shared
// cell renders ONE nowrap line: a count pill first ("7 legs"), then each leg as a compact
// type-colored pill (NB accent-soft · TR rule2 · SB warn-soft · LOCAL muted) that is an EntityLink to
// the load; the overflow collapses to a "+N more" pill whose title lists every leg in order. Used by
// BOTH the Load-Costs Settlement/Pre-Settlement register and the /settlements Tours register so the
// two surfaces stay identical.
import { EntityLink } from "../shared/EntityLink";
import type { ParityColumn } from "../parity/ParityTable";
import type { TourListRow } from "../../api/tourReadout";
import type { TourLegBrief } from "../../api/tourReadout";

const DASH = "\u2014";

/** The Legs header explains itself (the owner asked "WHAT IS THAT"). */
export const LEGS_HEADER_TITLE =
  "Legs = the loads in this tour, in order: NB Laredo pickup · TR triangle · SB Laredo delivery · LOCAL Laredo→Laredo";

/** How many leg pills render before the rest collapse to "+N more". */
export const LEGS_VISIBLE = 4;

export function legPillClass(tripType: string | null): string {
  switch ((tripType ?? "").toUpperCase()) {
    case "NB":
      return "ldt-legpill nb";
    case "TR":
      return "ldt-legpill tr";
    case "SB":
      return "ldt-legpill sb";
    case "LOCAL":
      return "ldt-legpill local";
    default:
      return "ldt-legpill local";
  }
}

/** The pill strip needs only identity + type; callers may pass the full TourLegBrief or this minimal shape. */
export type TourLegPill = Pick<TourLegBrief, "load_id" | "load_number" | "trip_type">;

export function TourLegsCell({ legs, legsLabel }: { legs: TourLegPill[] | null | undefined; legsLabel?: string }) {
  const list = legs ?? [];
  if (list.length === 0) return <span className="ldt-muted">{DASH}</span>;
  const shown = list.slice(0, LEGS_VISIBLE);
  const hidden = list.length - shown.length;
  const fullList = legsLabel ?? list.map((l) => `${l.trip_type ?? "?"} ${l.load_number}`).join(" → ");
  return (
    <span className="ldt-legs" data-testid="tour-legs-cell" title={fullList}>
      <span className="ldt-legcount" data-testid="tour-legs-count">
        {list.length} legs
      </span>
      {shown.map((l) => (
        <EntityLink
          key={l.load_id}
          kind="load"
          id={l.load_id}
          label={`${l.trip_type ?? "?"} ${l.load_number}`}
          className={legPillClass(l.trip_type)}
          title={`${l.trip_type ?? "?"} ${l.load_number}`}
        />
      ))}
      {hidden > 0 ? (
        <span className="ldt-legmore" data-testid="tour-legs-more" title={fullList}>
          +{hidden} more
        </span>
      ) : null}
    </span>
  );
}

/** One leg's chip + load number, or a dash when this row has no leg at that position. */
function LegColumnCell({ leg }: { leg: TourLegPill | undefined }) {
  if (!leg) return <span className="ldt-muted">{DASH}</span>;
  return (
    <EntityLink
      kind="load"
      id={leg.load_id}
      label={`${leg.trip_type ?? "?"} ${leg.load_number}`}
      className={legPillClass(leg.trip_type)}
      title={`${leg.trip_type ?? "?"} ${leg.load_number}`}
    />
  );
}

/** REG-010/011, corrected (owner 2026-09-11, "SETTLEMENT LOAD LINKAGE: FIX THE RENDER, NOT THE
 *  SCHEMA"): REG-010/011 originally made this "Load Number" cell show ONLY the first leg by design
 *  ("expand the settlement to see every load") -- that is the exact "only 1 load per settlement"
 *  render bug the owner is now overturning. A settlement/tour can and should cover multiple loads
 *  (locked architecture).
 *
 *  ROUND 155.15 FIX B / 157-D item 2 (owner, verbatim): "IN PRE SETTLEMENT EACH LOAD NUMBER SHOULD
 *  HAVE ITS OWN COLUMN. NOT VARIOUS IN ONE. ITS CONFUSING AND NOT CLEAN." The single load_numbers
 *  cell (TourLegsCell's pill strip crammed into one <span>) is replaced with ONE COLUMN PER LEG --
 *  "Leg 1".."Leg N", N generated from the WIDEST row in the current result set (never hard-coded),
 *  so a 1-leg and a 4-leg tour both render cleanly and every leg gets its own sortable column. Each
 *  cell is that leg's trip-type chip + load number (LegColumnCell); a tour with fewer legs than the
 *  widest row shows a dash in the columns it doesn't reach. The old legs[0]-only "Trip type" column
 *  is DELETED -- trip type now lives inside each leg's own cell, so a 4-leg tour no longer hides
 *  three of its four trip types behind a column that only ever showed the first. tourLoadColumns is
 *  SHARED (SettlementsToursRegister's TOUR_COLUMNS + SettlementsCompanyDriverTab's
 *  CompanyDriverPicker both call it), so this fix lands once and both registers inherit it. */
export function tourLoadColumns(prefix: string, rows: readonly Pick<TourListRow, "legs">[]): ParityColumn<TourListRow>[] {
  const maxLegs = rows.reduce((max, r) => Math.max(max, (r.legs ?? []).length), 0);
  const legColumns: ParityColumn<TourListRow>[] = Array.from({ length: maxLegs }, (_, i) => ({
    key: `leg_${i + 1}`,
    label: `Leg ${i + 1}`,
    headerTitle: i === 0 ? "Every load in this tour, one column per leg" : undefined,
    testId: `${prefix}-leg-${i + 1}`,
    sortable: true,
    alwaysVisible: i === 0,
    minWidth: 110,
    maxWidth: 160,
    cellClass: "whitespace-nowrap",
    sortValue: (r: TourListRow) => r.legs?.[i]?.load_number ?? "",
    exportValue: (r: TourListRow) => r.legs?.[i]?.load_number ?? "",
    render: (r: TourListRow) => <LegColumnCell leg={r.legs?.[i]} />,
  }));
  return [
    ...legColumns,
    { key: "load_count", label: "Load count", testId: `${prefix}-load-count`, sortable: true,
      sortValue: r => r.leg_count, render: r => r.leg_count },
  ];
}
