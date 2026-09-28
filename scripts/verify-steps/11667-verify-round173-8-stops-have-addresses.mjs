export default {
  name: "verify:round173-8-stops-have-addresses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-round173-8-stops-have-addresses.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-round173-8-stops-have-addresses.mjs"]);
  },
};
