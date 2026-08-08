const SCRIPT = "scripts/verify-guards-mask-comments.mjs";
export default {
  name: "verify:guards-mask-comments",
  run(ctx) {
    ctx.run("node", [SCRIPT, "--selftest"]);
    ctx.run("node", [SCRIPT]);
  },
};
