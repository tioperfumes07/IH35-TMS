// 1552-verify-no-native-datetime-input — C3 (DATE: replace native date inputs with the shared picker).
//
// Ratchets the two date defect shapes the existing date guards structurally cannot see:
//   (1) `<input type="datetime-local">` — verify-step 107 (verify-no-raw-date-input) covers
//       type="date" and passes clean, but explicitly EXEMPTS datetime-local because no shared
//       time-of-day picker existed. C3 builds components/forms/DateTimePicker.tsx, so the
//       exemption is retired. 107 is left fully intact — nothing is deleted from it.
//   (2) a bare date-typed field in a JSX text node, e.g. `<span>{row.transaction_date}</span>` —
//       verify-no-iso-date-display catches an ISO placeholder, a `{x.slice(0,10)}` node and a
//       hardcoded `>2026-07-03<` literal, but not this, the most common ISO leak shape.
//
// Run against pre-fix origin/main this FAILS with 33 problems: 20 native datetime-local inputs
// across 14 files, and 13 bare ISO date text nodes across 11 files.
//
// The --selftest runs FIRST and plants 13 defects (a literal / single-quoted / multiline /
// dynamic-ternary / register-spread / brace-containing native datetime input, and seven bare ISO
// date text nodes) then proves 16 corrected-and-control shapes are NOT flagged (both shared
// pickers, formatDateUS / formatDateTimeUS / formatInCompanyTimeZone wrappers, a validation-error
// map, server-preformatted _ct fields, type="date" which belongs to 107, a type={type}
// passthrough, and non-date columns). Two meta-assertions prove each detector is not a constant,
// so the selftest is structurally CAPABLE of failing.
export default {
  name: "verify-no-native-datetime-input",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-native-datetime-input.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-native-datetime-input.mjs"]);
  },
};
