// LINK-F5184 / LINK-F5171 — factoring:accounting.list + factoring:banking.entry reverse (load side)
// (verify-step 3321 — CC-1 band, claimed in commit CLAIM-RESERVE verify-step 3321).
export default {
  name: "load-factoring-advance-banking-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-factoring-advance-banking-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-load-factoring-advance-banking-reverse-section.mjs"]);
  },
};
