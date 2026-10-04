export default {
  name: "verify:load-reassign-selected-driver-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-reassign-selected-driver-label.mjs"]);
  },
};
