import { PrismaClient } from "@prisma/client";

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
// Tránh tạo nhiều instance trong môi trường development (hot-reload)
declare global {
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global._prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global._prisma = prisma;
}
