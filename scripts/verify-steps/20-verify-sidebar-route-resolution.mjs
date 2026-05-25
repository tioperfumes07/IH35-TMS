export default {
  name: "verify-sidebar-route-resolution",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:sidebar-route-resolution"]) !== 0) {
      process.exit(1);
    }
  },
};
