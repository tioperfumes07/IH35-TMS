export default {
  name: "verify:insurance-pageheader-usage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-pageheader-usage.mjs"]);
    ctx.run("node", ["scripts/verify-insurance-policy-action-lifecycle.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-policy-action-lifecycle.mjs"]);
  },
};
