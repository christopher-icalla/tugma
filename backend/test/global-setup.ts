import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

/** Applies migrations to the test database and empties it before the suite runs. */
export default async function globalSetup() {
  require('./setup-env');
  const url = process.env.DATABASE_URL ?? '';
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to clear a database whose name doesn't contain "test": ${url}`);
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length) {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
