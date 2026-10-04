export default {
  name: "verify:dispatch-driver-label-survives-archive",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-driver-label-survives-archive.mjs"]);
  },
};
