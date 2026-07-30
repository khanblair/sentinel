// Orchestrates the whole `pnpm run package:desktop` flow in plain Node (not shell)
// so it behaves identically on macOS/Linux/Windows CI runners — POSIX-only commands
// like `rm -rf` silently aren't valid on a native Windows shell, and the packaging
// CI workflow (.github/workflows/package.yml) runs a matrix across all three OSes.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDeployDir = join(repoRoot, "apps/desktop/backend-deploy");

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
}

run("pnpm", ["--filter", "@sentinel/shared", "run", "build"]);
run("pnpm", ["--filter", "@sentinel/backend", "run", "build"]);

if (existsSync(backendDeployDir)) {
  rmSync(backendDeployDir, { recursive: true, force: true });
}
run("pnpm", ["--filter", "@sentinel/backend", "deploy", "--prod", backendDeployDir]);

// pnpm deploy leaves one dangling self-referential symlink (backend -> its own
// original source dir) — see electron-builder.yml for the full explanation. Nothing
// imports the backend by its own package name, so it's safe to remove.
const selfReferenceLink = join(
  backendDeployDir,
  "node_modules/.pnpm/node_modules/@sentinel/backend",
);
if (existsSync(selfReferenceLink)) {
  rmSync(selfReferenceLink, { force: true });
}

run("node", [join(repoRoot, "scripts/prepare-backend-deploy.mjs")]);
run("pnpm", ["--filter", "@sentinel/desktop", "run", "package"]);
