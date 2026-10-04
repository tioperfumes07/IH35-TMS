export default {
  name: "verify:fault-auto-wo-24h-dedup",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-auto-wo-24h-dedup.mjs"]);
  },
};
