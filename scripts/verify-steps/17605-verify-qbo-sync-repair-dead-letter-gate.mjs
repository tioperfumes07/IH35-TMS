export default {
  name: "verify:qbo-sync-repair-dead-letter-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-repair-dead-letter-gate.mjs"]);
  },
};
