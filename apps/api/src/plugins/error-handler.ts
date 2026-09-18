import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "@devicefarm/shared";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
      return;
    }
    if (err instanceof ZodError) {
      reply.code(400).send({ error: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() });
      return;
    }
    if ((err as { statusCode?: number }).statusCode) {
      reply.code((err as { statusCode: number }).statusCode).send({ error: "REQUEST_ERROR", message: err.message });
      return;
    }
    req.log.error(err);
    reply.code(500).send({ error: "INTERNAL_ERROR", message: "Something went wrong" });
  });
}
