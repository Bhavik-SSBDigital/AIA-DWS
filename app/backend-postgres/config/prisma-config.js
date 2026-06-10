import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL + "?connection_limit=10&pool_timeout=20",
      },
    },
  });

globalForPrisma.prisma = prisma;

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
