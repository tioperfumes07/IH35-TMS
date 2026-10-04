export default {
  name: "verify:bulk-mark-factored-zero-rows-check",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bulk-mark-factored-zero-rows-check.mjs"]);
  },
};
