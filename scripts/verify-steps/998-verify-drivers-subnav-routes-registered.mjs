export default {
  name: "verify:drivers-subnav-routes-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-subnav-routes-registered.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-drivers-subnav-routes-registered.mjs"]);
  },
};
