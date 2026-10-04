export default {
  name: "verify:create-driver-control-label-association",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-driver-control-label-association.mjs"]);
  },
};
