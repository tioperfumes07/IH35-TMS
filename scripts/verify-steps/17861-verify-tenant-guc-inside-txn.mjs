export default {
  name: "verify:tenant-guc-inside-txn",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tenant-guc-inside-txn.mjs"]);
  },
};
