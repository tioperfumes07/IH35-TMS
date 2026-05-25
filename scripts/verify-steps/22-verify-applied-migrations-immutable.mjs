export default {
  name: "verify-applied-migrations-immutable",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:applied-migrations-immutable"]) !== 0) {
      process.exit(1);
    }
  },
};
