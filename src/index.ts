import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/api/v1/_healthcheck", async () => {
  return { status: "ok" };
});

const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";

app
  .listen({ port, host })
  .then(() => {
    app.log.info({ port, host }, "Server started");
  })
  .catch((err) => {
    app.log.error(err, "Server failed to start");
    process.exit(1);
  });
