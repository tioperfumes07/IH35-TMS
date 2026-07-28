// Rule 17 — ACCT-R-04 / ACCT-F15 deploy smoke closure (even ≥1704).
export default {
  name: "verify:acct-r04-deploy-smoke-closure",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-r04-deploy-smoke-closure.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-acct-r04-deploy-smoke-closure.mjs"]);
  },
};
