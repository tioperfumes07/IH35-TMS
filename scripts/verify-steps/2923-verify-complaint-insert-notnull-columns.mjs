export default {
  name: "verify:complaint-insert-notnull-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-complaint-insert-notnull-columns.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-complaint-insert-notnull-columns.mjs"]);
  },
};
