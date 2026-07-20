export default {
  name: "verify-customers-vendors-total-count-is-server",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-vendors-total-count-is-server.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-vendors-total-count-is-server.mjs"]);
  },
};
