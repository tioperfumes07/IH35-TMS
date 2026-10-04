export default {
  name: "verify:load-cancellation-reasons-create-description-null-400",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-cancellation-reasons-create-description-null-400.mjs"]);
  },
};
