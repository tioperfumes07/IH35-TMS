// LINK-F5178 / LINK-F5171 — customer factoring assignment + batch history reverse surface
// (verify-step 3293 — CC-1 band, claimed in #6788).
export default {
  name: "customer-factoring-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-factoring-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-customer-factoring-reverse-section.mjs"]);
  },
};
