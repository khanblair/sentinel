// A default + destructure import, not a named import: @prisma/client ships as CJS,
// and Node's named-export interop for it is inconsistent across runtimes — this
// pattern works everywhere, a named import silently didn't under Electron's bundled
// Node in a packaged build (confirmed by actually launching the packaged backend).
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
export type PrismaClient = InstanceType<typeof pkg.PrismaClient>;

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export async function checkDatabaseConnection(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("database connection check failed", error);
    return false;
  }
}
