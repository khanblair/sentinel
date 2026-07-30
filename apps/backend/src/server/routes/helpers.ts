import type { FastifyReply } from "fastify";
import { isHttpError } from "../../errors.js";

/** Maps domain errors (NotFoundError/ValidationError) to their HTTP status; anything
 * else is rethrown so Fastify's global error handler logs it and returns a 500. */
export function sendErrorResponse(reply: FastifyReply, error: unknown): FastifyReply {
  if (isHttpError(error)) {
    return reply.status(error.statusCode).send({ status: "error", message: error.message });
  }
  throw error;
}
