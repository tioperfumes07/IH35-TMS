export default {
  name: "verify:cbp-wait-times-cache-lucia-bypass",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cbp-wait-times-cache-lucia-bypass.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cbp-wait-times-cache-lucia-bypass.mjs"]);
  },
};
