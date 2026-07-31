import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetDb, seedAssistant } from "../test/testDb.js";
import { WsPromptBroker } from "../ws/promptBroker.js";
import { buildApp } from "./app.js";

describe("HTTP API", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(() => {
    prisma = createTestPrismaClient();
    app = buildApp({
      prisma,
      encryptionKey: randomBytes(32),
      broadcast: () => {},
      promptBroker: new WsPromptBroker(() => {}),
      logger: false,
    });
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /health reports a connected database", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: "connected" });
  });

  it("rejects an empty project name with 400, not a 500", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().status).toBe("error");
  });

  it("returns 404 for a project that doesn't exist", async () => {
    const response = await app.inject({ method: "GET", url: "/api/projects/does-not-exist" });
    expect(response.statusCode).toBe(404);
  });

  it("supports the full create -> read -> update -> delete flow", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "SoundWave" },
    });
    expect(create.statusCode).toBe(201);
    const project = create.json();

    const read = await app.inject({ method: "GET", url: `/api/projects/${project.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().name).toBe("SoundWave");

    const update = await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}`,
      payload: { description: "audio streaming app" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().description).toBe("audio streaming app");

    const del = await app.inject({ method: "DELETE", url: `/api/projects/${project.id}` });
    expect(del.statusCode).toBe(204);

    const readAfterDelete = await app.inject({ method: "GET", url: `/api/projects/${project.id}` });
    expect(readAfterDelete.statusCode).toBe(404);
  });

  it("creating a suite under a nonexistent project returns 404, not 500", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/does-not-exist/suites",
      payload: { name: "Some suite" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("creating a provider config never leaks the raw API key in the response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      payload: { provider: "claude", apiKey: "sk-super-secret" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.payload).not.toContain("sk-super-secret");
  });

  it("testing a provider config that doesn't exist returns 404, not a 500 or a network call", async () => {
    const response = await app.inject({ method: "POST", url: "/api/provider-configs/does-not-exist/test" });
    expect(response.statusCode).toBe(404);
  });

  it("triggering a run rejects an invalid mode with 400, not a 500", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/suites/does-not-exist/run",
      payload: {
        assistantId: "a",
        mode: "not-a-real-mode",
        providerConfigId: "p",
        model: "m",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("triggering a run for an unknown provider config returns 404, not a 500", async () => {
    const assistant = await seedAssistant(prisma);
    const response = await app.inject({
      method: "POST",
      url: "/api/suites/does-not-exist/run",
      payload: {
        assistantId: assistant.id,
        mode: "full_auto",
        providerConfigId: "does-not-exist",
        model: "claude-sonnet",
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("triggering a run accepts and responds 202 once inputs resolve, without waiting for the run", async () => {
    const assistant = await seedAssistant(prisma);
    const providerConfig = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      payload: { provider: "claude", apiKey: "sk-test-key" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/suites/does-not-exist/run",
      payload: {
        assistantId: assistant.id,
        mode: "full_auto",
        providerConfigId: providerConfig.json().id,
        model: "claude-sonnet",
      },
    });

    // The route responds as soon as the provider config resolves — it never awaits
    // runSuite itself (see registerRunRoutes), so a nonexistent suite id surfaces
    // later as a logged error, not as this response's status.
    expect(response.statusCode).toBe(202);
    expect(response.json().runId).toBeTruthy();
  });

  it("GET /api/assistants lists the seeded built-ins", async () => {
    const response = await app.inject({ method: "GET", url: "/api/assistants" });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it("analytics endpoints return empty results for a suite with no runs, not an error", async () => {
    const project = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "P" } });
    const suite = await app.inject({
      method: "POST",
      url: `/api/projects/${project.json().id}/suites`,
      payload: { name: "S" },
    });
    const suiteId = suite.json().id;

    const trend = await app.inject({ method: "GET", url: `/api/suites/${suiteId}/analytics/trend` });
    expect(trend.statusCode).toBe(200);
    expect(trend.json()).toEqual([]);

    const flaky = await app.inject({ method: "GET", url: `/api/suites/${suiteId}/analytics/flaky-cases` });
    expect(flaky.statusCode).toBe(200);
    expect(flaky.json()).toEqual([]);

    const heatmap = await app.inject({
      method: "GET",
      url: `/api/projects/${project.json().id}/analytics/heatmap`,
    });
    expect(heatmap.statusCode).toBe(200);
    expect(heatmap.json()).toEqual([]);
  });

  it("GET /api/runs/:id/report 404s for a run that doesn't exist", async () => {
    const response = await app.inject({ method: "GET", url: "/api/runs/does-not-exist/report" });
    expect(response.statusCode).toBe(404);
  });

  it("GET /api/runs/:id/report returns a markdown table by default, CSV on request", async () => {
    const assistant = await seedAssistant(prisma);
    const project = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "P" } });
    const suite = await app.inject({
      method: "POST",
      url: `/api/projects/${project.json().id}/suites`,
      payload: { name: "S" },
    });
    const suiteId = suite.json().id;
    await app.inject({
      method: "POST",
      url: `/api/suites/${suiteId}/test-cases`,
      payload: {
        module: "Checkout",
        title: "Case",
        priority: "P1",
        urlPath: "/cart",
        steps: "1. x",
        expectedResult: "y",
      },
    });
    const run = await prisma.run.create({ data: { suiteId, assistantId: assistant.id, status: "passed" } });

    const markdown = await app.inject({ method: "GET", url: `/api/runs/${run.id}/report` });
    expect(markdown.statusCode).toBe(200);
    expect(markdown.headers["content-type"]).toContain("text/markdown");
    expect(markdown.body).toContain("| Test ID |");

    const csv = await app.inject({ method: "GET", url: `/api/runs/${run.id}/report?format=csv` });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("Test ID,Module");
  });

  it("test-case CSV import: creates good rows and reports bad ones by line, without aborting the batch", async () => {
    const project = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "P" } });
    const suite = await app.inject({
      method: "POST",
      url: `/api/projects/${project.json().id}/suites`,
      payload: { name: "S" },
    });
    const suiteId = suite.json().id;

    const csv = [
      "module,title,priority,urlPath,steps,expectedResult",
      "Checkout,Apply discount,P1,/cart,1. add item,Discount applied",
      "Checkout,,P1,/cart,1. x,y", // missing required title
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: `/api/suites/${suiteId}/test-cases/import`,
      payload: { csv },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.imported).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].line).toBe(3);

    const list = await app.inject({ method: "GET", url: `/api/suites/${suiteId}/test-cases` });
    expect(list.json()).toHaveLength(1);
  });

  it("test-case CSV import returns 400 with a clear message when required headers are missing", async () => {
    const project = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "P" } });
    const suite = await app.inject({
      method: "POST",
      url: `/api/projects/${project.json().id}/suites`,
      payload: { name: "S" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/suites/${suite.json().id}/test-cases/import`,
      payload: { csv: "module,title\nA,B" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("priority");
  });

  it("scheduled-jobs: create, list, and delete round-trip through the API", async () => {
    const assistant = await seedAssistant(prisma);
    const providerConfig = await app.inject({
      method: "POST",
      url: "/api/provider-configs",
      payload: { provider: "claude", apiKey: "sk-test-key" },
    });
    const project = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "P" } });
    const suite = await app.inject({
      method: "POST",
      url: `/api/projects/${project.json().id}/suites`,
      payload: { name: "S" },
    });
    const suiteId = suite.json().id;

    const create = await app.inject({
      method: "POST",
      url: `/api/suites/${suiteId}/scheduled-jobs`,
      payload: {
        scheduleType: "interval",
        scheduleExpression: "60",
        assistantId: assistant.id,
        providerConfigId: providerConfig.json().id,
        model: "claude-sonnet",
      },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({ method: "GET", url: `/api/suites/${suiteId}/scheduled-jobs` });
    expect(list.json()).toHaveLength(1);

    const del = await app.inject({ method: "DELETE", url: `/api/scheduled-jobs/${create.json().id}` });
    expect(del.statusCode).toBe(204);
  });
});
