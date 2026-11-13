export default {
  name: "verify:relay-bank-feed-current",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-bank-feed-current.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-bank-feed-current.mjs"]);
  },
};
