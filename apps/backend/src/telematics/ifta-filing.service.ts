/**
 * ROUND 306 E-23 addition — IFTA filing export (IFTA-100 schedule shape) from the IFTA engine.
 *
 *   fleet MPG            = total miles of THIS company's linked units in ALL jurisdictions (IFTA and non-IFTA)
 *                          / total gallons of motor fuel bought for the period (every T-45-eligible fill,
 *                          with or without a state)
 *   taxable gallons (J)  = taxable miles in J / fleet MPG
 *   tax-paid gallons (J) = gallons bought in J (state on the fill, else the state derived from the truck's
 *                          own fuel-stop dwell -- computeIftaMiles)
 *   net taxable (J)      = taxable gallons - tax-paid gallons
 * Only IFTA member jurisdictions (48 contiguous US states + 10 Canadian provinces) are scheduled.
 * No tax rates are on file, so the export is in GALLONS, never dollars. It is marked DRAFT, with every
 * reason listed, whenever a fill has no state, a Samsara vehicle is unlinked, or there is no fuel at all.
 */
import { computeIftaMiles, type IftaPeriodInput } from "./ifta-miles.service.js";
import type { SamsaraFuelEnergyRow, SamsaraIftaPeriod, SamsaraIftaVehicleReportResult } from "../integrations/samsara/samsara-client.js";
import { ML_PER_US_GALLON } from "./fuel-efficiency-signal.service.js";
import type { PgClient } from "../integrations/samsara/samsara.service.js";

export const IFTA_MEMBER_JURISDICTIONS = new Set(
  ("AL AZ AR CA CO CT DE FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY " +
    "AB BC MB NB NL NS ON PE QC SK").split(" ")
);

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export type IftaFilingLine = { jurisdiction: string; total_miles: number; taxable_miles: number; taxable_gallons: number; tax_paid_gallons: number; net_taxable_gallons: number };

export async function buildIftaFilingExport(
  client: PgClient,
  input: {
    operatingCompanyId: string;
    period: IftaPeriodInput;
    now?: Date;
    fetchReport: (p: SamsaraIftaPeriod) => Promise<SamsaraIftaVehicleReportResult>;
    /** Samsara ECU burn for the same window (T-50) -- the completeness check on the gallons we bought. */
    fetchFuelEnergy?: (startIso: string, endIso: string) => Promise<SamsaraFuelEnergyRow[]>;
  }
) {
  const r = await computeIftaMiles(client, input);
  if (r.status !== "ok") return r;
  // Filing basis = miles of this company's own linked units; gallons come from that company's fills.
  const paid = new Map(r.jurisdictions.map((j) => [j.jurisdiction, j.tax_paid_gallons]));
  const basis = r.linked_unit_miles;
  const totalMiles = basis.reduce((s, j) => s + j.total_miles, 0);
  const totalGallons = r.gallons_coverage.total_gallons;
  const mpg = totalGallons > 0 ? totalMiles / totalGallons : null;
  const jurisdictionsSeen = new Set([...basis.map((b) => b.jurisdiction), ...[...paid.keys()]]);
  const lines: IftaFilingLine[] = [...jurisdictionsSeen]
    .filter((j) => IFTA_MEMBER_JURISDICTIONS.has(j))
    .map((jurisdiction) => {
      const m = basis.find((b) => b.jurisdiction === jurisdiction) ?? { total_miles: 0, taxable_miles: 0 };
      const taxable = mpg ? m.taxable_miles / mpg : 0;
      const taxPaid = paid.get(jurisdiction) ?? 0;
      return {
        jurisdiction,
        total_miles: r1(m.total_miles),
        taxable_miles: r1(m.taxable_miles),
        taxable_gallons: r3(taxable),
        tax_paid_gallons: r3(taxPaid),
        net_taxable_gallons: r3(taxable - taxPaid),
      };
    })
    .sort((a, b) => b.total_miles - a.total_miles);
  const draftReasons: string[] = [];
  // Completeness: gallons bought on our books vs gallons the linked units' engines burned (Samsara ECU).
  let burnedGallons: number | null = null;
  if (input.fetchFuelEnergy) {
    const linkedIds = new Set(r.vehicles.filter((v) => v.unit_id).map((v) => v.samsara_vehicle_id));
    const rows = await input.fetchFuelEnergy(r.period.start, r.period.end);
    burnedGallons = rows.filter((v) => linkedIds.has(v.subject_id) && v.fuel_consumed_ml != null)
      .reduce((s, v) => s + Number(v.fuel_consumed_ml) / ML_PER_US_GALLON, 0);
    if (burnedGallons > 0 && totalGallons < burnedGallons * 0.9) {
      draftReasons.push(`fuel bought on file (${r3(totalGallons)} gal) covers only ${Math.round((totalGallons / burnedGallons) * 100)}% of what the engines burned (${r3(burnedGallons)} gal, Samsara ECU) -- fills are missing from the books, so fleet MPG and taxable gallons are not filing-grade`);
    }
  }
  if (!mpg) draftReasons.push("no motor fuel purchases in the period -- fleet MPG cannot be computed");
  if (r.gallons_coverage.rows_without_state > 0) draftReasons.push(`${r.gallons_coverage.rows_without_state} fill(s) have no state on record and none could be derived -- their tax-paid gallons are unassigned`);
  const unlinkedMiles = r.vehicles.filter((v) => !v.unit_id).reduce((s, v) => s + v.total_miles, 0);
  if (r.unlinked_samsara_vehicles > 0) draftReasons.push(`${r.unlinked_samsara_vehicles} Samsara vehicle(s) (${r1(unlinkedMiles)} mi) are not this company's units -- excluded from the schedule; confirm none should be`);
  const nonMember = basis.filter((j) => !IFTA_MEMBER_JURISDICTIONS.has(j.jurisdiction)).map((j) => ({ jurisdiction: j.jurisdiction, total_miles: r1(j.total_miles) }));
  return {
    status: "ok" as const,
    period: r.period,
    draft: draftReasons.length > 0,
    draft_reasons: draftReasons,
    totals: { total_miles: r1(totalMiles), total_gallons: r3(totalGallons), fleet_mpg: mpg ? Math.round(mpg * 100) / 100 : null, ecu_burned_gallons: burnedGallons == null ? null : r3(burnedGallons) },
    lines,
    non_member_miles: nonMember,
    gallons_coverage: r.gallons_coverage,
  };
}

export function iftaFilingCsv(lines: IftaFilingLine[]): string {
  const head = "jurisdiction,total_miles,taxable_miles,taxable_gallons,tax_paid_gallons,net_taxable_gallons";
  return [head, ...lines.map((l) => [l.jurisdiction, l.total_miles, l.taxable_miles, l.taxable_gallons, l.tax_paid_gallons, l.net_taxable_gallons].join(","))].join("\n") + "\n";
}
