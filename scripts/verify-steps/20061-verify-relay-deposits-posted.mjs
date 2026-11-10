export default {
  name: "verify:verify-relay-deposits-posted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-deposits-posted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-deposits-posted.mjs"]);
  },
};
