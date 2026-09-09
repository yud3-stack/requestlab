import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    requestlabProjectId?: string;
  }
}
