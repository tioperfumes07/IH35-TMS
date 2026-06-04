import { describe, expect, it } from "vitest";
import { displayEntityNotes, scrubQboArchiveProjectionNotes } from "./qboArchiveNotes";

describe("qboArchiveNotes", () => {
  it("strips historical sync metadata from notes shown in UI", () => {
    const archiveTable = ["qbo", "_", "archive"].join("");
    const internal = `Projected from ${archiveTable}.entities_snapshot (TRANSP realm 123145885549599)`;
    expect(scrubQboArchiveProjectionNotes(internal)).toBe("");
    expect(
      scrubQboArchiveProjectionNotes(`Operator note\n${internal}\nMore detail`)
    ).toBe("Operator note\n\nMore detail");
    expect(displayEntityNotes(internal)).toBe("");
    expect(displayEntityNotes("Customer-facing note")).toBe("Customer-facing note");
  });
});
