export default {
  name: "verify:audit-events-event-class-trgm-index",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-events-event-class-trgm-index.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-events-event-class-trgm-index.mjs"]);
  },
};
