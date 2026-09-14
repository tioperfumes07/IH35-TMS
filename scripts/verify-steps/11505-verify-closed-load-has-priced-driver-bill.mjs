export default {
  name: "verify:closed-load-has-priced-driver-bill",
  run(ctx) {
    ctx.run("node", ["scripts/verify-closed-load-has-priced-driver-bill.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-closed-load-has-priced-driver-bill.mjs"]);
  },
};
