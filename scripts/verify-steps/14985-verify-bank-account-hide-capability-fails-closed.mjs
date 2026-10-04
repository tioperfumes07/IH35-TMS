export default {
  name: "verify:bank-account-hide-capability-fails-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-hide-capability-fails-closed.mjs"]);
  },
};
