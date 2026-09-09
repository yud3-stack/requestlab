import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const prisma = new PrismaClient();
const developmentKey = process.env.DEV_INGESTION_KEY ?? "rlk_local_development_only";

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: "demo@requestlab.local" },
    update: { name: "RequestLab Demo" },
    create: { name: "RequestLab Demo", email: "demo@requestlab.local" }
  });
  const project = await prisma.project.upsert({
    where: { slug: "shop-api" },
    update: { name: "Shop API" },
    create: { name: "Shop API", slug: "shop-api" }
  });

  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId: user.id, projectId: project.id } },
    update: { role: "OWNER" },
    create: { userId: user.id, projectId: project.id, role: "OWNER" }
  });

  for (const environment of [
    { name: "Development", slug: "development", type: "DEVELOPMENT" as const, replayEnabled: true },
    { name: "Test", slug: "test", type: "TEST" as const, replayEnabled: true },
    { name: "Production", slug: "production", type: "PRODUCTION" as const, replayEnabled: false }
  ]) {
    await prisma.environment.upsert({
      where: { projectId_slug: { projectId: project.id, slug: environment.slug } },
      update: environment,
      create: { projectId: project.id, ...environment }
    });
  }

  const keyHash = createHash("sha256").update(developmentKey).digest("hex");
  const keyPrefix = developmentKey.slice(0, 12);
  const existingKey = await prisma.apiKey.findFirst({
    where: { projectId: project.id, name: "Development seed key" }
  });
  if (existingKey) {
    await prisma.apiKey.update({
      where: { id: existingKey.id },
      data: { keyPrefix, keyHash, revokedAt: null }
    });
  } else {
    await prisma.apiKey.create({
      data: { projectId: project.id, name: "Development seed key", keyPrefix, keyHash }
    });
  }

  console.log(
    `Seeded user ${user.id}, project ${project.slug}. Development API key prefix: ${keyPrefix}`
  );
}

main().finally(() => prisma.$disconnect());
