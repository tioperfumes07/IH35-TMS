export default {
  name: "verify:relay-deposits-land-in-usmca",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-deposits-land-in-usmca.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-deposits-land-in-usmca.mjs"]);
  },
};
