export default {
  name: "verify:driver-hos-detail-ambiguous-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hos-detail-ambiguous-id.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-hos-detail-ambiguous-id.mjs"]);
  },
};
