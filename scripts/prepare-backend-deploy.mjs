// `pnpm --filter @sentinel/backend deploy --prod` produces a self-contained
// node_modules (see apps/desktop/electron-builder.yml for why that matters), but
// --prod excludes the `prisma` CLI devDependency, so @prisma/client's postinstall
// can't regenerate its client there — the already-generated `.prisma/client`
// directory (Prisma's generated code + native query engine binary) never gets
// created inside the deploy output. This copies it over from the already-built
// workspace root, where `pnpm --filter @sentinel/backend run build` (which runs
// `prisma generate`) already produced it.
import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function findPrismaClientStoreDir(nodeModulesDir) {
  const pnpmDir = join(nodeModulesDir, ".pnpm");
  if (!existsSync(pnpmDir)) {
    return null;
  }
  const match = readdirSync(pnpmDir).find((name) => name.startsWith("@prisma+client@"));
  return match ? join(pnpmDir, match, "node_modules") : null;
}

const repoRoot = process.cwd();
const sourceStoreDir = findPrismaClientStoreDir(join(repoRoot, "node_modules"));
const destStoreDir = findPrismaClientStoreDir(join(repoRoot, "apps/desktop/backend-deploy/node_modules"));

if (!sourceStoreDir || !destStoreDir) {
  throw new Error(
    `Could not locate @prisma+client store directories (source=${sourceStoreDir}, dest=${destStoreDir}). ` +
      "Run \"pnpm --filter @sentinel/backend deploy --prod apps/desktop/backend-deploy\" first.",
  );
}

const sourcePrismaDir = join(sourceStoreDir, ".prisma");
const destPrismaDir = join(destStoreDir, ".prisma");

if (!existsSync(sourcePrismaDir)) {
  throw new Error(
    `Generated Prisma client not found at ${sourcePrismaDir} — run "pnpm --filter @sentinel/backend run build" first.`,
  );
}

cpSync(sourcePrismaDir, destPrismaDir, { recursive: true });
console.log(`Copied generated Prisma client: ${sourcePrismaDir} -> ${destPrismaDir}`);
