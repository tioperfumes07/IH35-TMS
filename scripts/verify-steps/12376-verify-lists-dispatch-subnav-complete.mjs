export default {
  name: "verify:lists-dispatch-subnav-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-dispatch-subnav-complete.mjs"]);
  },
};
