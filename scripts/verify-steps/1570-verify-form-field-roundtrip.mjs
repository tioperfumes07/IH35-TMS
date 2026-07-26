// 1570-verify-form-field-roundtrip — C9 (DoD-B: no rendered field is dropped on save).
//
// A field is RENDERED on a form, the operator fills it in, presses save, and the value is silently
// discarded because it never reaches the submit payload. No error, no warning — the operator
// believes it is stored. This guard asserts the round-trip contract: every rendered form field
// reaches the wire, or is rendered inert (readOnly/disabled) and annotated C9-NOT-PERSISTED with
// the reason, so the UI stops lying about what it captured.
//
// Run against pre-fix origin/main this FAILS with 30 dropped fields across 10 surfaces: Book Load
// loses 5 equipment requirements + the driver pay rate + the factoring company; the accident
// drawer's Record Type and Service Type are hardcoded no-op comboboxes and its entire cost-line
// editor plus tax rate never leave the browser; Create Work Order drops the customer link and its
// tax rate; the quick-create vendor drawer drops city/state/zip/account #/terms/1099; and three
// more surfaces render a control the operator can fill and the payload never carries.
//
// The --selftest runs FIRST and proves each of the three detectors capable of failing: it plants a
// rendered-but-dropped useState field, a no-op change handler, an unsubmitted react-hook-form
// field, and one registered indirectly through a child section's toggle table — then proves the
// annotated/inert form of each is NOT failed. Eight classifier controls prove it does NOT claim a
// correctly wired field, a list-page filter outside a form surface, a value reaching the payload
// through object mutation, a hook-provided mutator, a busy flag with no value binding,
// commented-out JSX, a live change handler, or a submitted RHF field.
export default {
  name: "verify-form-field-roundtrip",
  async run(ctx) {
    if ((await ctx.run("node", ["scripts/verify-form-field-roundtrip.mjs", "--selftest"])) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-form-field-roundtrip.mjs"]);
  },
};
