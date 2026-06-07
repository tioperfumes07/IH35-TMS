import { randomUUID } from "node:crypto";
import { createTtlCache } from "../../../lib/ttl-cache.js";
import { buildExhibitA } from "./exhibit-a-cash-receipts.js";
import { buildExhibitB } from "./exhibit-b-disbursements.js";
import { buildExhibitC } from "./exhibit-c-bank-reconciliation.js";
import { buildExhibitD } from "./exhibit-d-quarterly-fees.js";
import { buildExhibitE } from "./exhibit-e-statements-summary.js";
import { buildExhibitF } from "./exhibit-f-supporting-docs.js";
import type { BuiltExhibits, ExhibitLetter, ExhibitQueryClient } from "./types.js";

const EXHIBIT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const exhibitCache = createTtlCache<BuiltExhibits>();

export type BuildAllInput = {
  userId: string;
  operating_company_id: string;
  period_start: string;
  period_end: string;
  filing_uuid?: string;
};

export async function buildAllExhibits(
  client: ExhibitQueryClient,
  input: BuildAllInput
): Promise<BuiltExhibits> {
  const period = {
    operating_company_id: input.operating_company_id,
    period_start: input.period_start,
    period_end: input.period_end,
  };

  const [a, b, c, d, e, f] = await Promise.all([
    buildExhibitA(client, period),
    buildExhibitB(client, period),
    buildExhibitC(client, period),
    buildExhibitD(client, period),
    buildExhibitE(input.userId, period),
    buildExhibitF(client, period),
  ]);

  const filing_uuid = input.filing_uuid ?? randomUUID();
  const built: BuiltExhibits = {
    filing_uuid,
    operating_company_id: input.operating_company_id,
    period_start: input.period_start,
    period_end: input.period_end,
    built_at: new Date().toISOString(),
    exhibits: { a, b, c, d, e, f },
  };

  exhibitCache.set(filing_uuid, built, EXHIBIT_CACHE_TTL_MS);
  return built;
}

export function getBuiltExhibits(filingUuid: string): BuiltExhibits | null {
  return exhibitCache.get(filingUuid) ?? null;
}

export function getSingleExhibit(filingUuid: string, letter: ExhibitLetter): unknown | null {
  const built = getBuiltExhibits(filingUuid);
  if (!built) return null;
  return built.exhibits[letter] ?? null;
}

export function exhibitsToXlsxRows(built: BuiltExhibits): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  for (const letter of ["a", "b", "c", "d", "e", "f"] as ExhibitLetter[]) {
    const exhibit = built.exhibits[letter] as { title?: string };
    rows.push({ exhibit: letter.toUpperCase(), title: exhibit?.title ?? letter, status: "built" });
  }
  return rows;
}
