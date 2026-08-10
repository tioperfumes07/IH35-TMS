export default {
  name: "2972-verify-setl-paid-lifecycle",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-setl-paid-lifecycle.mjs"]);
  },
};
