import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@sentinel/shared";
import type { ElementSummary, Page, ScreencastFrame } from "../automation/page.js";
import { PreviewController } from "./previewController.js";

const FRAME_METADATA: ScreencastFrame["metadata"] = {
  offsetTop: 0,
  pageScaleFactor: 1,
  deviceWidth: 1000,
  deviceHeight: 800,
  scrollOffsetX: 0,
  scrollOffsetY: 0,
};

/** Minimal Page double built specifically to test PreviewController's screencast
 * bridging — unlike FakePage (automation/fakePage.ts), simulateFrame() here actually
 * invokes whatever callback startScreencast was given, the way a real CDP session
 * would push frames asynchronously. */
class FakePreviewPage implements Page {
  onFrame: ((frame: ScreencastFrame) => void) | null = null;
  screencastStarted = false;
  screencastStopCount = 0;
  viewportCalls: Array<{ width: number; height: number }> = [];
  describeElementAtCalls: Array<{ x: number; y: number }> = [];
  describeElementAtResult: ElementSummary | null = null;
  currentUrl = "https://example.com/";

  async goto(): Promise<void> {}
  async click(): Promise<void> {}
  async type(): Promise<void> {}
  async scroll(): Promise<void> {}
  async waitForSelector(): Promise<void> {}
  async textContent(): Promise<string | null> {
    return null;
  }
  async title(): Promise<string> {
    return "Fake";
  }
  async listElements(): Promise<ElementSummary[]> {
    return [];
  }
  url(): string {
    return this.currentUrl;
  }
  async startScreencast(onFrame: (frame: ScreencastFrame) => void): Promise<void> {
    this.onFrame = onFrame;
    this.screencastStarted = true;
  }
  async stopScreencast(): Promise<void> {
    this.screencastStarted = false;
    this.screencastStopCount += 1;
  }
  async setViewportSize(width: number, height: number): Promise<void> {
    this.viewportCalls.push({ width, height });
  }
  async describeElementAt(x: number, y: number): Promise<ElementSummary | null> {
    this.describeElementAtCalls.push({ x, y });
    return this.describeElementAtResult;
  }

  simulateFrame(dataBase64 = "AAAA", metadata: ScreencastFrame["metadata"] = FRAME_METADATA): void {
    this.onFrame?.({ dataBase64, metadata });
  }
}

describe("PreviewController", () => {
  it("does nothing when the client starts watching before any page is attached", async () => {
    const messages: ServerMessage[] = [];
    const controller = new PreviewController((m) => messages.push(m));
    await controller.handleStart("run-1");
    expect(messages).toHaveLength(0);
  });

  it("starts screencast retroactively once a page attaches after preview:start", async () => {
    const messages: ServerMessage[] = [];
    const controller = new PreviewController((m) => messages.push(m));
    const page = new FakePreviewPage();

    await controller.handleStart("run-1");
    await controller.attachPage("run-1", page);

    expect(page.screencastStarted).toBe(true);
    expect(messages).toContainEqual({ type: "preview:url", runId: "run-1", url: page.url() });
  });

  it("broadcasts preview:frame for each simulated frame and tracks its metadata", async () => {
    const messages: ServerMessage[] = [];
    const controller = new PreviewController((m) => messages.push(m));
    const page = new FakePreviewPage();

    await controller.attachPage("run-1", page);
    await controller.handleStart("run-1");
    page.simulateFrame("base64data", FRAME_METADATA);

    expect(messages).toContainEqual({
      type: "preview:frame",
      runId: "run-1",
      dataBase64: "base64data",
      metadata: FRAME_METADATA,
    });
  });

  it("does not start screencast for a page when no client has asked to watch", async () => {
    const controller = new PreviewController(() => {});
    const page = new FakePreviewPage();
    await controller.attachPage("run-1", page);
    expect(page.screencastStarted).toBe(false);
  });

  it("stops the previous page's screencast when a new page attaches (Test Case transition)", async () => {
    const controller = new PreviewController(() => {});
    const firstPage = new FakePreviewPage();
    const secondPage = new FakePreviewPage();

    await controller.handleStart("run-1");
    await controller.attachPage("run-1", firstPage);
    expect(firstPage.screencastStarted).toBe(true);

    await controller.attachPage("run-1", secondPage);
    expect(firstPage.screencastStopCount).toBe(1);
    expect(secondPage.screencastStarted).toBe(true);
  });

  it("stops screencast on handleStop and does not restart on a later frame", async () => {
    const controller = new PreviewController(() => {});
    const page = new FakePreviewPage();
    await controller.attachPage("run-1", page);
    await controller.handleStart("run-1");
    expect(page.screencastStarted).toBe(true);

    await controller.handleStop("run-1");
    expect(page.screencastStopCount).toBe(1);
  });

  describe("run-state gating (the core correctness requirement)", () => {
    it("rejects setViewport and describeElementAt while a step is in flight", async () => {
      const controller = new PreviewController(() => {});
      const page = new FakePreviewPage();
      await controller.attachPage("run-1", page);

      controller.beginStep("run-1");
      expect(controller.isInteractive("run-1")).toBe(false);

      const viewportResult = await controller.setViewport("run-1", 400, 800);
      expect(viewportResult).toEqual({ ok: false, reason: expect.stringContaining("in progress") });
      expect(page.viewportCalls).toHaveLength(0);

      const elementResult = await controller.describeElementAt("run-1", 0.5, 0.5);
      expect(elementResult.ok).toBe(false);
      expect(page.describeElementAtCalls).toHaveLength(0);
    });

    it("allows setViewport and describeElementAt once the step ends", async () => {
      const controller = new PreviewController(() => {});
      const page = new FakePreviewPage();
      await controller.handleStart("run-1");
      await controller.attachPage("run-1", page);
      page.simulateFrame(); // needed for describeElementAt's coordinate translation

      controller.beginStep("run-1");
      controller.endStep("run-1");
      expect(controller.isInteractive("run-1")).toBe(true);

      const viewportResult = await controller.setViewport("run-1", 400, 800);
      expect(viewportResult).toEqual({ ok: true });
      expect(page.viewportCalls).toEqual([{ width: 400, height: 800 }]);

      const elementResult = await controller.describeElementAt("run-1", 0.5, 0.5);
      expect(elementResult.ok).toBe(true);
    });

    it("rejects viewport/element actions for a run with no attached page", async () => {
      const controller = new PreviewController(() => {});
      const viewportResult = await controller.setViewport("no-such-run", 400, 800);
      expect(viewportResult.ok).toBe(false);
      const elementResult = await controller.describeElementAt("no-such-run", 0.5, 0.5);
      expect(elementResult.ok).toBe(false);
    });
  });

  it("translates ratio coordinates to real page coordinates using the last frame's metadata", async () => {
    const controller = new PreviewController(() => {});
    const page = new FakePreviewPage();
    await controller.handleStart("run-1");
    await controller.attachPage("run-1", page);
    page.simulateFrame("data", {
      offsetTop: 0,
      pageScaleFactor: 2,
      deviceWidth: 1000,
      deviceHeight: 800,
      scrollOffsetX: 50,
      scrollOffsetY: 20,
    });

    await controller.describeElementAt("run-1", 0.5, 0.25);

    // x = (0.5 * 1000) / 2 + 50 = 300 ; y = (0.25 * 800 - 0) / 2 + 20 = 120
    expect(page.describeElementAtCalls).toEqual([{ x: 300, y: 120 }]);
  });

  it("cleanup removes all state for a run", async () => {
    const controller = new PreviewController(() => {});
    const page = new FakePreviewPage();
    await controller.attachPage("run-1", page);
    await controller.handleStart("run-1");
    controller.cleanup("run-1");
    expect(controller.isInteractive("run-1")).toBe(false);
  });
});
