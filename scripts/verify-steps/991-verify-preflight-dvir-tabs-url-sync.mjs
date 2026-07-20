export default {
  name: "verify:preflight-dvir-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-preflight-dvir-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-preflight-dvir-tabs-url-sync.mjs"]);
  },
};
