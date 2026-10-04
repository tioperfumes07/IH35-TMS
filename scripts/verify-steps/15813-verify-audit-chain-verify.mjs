export default {
  name: "verify:audit-chain-verify",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-chain-verify.mjs"]);
  },
};
