import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isVoidCancelEntitySupported,
  knownVoidCancelEntities,
  resolveSurfaceVoidGate,
} from "./void-cancel-executors.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "./void-cancel-executors.ts"), "utf8");

describe("Task #24 — void/cancel executor wiring", () => {
  describe("resolveSurfaceVoidGate — OFF posting flag never writes GL", () => {
    it("posted GL + flag OFF => blocked (never orphan, never post)", () => {
      expect(resolveSurfaceVoidGate(false, true)).toBe("blocked");
    });
    it("no posted GL + flag OFF => flip_only (no reversal, no GL write)", () => {
      expect(resolveSurfaceVoidGate(false, false)).toBe("flip_only");
    });
    it("flag ON => reverse (postVoidReversal builds the equal-and-opposite JE)", () => {
      expect(resolveSurfaceVoidGate(true, true)).toBe("reverse");
      expect(resolveSurfaceVoidGate(true, false)).toBe("reverse");
    });
    it("with the flag OFF the gate is NEVER 'reverse' (proves an OFF void writes nothing to GL)", () => {
      expect(resolveSurfaceVoidGate(false, true)).not.toBe("reverse");
      expect(resolveSurfaceVoidGate(false, false)).not.toBe("reverse");
    });
  });

  describe("dispatch map — VOID-EVERYWHERE PR-3: WO/bill/invoice/expense/JE/payment/bill_payment/driver_settlement wired; load flagged", () => {
    it("work_order, bill, invoice are supported (Phase 1 / Task #24)", () => {
      expect(isVoidCancelEntitySupported("work_order")).toBe(true);
      expect(isVoidCancelEntitySupported("bill")).toBe(true);
      expect(isVoidCancelEntitySupported("invoice")).toBe(true);
    });
    it("expense, journal_entry, payment, bill_payment, driver_settlement are now wired (PR-3)", () => {
      expect(isVoidCancelEntitySupported("expense")).toBe(true);
      expect(isVoidCancelEntitySupported("journal_entry")).toBe(true);
      expect(isVoidCancelEntitySupported("payment")).toBe(true);
      expect(isVoidCancelEntitySupported("bill_payment")).toBe(true);
      expect(isVoidCancelEntitySupported("driver_settlement")).toBe(true);
    });
    it("load remains unwired — dispatch load-cancel keeps its OWN dedicated maker/checker (flagged, not silently dropped)", () => {
      expect(isVoidCancelEntitySupported("load")).toBe(false);
    });
    it("unknown entity types are not supported", () => {
      expect(isVoidCancelEntitySupported("nope")).toBe(false);
    });
    it("all wired + flagged entities are registered (no silent no-op)", () => {
      const known = knownVoidCancelEntities();
      for (const e of ["work_order", "bill", "invoice", "expense", "journal_entry", "payment", "bill_payment", "driver_settlement", "load"]) {
        expect(known).toContain(e);
      }
    });
  });

  // ACCT-F5637 — executeBillPayment used to call the voidBillPayment() WRAPPER, which opens its OWN
  // pool connection and immediately tries to SELECT ... FOR UPDATE the same accounting.bill_payments
  // row ctx.client's own SELECT ... FOR UPDATE above already holds, uncommitted -- an
  // application-level self-deadlock across two DB sessions (Postgres's own deadlock detector cannot
  // see it, since there is no DB-visible wait-for cycle). Fixed by calling voidBillPaymentInClientTx
  // directly on ctx.client, the same atomic pattern executeDriverSettlement already uses for its own
  // bill-payment/bill reversal calls below it in this same file.
  describe("executeBillPayment — ACCT-F5637 self-deadlock fix", () => {
    it("imports voidBillPaymentInClientTx (the client-taking variant), not the connection-opening voidBillPayment wrapper", () => {
      expect(source).toContain('import { voidBillPaymentInClientTx } from "../accounting/bills.service.js"');
    });

    it("executeBillPayment calls voidBillPaymentInClientTx on ctx.client, not a dynamic import of voidBillPayment", () => {
      const fnMatch = source.match(/const executeBillPayment: EntityExecutor = async \(ctx\) => \{[\s\S]*?\n\};/);
      expect(fnMatch, "executeBillPayment function body not found").toBeTruthy();
      const body = fnMatch![0];
      expect(body).toContain("await voidBillPaymentInClientTx(client,");
      expect(body).not.toContain('await import("../accounting/bills.service.js")');
      expect(body).not.toContain("voidBillPayment(operatingCompanyId, entityId, reason, userId)");
    });

    it("passes reversePostedGl: false — the GL reversal already happened via postVoidReversal above in the same executor", () => {
      const fnMatch = source.match(/const executeBillPayment: EntityExecutor = async \(ctx\) => \{[\s\S]*?\n\};/);
      const body = fnMatch![0];
      // postVoidReversal must run BEFORE voidBillPaymentInClientTx, and the latter must be told not
      // to reverse again -- otherwise a second, redundant reversing JE risks posting on top of the
      // first, since voidBillPaymentInClientTx's own hasPostedBatch check cannot distinguish an
      // original posting from the reversal postVoidReversal just inserted (same source type/id).
      const postVoidIdx = body.indexOf("await postVoidReversal(");
      const voidBillPaymentIdx = body.indexOf("await voidBillPaymentInClientTx(");
      expect(postVoidIdx).toBeGreaterThan(-1);
      expect(voidBillPaymentIdx).toBeGreaterThan(postVoidIdx);
      expect(body).toContain("reversePostedGl: false");
    });
  });
});
