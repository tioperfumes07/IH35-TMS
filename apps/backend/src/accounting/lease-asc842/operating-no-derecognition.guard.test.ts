// FIN-22 static CI guard (owner-locked): an OPERATING lessor lease must NEVER derecognize the asset at
// COMMENCEMENT. Under Option A (default), Trucking KEEPS the unit on its books and depreciates it; the
// asset is only removed at the END-OF-TERM SALE (via fixed_asset_disposals). This guard fails loudly if a
// future edit makes the operating path credit an asset-cost / accumulated-depreciation account at
// commencement (which would be a sales-type-only behavior leaking into operating).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "lease-posting.service.ts"), "utf8");

/** Slice a single exported function body from the service source (stops before the next function's
 * banner comment or export, so trailing doc banners never leak into the slice). */
function fnBody(name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const rest = src.slice(start + 10); // skip past this declaration keyword
  const stops = [rest.indexOf("\nexport async function "), rest.indexOf("\n// ──")].filter((i) => i >= 0);
  const end = stops.length ? Math.min(...stops) : -1;
  return end < 0 ? rest : rest.slice(0, end);
}

describe("FIN-22 operating lease — no derecognition at commencement (static guard)", () => {
  it("has NO operating-commencement posting function at all", () => {
    expect(src).not.toMatch(/postOperatingCommencement/);
    expect(src).not.toMatch(/operating[_A-Za-z]*[Cc]ommencement/);
  });

  it("the operating rental-period path never touches the asset cost / accumulated depreciation", () => {
    const body = fnBody("postOperatingRentalPeriod");
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toMatch(/asset_account_id/);
    expect(body).not.toMatch(/accum_depr/);
    expect(body).not.toMatch(/derecogni/i);
    expect(body).not.toMatch(/fixed_asset_disposals/);
    // It DOES recognize rental income (the only credit on the operating period).
    expect(body).toContain("rental_income");
  });

  it("asset derecognition (Cr asset cost / Dr accum) only happens in the END-OF-TERM SALE or SALES-TYPE commencement", () => {
    // The only functions allowed to credit asset_account_id are the end-of-term sale and the sales-type
    // commencement — both explicitly removal events, never the operating commencement (which does not exist).
    expect(fnBody("postOperatingEndOfTermSale")).toContain("asset_account_id");
    expect(fnBody("postSalesTypeCommencement")).toContain("asset_account_id");
    expect(fnBody("postOperatingRentalPeriod")).not.toContain("asset_account_id");
  });

  it("documents the owner-locked rule and gates on the OFF flag", () => {
    expect(src).toMatch(/NO derecognition[\s\S]{0,80}COMMENCEMENT/i);
    expect(src).toContain("LEASE_GL_POSTING_FLAG_KEY");
  });
});
