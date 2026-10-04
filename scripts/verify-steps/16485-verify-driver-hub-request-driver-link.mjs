export default {
  name: "verify:driver-hub-request-driver-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-hub-request-driver-link.mjs"]);
  },
};
