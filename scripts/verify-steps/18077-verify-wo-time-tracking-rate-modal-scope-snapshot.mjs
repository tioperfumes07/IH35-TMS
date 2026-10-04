export default {
  name: "verify:wo-time-tracking-rate-modal-scope-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-time-tracking-rate-modal-scope-snapshot.mjs"]);
  },
};
