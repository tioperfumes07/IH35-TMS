export default {
  name: "verify:verify-relay-fill-records-idempotent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-fill-records-idempotent.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-fill-records-idempotent.mjs"]);
  },
};
