export default {
  name: "verify:relay-webhook-stores-under-usmca",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-webhook-stores-under-usmca.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-webhook-stores-under-usmca.mjs"]);
  },
};
