export default {
  name: "verify:dispatch-date-boxes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-date-boxes.mjs"]);
  },
};
