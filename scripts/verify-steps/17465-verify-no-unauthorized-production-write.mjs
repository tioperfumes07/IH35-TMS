export default {
  name: "verify:no-unauthorized-production-write",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-unauthorized-production-write.mjs"]);
  },
};
