import Fastify from "fastify";
import type { ServiceHealth } from "@requestlab/shared";

const port = Number(process.env.API_PORT ?? 3001);
const app = Fastify({ logger: true });

app.get<{ Reply: ServiceHealth }>("/health", async () => {
  return { status: "ok", service: "api" };
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  return reply.status(500).send({ status: "error", service: "api" });
});

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
