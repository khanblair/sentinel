import { z } from "zod";
import type { Page } from "./page.js";

export const pageToolCallSchema = z.discriminatedUnion("tool", [
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
]);

/** These two never touch the Page — they need a human (or a Full-Auto default) on
 * the other end, so they're handled by the action loop's resolver, not executeTool. */
export const confirmationToolCallSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("request_input"), prompt: z.string().min(1) }),
  z.object({ tool: z.literal("request_tester_action"), prompt: z.string().min(1) }),
]);

export const toolCallSchema = z.union([pageToolCallSchema, confirmationToolCallSchema]);

export type PageToolCall = z.infer<typeof pageToolCallSchema>;
export type ConfirmationToolCall = z.infer<typeof confirmationToolCallSchema>;
export type ToolCall = z.infer<typeof toolCallSchema>;

export function isConfirmationToolCall(call: ToolCall): call is ConfirmationToolCall {
  return call.tool === "request_input" || call.tool === "request_tester_action";
}

export interface ToolResult {
  observation: string;
  verdict?: { status: "pass" | "fail"; confidence: number; reason: string };
}

/** Never throws — automation failures become an observation the loop can react to,
 * matching the design's "stuck detection sees a changed observation" model rather
 * than crashing the whole run on one bad selector. */
export async function executeTool(page: Page, call: PageToolCall): Promise<ToolResult> {
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
