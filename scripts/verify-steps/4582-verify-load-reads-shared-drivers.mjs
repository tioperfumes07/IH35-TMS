export default {
  name: "verify:load-reads-shared-drivers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-reads-shared-drivers.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-load-reads-shared-drivers.mjs"]);
  },
};
