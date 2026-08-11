export default {
  name: "verify:load-detail-resolves-names",
  run(ctx) {
    // --selftest FIRST. This guard's detector was demonstrably fallible: until 2026-08-10 its column
    // check ran file-wide, so the by-id query could lose BOTH resolved names and still pass on the
    // strength of the LIST query in the same file — reproduced on the real file, rc=0 while broken.
    // The selftest pins that exact shape (and the route-absent case), so a detector that regresses to
    // a vacuous pass fails the build instead of quietly certifying a broken payload.
    ctx.run("node", ["scripts/verify-load-detail-resolves-names.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-detail-resolves-names.mjs"]);
  },
};
