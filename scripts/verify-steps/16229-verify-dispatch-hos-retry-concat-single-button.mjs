export default {
  name: "verify:dispatch-hos-retry-concat-single-button",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-hos-retry-concat-single-button.mjs"]);
  },
};
