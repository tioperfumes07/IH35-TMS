export default {
  name: "verify:eld-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-eld-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-eld-tabs-url-sync.mjs"]);
  },
};
