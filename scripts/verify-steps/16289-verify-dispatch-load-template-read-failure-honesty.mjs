export default {
  name: "verify:dispatch-load-template-read-failure-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-load-template-read-failure-honesty.mjs"]);
  },
};
