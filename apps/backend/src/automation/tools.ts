import { z } from "zod";
import type { Page } from "./page.js";

export const toolCallSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("navigate"), url: z.string().min(1) }),
  z.object({ tool: z.literal("click"), selector: z.string().min(1) }),
  z.object({ tool: z.literal("type"), selector: z.string().min(1), value: z.string() }),
  z.object({ tool: z.literal("scroll"), selector: z.string().min(1) }),
  z.object({
    tool: z.literal("wait_for_element"),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().default(5000),
  }),
  z.object({ tool: z.literal("extract_text"), selector: z.string().min(1) }),
  z.object({
    tool: z.literal("assert_condition"),
    verdict: z.enum(["pass", "fail"]),
    confidence: z.number().min(0).max(1),
    // Required on both pass and fail — design §6.2: judgment carries evidence for a
    // pass too, not only for failures.
    reason: z.string().min(1, "a reason citing the evidence observed is required"),
  }),
  z.object({ tool: z.literal("request_input"), prompt: z.string().min(1) }),
  z.object({ tool: z.literal("request_tester_action"), prompt: z.string().min(1) }),
]);

export type ToolCall = z.infer<typeof toolCallSchema>;

export interface ToolResult {
  observation: string;
  requiresConfirmation?: boolean;
  verdict?: { status: "pass" | "fail"; confidence: number; reason: string };
}

/** Never throws — automation failures become an observation the loop can react to,
 * matching the design's "stuck detection sees a changed observation" model rather
 * than crashing the whole run on one bad selector. */
export async function executeTool(page: Page, call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.tool) {
      case "navigate": {
        await page.goto(call.url);
        const title = await page.title();
        return { observation: `navigated to ${call.url}, title: "${title}"` };
      }
      case "click":
        await page.click(call.selector);
        return { observation: `clicked ${call.selector}` };
      case "type":
        await page.type(call.selector, call.value);
        return { observation: `typed into ${call.selector}` };
      case "scroll":
        await page.scroll(call.selector);
        return { observation: `scrolled ${call.selector} into view` };
      case "wait_for_element":
        await page.waitForSelector(call.selector, call.timeoutMs);
        return { observation: `element ${call.selector} appeared` };
      case "extract_text": {
        const text = await page.textContent(call.selector);
        return { observation: text ?? `no text content found for ${call.selector}` };
      }
      case "assert_condition":
        return {
          observation: `assertion ${call.verdict} (confidence ${call.confidence}): ${call.reason}`,
          verdict: { status: call.verdict, confidence: call.confidence, reason: call.reason },
        };
      case "request_input":
        return { observation: `awaiting tester input: ${call.prompt}`, requiresConfirmation: true };
      case "request_tester_action":
        return { observation: `awaiting tester action: ${call.prompt}`, requiresConfirmation: true };
      default: {
        const exhaustive: never = call;
        throw new Error(`Unhandled tool call: ${JSON.stringify(exhaustive)}`);
      }
    }
  } catch (error) {
    return {
      observation: `error executing ${call.tool}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
