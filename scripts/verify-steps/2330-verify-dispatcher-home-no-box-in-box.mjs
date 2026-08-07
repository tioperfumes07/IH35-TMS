export default {
  name: "dispatcher-home-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-dispatcher-home-no-box-in-box.mjs"]);
  },
};
