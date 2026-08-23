export default {
  name: "verify:driver-advances-shared-company-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-advances-shared-company-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-advances-shared-company-reverse.mjs"]);
  },
};
