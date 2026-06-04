import { describe, expect, it } from "vitest";
import { displayEntityNotes, scrubQboArchiveProjectionNotes } from "./qboArchiveNotes";

describe("qboArchiveNotes", () => {
  it("strips qbo_archive projection metadata from notes shown in UI", () => {
    const internal =
      "Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)";
    expect(scrubQboArchiveProjectionNotes(internal)).toBe("");
    expect(
      scrubQboArchiveProjectionNotes(`Operator note\n${internal}\nMore detail`)
    ).toBe("Operator note\n\nMore detail");
    expect(displayEntityNotes(internal)).toBe("");
    expect(displayEntityNotes("Customer-facing note")).toBe("Customer-facing note");
  });
});
