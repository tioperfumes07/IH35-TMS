export default {
  name: "verify:verify-relay-driver-links-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-driver-links-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-driver-links-wired.mjs"]);
  },
};
