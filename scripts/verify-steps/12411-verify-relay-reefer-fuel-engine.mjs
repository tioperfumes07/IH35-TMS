export default {
  name: "verify:relay-reefer-fuel-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-reefer-fuel-engine.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-reefer-fuel-engine.mjs"]);
  },
};
