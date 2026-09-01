export default {
  name: "verify-driver-hub-overview-request-surfaces",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-driver-hub-overview-request-surfaces.mjs"]);
  },
};
