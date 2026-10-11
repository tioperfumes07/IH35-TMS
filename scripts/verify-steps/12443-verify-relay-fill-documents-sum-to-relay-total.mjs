export default {
  name: "verify:relay-fill-documents-sum-to-relay-total",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-fill-documents-sum-to-relay-total.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-fill-documents-sum-to-relay-total.mjs"]);
  },
};
