export default {
  name: "verify:telematics-shared-driver-reads",
  run(ctx) {
    ctx.run("node", ["scripts/verify-telematics-shared-driver-reads.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-telematics-shared-driver-reads.mjs"]);
  },
};
