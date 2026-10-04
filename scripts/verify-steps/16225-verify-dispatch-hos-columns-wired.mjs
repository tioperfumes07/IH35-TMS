export default {
  name: "verify:dispatch-hos-columns-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-hos-columns-wired.mjs"]);
  },
};
