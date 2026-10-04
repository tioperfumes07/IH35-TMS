export default {
  name: "verify:dispatch-missing-is-em-dash",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-missing-is-em-dash.mjs"]);
  },
};
