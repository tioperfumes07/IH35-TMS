export default {
  name: "verify:driver-bulk-write-company-predicate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bulk-write-company-predicate.mjs"]);
  },
};
