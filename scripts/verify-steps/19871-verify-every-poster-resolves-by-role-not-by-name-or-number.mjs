// ENG-34 / batch70 — wire orphan verify-every-poster-resolves-by-role-not-by-name-or-number.
// CI runs --selftest only: that path already proves each static rule + "the real tree is clean".
// The live role-map half REQUIRES_LIVE_DB (money-pr / manual); CI has no prod DATABASE_URL.
// Sibling static-half step 12385 covers the resolver file only; this wires the full guard script.
export default {
  name: "verify:verify-every-poster-resolves-by-role-not-by-name-or-number",
  run(ctx) {
    ctx.run("node", [
      "scripts/verify-every-poster-resolves-by-role-not-by-name-or-number.mjs",
      "--selftest",
    ]);
  },
};
