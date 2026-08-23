export default {
  name: "verify:form425c-history-month-utc",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form425c-history-month-utc.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-form425c-history-month-utc.mjs"]);
  },
};
