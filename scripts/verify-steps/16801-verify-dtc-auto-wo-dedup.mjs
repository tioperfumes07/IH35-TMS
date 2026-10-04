export default {
  name: "verify:dtc-auto-wo-dedup",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dtc-auto-wo-dedup.mjs"]);
  },
};
