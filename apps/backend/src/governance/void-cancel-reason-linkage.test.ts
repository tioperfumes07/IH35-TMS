import { describe, expect, it } from "vitest";
import {
  buildClosedPeriodFlag,
  buildQboVoidMirror,
  reasonEntityMatches,
  validateReasonNote,
  VOID_QBO_MIRROR_FLAG_KEY,
} from "./void-cancel-reason-linkage.js";

describe("Task #24 — reason/note/QBO/closed-period linkage (pure)", () => {
  describe("validateReasonNote — mirrors the DB trigger's note-required rule", () => {
    it("requires a non-blank note when requires_note=true", () => {
      expect(validateReasonNote(true, null).ok).toBe(false);
      expect(validateReasonNote(true, "").ok).toBe(false);
      expect(validateReasonNote(true, "   ").ok).toBe(false);
      expect(validateReasonNote(true, "real note").ok).toBe(true);
    });
    it("does not require a note when requires_note=false", () => {
      expect(validateReasonNote(false, null).ok).toBe(true);
      expect(validateReasonNote(false, "").ok).toBe(true);
    });
    it("returns the note_required error code on failure", () => {
      const r = validateReasonNote(true, "");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("note_required");
    });
  });

  describe("reasonEntityMatches — mirrors the trigger's same-entity rule", () => {
    it("true only when the reason's entity equals the request's entity", () => {
      expect(reasonEntityMatches("a", "a")).toBe(true);
      expect(reasonEntityMatches("a", "b")).toBe(false);
    });
  });

  describe("buildQboVoidMirror — TMS→QBO void mirror is OFF (writes nothing)", () => {
    it("OFF: never writes to QBO, surfaces guidance", () => {
      const m = buildQboVoidMirror(false);
      expect(m.enabled).toBe(false);
      expect(m.wrote_to_qbo).toBe(false);
      expect(m.guidance).toMatch(/QuickBooks/i);
    });
    it("even when the flag is ON, this block writes NOTHING to QBO (hook not built yet)", () => {
      const m = buildQboVoidMirror(true);
      expect(m.wrote_to_qbo).toBe(false);
    });
    it("exposes the stable flag key", () => {
      expect(VOID_QBO_MIRROR_FLAG_KEY).toBe("VOID_QBO_MIRROR_ENABLED");
    });
  });

  describe("buildClosedPeriodFlag", () => {
    it("flags touches_closed_period only when the reversal crossed periods", () => {
      expect(buildClosedPeriodFlag(true).touches_closed_period).toBe(true);
      expect(buildClosedPeriodFlag(true).note).toMatch(/closed period/i);
      expect(buildClosedPeriodFlag(false).touches_closed_period).toBe(false);
      expect(buildClosedPeriodFlag(false).note).toBeNull();
    });
  });
});
