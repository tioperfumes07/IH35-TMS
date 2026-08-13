// 1551-verify-picker-law-no-raw-uuid — C1 (PICKER LAW: no raw-UUID input on a form).
//
// A plain <input> into which an operator is expected to type or paste a database UUID
// ("Equipment UUID", "Subject driver UUID (optional)", "UUID of load", "Work order UUID") is an
// automatic FAIL. No operator knows a UUID, so the field is left blank — dropping the FK every
// downstream linkage depends on — or pasted unvalidated. QuickBooks, NetSuite, McLeod and Alvys
// have no such control anywhere: an entity reference is ALWAYS a searchable picker over the
// canonical roster.
//
// Run against pre-fix origin/main this FAILS with 20 problems: 18 live raw-UUID inputs across
// dispatch, safety, accounting, maintenance, customers and reports, plus the two missing
// primitives (components/parity/EntityPicker.tsx and its canonical read/write registry).
//
// Beyond the sweep the guard pins four contracts, so C1 cannot be "solved" cosmetically:
//   PRIMITIVE  — EntityPicker composes the EXISTING shared Combobox, puts inline "+ Create" as the
//                dropdown's FIRST ROW (allowAddNew, never an external button), scopes the roster by
//                operatingCompanyId, and opens its create in the C7 480px drawer — not a 2nd shell.
//   REGISTRY   — every kind declares readTable === writeTable, never a RETIRE table, never a QBO
//                mirror, always entity-scoped. A picker that writes elsewhere loses the row on reload.
//   ADDITIVE   — the config-driven catalog mechanism from PR #3550 (ReferenceSelect dispatching on
//                config.backend + catalogPickerRegistry) stays intact; C1 extends it, never forks it.
//   EXEMPTIONS — the allowlist is a RATCHET that may only shrink. Every entry must still match a
//                live raw-uuid input (a stale entry FAILS, so an exemption cannot rot into a
//                permanent hole), must carry a substantive reason, and must earn its category:
//                "admin-audit-forensic-id" only on an admin/audit path, "blocked-needs-backend"
//                only with a named blocker, "archived-superseded" only with a real @archived marker
//                and a live successor file that exists.
//
// The --selftest runs FIRST and is proven CAPABLE OF FAILING: it plants 27 defects (a surviving
// raw-uuid input on each detection arm, tomorrow's brand-new regression, a comment-only "fix", a
// rotting exemption, a deleted/hand-rolled/unscoped/undrawered primitive, retired vocabulary, a
// read/write-divergent kind, a RETIRE target, a QBO-mirror target, a forked mechanism, a
// mislabelled category, a reasonless exemption, a blockerless blocker, a duplicate, a list grown
// past its ceiling, an un-archived "archived" file, a missing successor) and asserts every one is
// caught — plus six classifier controls proving the corrected shape is NOT flagged: a <select>, a
// <Combobox allowAddNew>, a migrated <EntityPicker> call site, a commented-out example, a checkbox,
// and a template-literal className.
export default {
  name: "verify-picker-law-no-raw-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-picker-law-no-raw-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-picker-law-no-raw-uuid.mjs"]);
    await ctx.run("node", ["scripts/verify-entity-picker-company-switch-scope.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-entity-picker-company-switch-scope.mjs"]);
  },
};
