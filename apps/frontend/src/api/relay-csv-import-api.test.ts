import { afterEach, describe, expect, it, vi } from "vitest";
import { importRelayTransactionsCsv, RELAY_CSV_IMPORT_PATH } from "./relayDeposits";

// ACCT-F11086 — Relay publishes no deposit API; the portal CSV is the only feed of wallet fundings. The import route
// had no caller, so deposits stopped at the last hand-run file (2026-10-09). The caller must send the CSV RAW with
// Content-Type text/csv: a JSON-encoded body reaches the route as a quoted string and imports nothing.
describe("importRelayTransactionsCsv", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the raw CSV as text/csv to the Relay import route for the company", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "imported", deposits: 2, imported: 1, rejected: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    const csv = "id,type,status,total amount\nd1,deposit,settled,100.00\n";
    const res = await importRelayTransactionsCsv("5c854333-6ea5-4faa-af31-67cb272fef80", csv);
    expect(res.deposits).toBe(2);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`${RELAY_CSV_IMPORT_PATH}?operating_company_id=5c854333-6ea5-4faa-af31-67cb272fef80`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("text/csv");
    expect(init.body).toBe(csv);
  });

  it("refuses a 200 that is not JSON (static host fallback) instead of reporting an import", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })));
    await expect(importRelayTransactionsCsv("co", "id\n")).rejects.toThrow();
  });
});
