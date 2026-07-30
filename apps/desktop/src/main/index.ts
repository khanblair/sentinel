import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { type ChildProcess, spawn } from "node:child_process";

const BACKEND_HTTP_URL = process.env.SENTINEL_BACKEND_URL ?? "http://127.0.0.1:4317";

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function spawnBackendIfNeeded(): void {
  // In dev, the backend is run separately via `pnpm dev:backend` so its logs stay
  // visible in their own terminal. In a packaged build there is no separate terminal,
  // so Electron owns the backend's lifecycle instead.
  if (!app.isPackaged) {
    return;
  }

  const backendEntry = join(__dirname, "../../../backend/dist/server/index.js");
  backendProcess = spawn(process.execPath, [backendEntry], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });

  backendProcess.on("exit", (code) => {
    console.error(`Sentinel backend exited with code ${code}`);
    backendProcess = null;
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`Renderer failed to load: ${errorCode} ${errorDescription}`);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  process.env.SENTINEL_BACKEND_URL = BACKEND_HTTP_URL;
  spawnBackendIfNeeded();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
