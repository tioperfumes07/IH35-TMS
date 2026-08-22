export default {
  name: "verify:audit-append-event-source-not-uuid-cast",
  run(ctx) {
    ctx.run("node", ["scripts/verify-audit-append-event-source-not-uuid-cast.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-audit-append-event-source-not-uuid-cast.mjs"]);
  },
};

