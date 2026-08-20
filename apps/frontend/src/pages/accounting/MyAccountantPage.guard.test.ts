import { describe, expect, it } from "vitest";
import pageSource from "./MyAccountantPage.tsx?raw";
import apiSource from "../../api/my-accountant.ts?raw";

const src = `${pageSource}\n${apiSource}`;
// Comments stripped for the journal-entry substring check only (2026-08-20, CC-3): the page
// added a real, read-only EntityLink kind="journal_entry" drill-through to the closing JE (view
// only — LAW OF THE LAND total-connectivity, not a write) plus a code comment mentioning
// journal_entries while explaining a backend join, both false-triggering the bare
// /journal[-_]?entr/i substring match. Test 1 above already independently proves no
// POST/PUT/PATCH/DELETE exists anywhere in this source; this check narrows to the EntityLink
// prop kind and comment prose so it still catches an actual journal-entry write/mutation
// reference while allowing the honest read-only drill.
const srcForJournalCheck = src
  .replace(/\/\/.*$/gm, "")
  .replace(/kind="journal_entry"/g, "")
  // closing_journal_entry_id: a read-only periods-API response field (the closing period's
  // already-linked JE, for display/drill only) — reviewed exact allowlist, not a heuristic.
  .replace(/closing_journal_entry_id/g, "");

describe("MyAccountantPage write-guard (read-only accountant workspace)", () => {
  it("issues no mutating HTTP methods (no POST/PUT/PATCH/DELETE)", () => {
    expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(src).not.toMatch(/apiRequestFormData\s*\(/);
  });

  it("never calls period-close, reopen, or any close/posting write endpoint", () => {
    expect(src).not.toMatch(/\/periods\/[^"'`]*\/(close|reopen)/);
    expect(srcForJournalCheck).not.toMatch(/journal[-_]?entr/i);
    expect(src).not.toMatch(/posting-batch|\/post\b|\/void\b/);
  });

  it("does not wire any permission/invite grant write", () => {
    expect(src).not.toMatch(/grantAccess|inviteAccountant\s*\(/);
    expect(src).not.toMatch(/\/(invite|permissions?|access-grants?)[^"'`]*["'`]\s*,\s*\{[^}]*method/i);
  });

  it("only reads periods and builds read-only export download URLs", () => {
    expect(src).toMatch(/\/api\/v1\/accounting\/periods/);
    expect(src).toMatch(/\/export\/\$\{format\}|\/export\/(pdf|xlsx)/);
  });
});
