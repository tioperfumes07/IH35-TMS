export default {
  name: "verify:a2-audit-emit-dispatch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-a2-audit-emit-dispatch.mjs"]);
  },
};
