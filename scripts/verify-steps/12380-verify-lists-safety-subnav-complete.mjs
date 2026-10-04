export default {
  name: "verify:lists-safety-subnav-complete",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-safety-subnav-complete.mjs"]);
  },
};
