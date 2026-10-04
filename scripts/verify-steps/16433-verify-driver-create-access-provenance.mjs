export default {
  name: "verify:driver-create-access-provenance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-access-provenance.mjs"]);
  },
};
