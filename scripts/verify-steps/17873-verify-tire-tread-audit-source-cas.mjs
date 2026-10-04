export default {
  name: "verify:tire-tread-audit-source-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tire-tread-audit-source-cas.mjs"]);
  },
};
