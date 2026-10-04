export default {
  name: "verify:dispatched-load-has-stop-stamps",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatched-load-has-stop-stamps.mjs"]);
  },
};
