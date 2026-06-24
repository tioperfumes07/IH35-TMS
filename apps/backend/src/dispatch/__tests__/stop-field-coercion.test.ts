import { describe, expect, it } from "vitest";
import { stopBooleanish, stopIntish, stopDatetimeish } from "../loads.routes.js";

// CI GUARD (2026-06-24) — W-1 booking blocker. Book Load §C relocates stop fields to hidden
// react-hook-form <input>s, which submit their value as a STRING ("" when empty). A bare
// z.boolean()/z.number()/z.string().datetime() rejected the wire string -> the booking POST 400'd on
// stops[].is_tarp_stop = "". These tolerant wrappers coerce the wire string to the real type. This test
// locks the exact behavior — in particular that "false" maps to false (NOT true, as z.coerce.boolean would).
describe("Book Load stop-field coercion (W-1 is_tarp_stop 400 guard)", () => {
  describe("stopBooleanish", () => {
    it('accepts "" and yields undefined (was the 400)', () => {
      expect(stopBooleanish.parse("")).toBeUndefined();
    });
    it("maps the string \"true\" -> true and \"false\" -> false (no inversion)", () => {
      expect(stopBooleanish.parse("true")).toBe(true);
      expect(stopBooleanish.parse("false")).toBe(false); // z.coerce.boolean() would WRONGLY give true
    });
    it("passes real booleans through", () => {
      expect(stopBooleanish.parse(true)).toBe(true);
      expect(stopBooleanish.parse(false)).toBe(false);
    });
    it("treats null/undefined as undefined", () => {
      expect(stopBooleanish.parse(null)).toBeUndefined();
      expect(stopBooleanish.parse(undefined)).toBeUndefined();
    });
  });

  describe("stopIntish", () => {
    it('accepts "" -> undefined', () => {
      expect(stopIntish.parse("")).toBeUndefined();
    });
    it('coerces "3" -> 3 and passes numbers through', () => {
      expect(stopIntish.parse("3")).toBe(3);
      expect(stopIntish.parse(5)).toBe(5);
    });
    it("rejects negative", () => {
      expect(() => stopIntish.parse("-1")).toThrow();
    });
  });

  describe("stopDatetimeish", () => {
    it('accepts "" -> undefined (empty hidden appointment input)', () => {
      expect(stopDatetimeish.parse("")).toBeUndefined();
    });
    it("passes a valid offset datetime", () => {
      expect(stopDatetimeish.parse("2026-06-24T12:00:00-05:00")).toBe("2026-06-24T12:00:00-05:00");
    });
    it("still rejects a non-empty invalid datetime", () => {
      expect(() => stopDatetimeish.parse("not-a-date")).toThrow();
    });
  });
});
