/**
 * LEAD 443.216 (10-21 23:45Z, parity re-run 10-22 00:35Z) — 13697 (T156) and 13699 (T174) were BOOKED with practical miles
 * only: createDriverBillArtifacts refused the bill (refused_no_shortest_miles — owner law LEAD 443.192, per-mile pay is
 * short miles only) and Book Load committed the load anyway → no driver bill, pay 0 on every screen.
 * Main: the rule does not exist (the booking commits). Branch: a live booking whose bill was refused throws, so its
 * transaction rolls back whole; the Settlement Creator (historical_backfill) still records its signed load.
 */
import { describe, expect, it } from "vitest";
import * as bookLoadService from "../book-load.service.js";

const refused = { outcome: "refused_no_shortest_miles", reason: "No SHORT miles have been captured for this load" };
const ok = (driver_bill_mint: unknown) => ({ kind: "ok", row: { id: "load-1", load_number: "13697", driver_bill_mint } }) as never;

describe("Book Load — every live booking mints its driver bill (443.216)", () => {
  const assertMinted = (bookLoadService as Record<string, unknown>).assertDriverBillMintedAtBooking as
    | ((source: string, result: unknown) => void)
    | undefined;

  it("the rule exists on the booking path", () => {
    expect(typeof assertMinted).toBe("function");
  });

  it("a live booking whose driver bill was refused (no short miles) rolls back with the reason — the 13697 / 13699 shape", () => {
    expect(() => assertMinted!("live_feed", ok(refused))).toThrow(/driver_bill_required_at_booking: No SHORT miles/);
    try {
      assertMinted!("live_feed", ok(refused));
    } catch (e) {
      expect((e as { code?: string }).code).toBe("driver_bill_required_at_booking");
      expect(e).toBeInstanceOf((bookLoadService as Record<string, unknown>).DriverBillRequiredAtBookingError as never);
    }
  });

  it("a minted bill, a $0 tracking bill, an existing bill, a salaried week and a no-driver booking all book", () => {
    for (const mint of [
      { outcome: "minted", bill_number: "B-13697" },
      { outcome: "skipped_no_pay_rate", reason: "x", missing: ["pay rate"] },
      { outcome: "already_exists" },
      { outcome: "not_minted_salaried", reason: "salaried week" },
      { outcome: "not_applicable" },
      null,
    ]) {
      expect(() => assertMinted!("live_feed", ok(mint))).not.toThrow();
    }
  });

  it("the Settlement Creator (historical_backfill) still records a signed load whose bill is refused", () => {
    expect(() => assertMinted!("historical_backfill", ok(refused))).not.toThrow();
  });
});
