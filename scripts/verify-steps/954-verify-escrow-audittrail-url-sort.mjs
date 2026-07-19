export default {
  name: "verify:escrow-audittrail-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-escrow-audittrail-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-escrow-audittrail-url-sort.mjs"]);
  },
};
