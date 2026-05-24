export default {
  name: "build-backend-emit",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "build:backend"]) !== 0) {
      process.exit(1);
    }
  },
};
