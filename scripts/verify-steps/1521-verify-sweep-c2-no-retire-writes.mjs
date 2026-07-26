export default {
  name: "verify:sweep-c2-no-retire-writes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sweep-c2-no-retire-writes.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-sweep-c2-no-retire-writes.mjs"]);
  },
};
