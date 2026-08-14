// LINK-F5180 / LINK-F5171 — factoring:home.recourse_pipeline + factoring:home.chargebacks_fees
// reverse (customer + load) surface (verify-step 3301 — CC-1 band, claimed in #6817).
export default {
  name: "factoring-recourse-chargebacks-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-recourse-chargebacks-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-factoring-recourse-chargebacks-reverse-section.mjs"]);
  },
};
