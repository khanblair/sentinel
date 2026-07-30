import type { z } from "zod";
import type { Provider } from "@sentinel/shared";
import type {
  GenerateObjectRequest,
  GenerateObjectResult,
  GenerateTextRequest,
  GenerateTextResult,
  ProviderAdapter,
} from "./types.js";

type ScriptedResponse =
  | { kind: "text"; result: GenerateTextResult }
  | { kind: "object"; result: GenerateObjectResult<unknown> };

/**
 * Test double for ProviderAdapter. Queue scripted responses; each call to
 * generateText/generateObject consumes the next one in FIFO order. Never touches
 * the network, so unit tests for the checklist generator / action loop / judgment
 * run deterministically without provider API keys.
 */
export class FakeProvider implements ProviderAdapter {
  readonly provider: Provider = "claude";
  readonly model = "fake-model";

  private readonly queue: ScriptedResponse[] = [];
  readonly calls: Array<GenerateTextRequest | GenerateObjectRequest<z.ZodTypeAny>> = [];

  queueText(result: GenerateTextResult): this {
    this.queue.push({ kind: "text", result });
    return this;
  }

  queueObject<T>(result: GenerateObjectResult<T>): this {
    this.queue.push({ kind: "object", result: result as GenerateObjectResult<unknown> });
    return this;
  }

  async generateText(request: GenerateTextRequest): Promise<GenerateTextResult> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (!next || next.kind !== "text") {
      throw new Error("FakeProvider: no scripted text response queued");
    }
    return next.result;
  }

  async generateObject<Schema extends z.ZodTypeAny>(
    request: GenerateObjectRequest<Schema>,
  ): Promise<GenerateObjectResult<z.infer<Schema>>> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (!next || next.kind !== "object") {
      throw new Error("FakeProvider: no scripted object response queued");
    }
    return next.result as GenerateObjectResult<z.infer<Schema>>;
  }
}
