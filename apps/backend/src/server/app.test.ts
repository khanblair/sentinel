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
});
