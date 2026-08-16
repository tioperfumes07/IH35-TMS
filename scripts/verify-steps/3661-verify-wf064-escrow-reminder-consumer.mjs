export default {
  name: "verify:wf064-escrow-reminder-consumer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wf064-escrow-reminder-consumer.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wf064-escrow-reminder-consumer.mjs"]);
  },
};
