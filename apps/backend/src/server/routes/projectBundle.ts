import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { exportProjectBundle, importProjectBundle } from "../../projectBundle/projectBundle.js";
import { sendErrorResponse } from "./helpers.js";

/** Project export/import (backup + transfer between machines). See
 * projectBundle.ts for exactly what is and isn't included in a bundle. */
export function registerProjectBundleRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get<{ Params: { id: string } }>("/api/projects/:id/export", async (request, reply) => {
    try {
      const bundle = await exportProjectBundle(prisma, request.params.id);
      const safeName = bundle.project.name.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "project";
      void reply.header("Content-Type", "application/json");
      void reply.header("Content-Disposition", `attachment; filename="${safeName}-sentinel-export.json"`);
      return reply.send(bundle);
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });

  app.post("/api/projects/import", async (request, reply) => {
    try {
      const summary = await importProjectBundle(prisma, request.body);
      return reply.status(201).send(summary);
    } catch (error) {
      return sendErrorResponse(reply, error);
    }
  });
}
