/**
 * Prisma seed script — P1-T06
 * Run: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default agents
  const agents = [
    { name: 'Coder', type: 'coder', config: { model: 'gpt-4o-mini' } },
    { name: 'PM', type: 'pm', config: { model: 'gpt-4o' } },
    { name: 'QA', type: 'qa', config: { model: 'gpt-4o-mini' } },
    { name: 'PMO', type: 'pmo', config: { model: 'gpt-4o' } },
  ];

  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { id: agent.name.toLowerCase() },
      update: {},
      create: {
        id: agent.name.toLowerCase(),
        name: agent.name,
        type: agent.type,
        config: agent.config,
      },
    });
    console.log(`  ✓ Agent: ${agent.name}`);
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
