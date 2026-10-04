export default {
  name: "verify:driver-app-access-provenance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-app-access-provenance.mjs"]);
  },
};
