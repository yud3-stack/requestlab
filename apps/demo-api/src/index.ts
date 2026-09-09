import Fastify from "fastify";
import type { ServiceHealth } from "@requestlab/shared";

const port = Number(process.env.DEMO_API_PORT ?? 3002);
const app = Fastify({ logger: true });

app.get<{ Reply: ServiceHealth }>("/health", async () => {
  return { status: "ok", service: "demo-api" };
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  return reply.status(500).send({ status: "error", service: "demo-api" });
});

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
