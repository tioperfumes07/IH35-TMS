import { describe, expect, it } from "vitest";
import {
  isVoidCancelEntitySupported,
  knownVoidCancelEntities,
  resolveSurfaceVoidGate,
} from "./void-cancel-executors.js";

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
});
