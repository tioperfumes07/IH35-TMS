export default {
  name: "verify:driver-pwa-message-writes-shared-company",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pwa-message-writes-shared-company.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-pwa-message-writes-shared-company.mjs"]);
  },
};
