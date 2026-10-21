// LEAD 22:25Z #6 / 443.206R #7 — wires the #27085 guard (D8 report date, D9 report scope, D10 picker scope): selftest
// plants, then the static rules + the live read-only proof (fails closed without a DB — verify-no-silent-db-skip).
export default {
  name: "verify:load-report-and-picker-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-report-and-picker-scope.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-load-report-and-picker-scope.mjs"]);
  },
};
