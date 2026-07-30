import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { StepVerdict } from "@sentinel/shared";
import { buildReportRows, type ReportStepLog, type ReportTestCase } from "../../reports/buildReportRows.js";
import { formatCsv } from "../../reports/formatCsv.js";
import { formatMarkdown } from "../../reports/formatMarkdown.js";
import { NotFoundError, ValidationError } from "../../errors.js";
import { sendErrorResponse } from "./helpers.js";

const querySchema = z.object({ format: z.enum(["markdown", "csv"]).default("markdown") });

/** Exports a finished Run as the QA-template report (design §5.11): Markdown or
 * CSV, one row per Test Case. XLSX export is deferred — not built in this pass. */
export function registerReportRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/api/runs/:id/report",
    async (request, reply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ status: "error", message: parsed.error.message });
      }

      try {
        const run = await prisma.run.findUnique({ where: { id: request.params.id } });
        if (!run) {
          throw new NotFoundError(`Run ${request.params.id} not found`);
        }
        if (!run.suiteId) {
          throw new ValidationError("Ad-hoc runs (no Suite) have no report yet — reporting covers Suite runs only");
        }

        const testCases = await prisma.testCase.findMany({ where: { suiteId: run.suiteId } });
        const stepLogs = await prisma.stepLog.findMany({ where: { runId: run.id } });

        const stepLogsByTestCaseId = new Map<string, ReportStepLog[]>();
        for (const log of stepLogs) {
          if (!log.testCaseId) {
            continue;
          }
          const list = stepLogsByTestCaseId.get(log.testCaseId) ?? [];
          list.push({
            stepIndex: log.stepIndex,
            verdict: log.verdict as StepVerdict,
            observation: log.observation,
            confidenceReason: log.confidenceReason,
          });
          stepLogsByTestCaseId.set(log.testCaseId, list);
        }

        const reportTestCases: ReportTestCase[] = testCases.map((tc) => ({
          id: tc.id,
          module: tc.module,
          subModule: tc.subModule,
          title: tc.title,
          priority: tc.priority,
          urlPath: tc.urlPath,
          precondition: tc.precondition,
          steps: tc.steps,
          expectedResult: tc.expectedResult,
        }));

        const rows = buildReportRows(reportTestCases, stepLogsByTestCaseId);

        if (parsed.data.format === "csv") {
          void reply.header("Content-Type", "text/csv; charset=utf-8");
          return reply.send(formatCsv(rows));
        }
        void reply.header("Content-Type", "text/markdown; charset=utf-8");
        return reply.send(formatMarkdown(rows));
      } catch (error) {
        return sendErrorResponse(reply, error);
      }
    },
  );
}
