// CLS-REVERSE-LINKAGE-MISSING — hub reverse section mounts (verify-step 2348 · Cursor EVEN band).
export default {
  name: "reverse-linkage-hub-mounts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reverse-linkage-hub-mounts.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-reverse-linkage-hub-mounts.mjs"]);
  },
};
