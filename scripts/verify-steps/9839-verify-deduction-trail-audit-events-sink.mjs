export default {
  name: "verify:deduction-trail-audit-events-sink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deduction-trail-audit-events-sink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-deduction-trail-audit-events-sink.mjs"]);
  },
};
