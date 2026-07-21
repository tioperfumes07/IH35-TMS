export default {
  name: "verify:no-retire-table-writes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-retire-table-writes.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-retire-table-writes.mjs"]);
  },
};
