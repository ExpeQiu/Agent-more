import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const builtInAgents = [
  {
    id: 'agent-tech-expert',
    name: '技术专家',
    roleLabel: 'Tech Expert',
    description: '关注技术方案、复杂度、性能与工程风险。',
    systemPrompt: '你是一名技术专家，优先分析实现可行性、工程成本、性能与风险。',
    color: '#2563eb',
  },
  {
    id: 'agent-product-manager',
    name: '产品经理',
    roleLabel: 'Product Manager',
    description: '关注用户价值、优先级和需求边界。',
    systemPrompt: '你是一名产品经理，优先考虑用户价值、产品目标、可用性和优先级。',
    color: '#059669',
  },
  {
    id: 'agent-analyst',
    name: '竞品分析师',
    roleLabel: 'Analyst',
    description: '关注市场、竞品与差异化。',
    systemPrompt: '你是一名竞品分析师，擅长比较方案优劣、行业实践和差异化机会。',
    color: '#7c3aed',
  },
  {
    id: 'agent-challenger',
    name: '质疑者',
    roleLabel: 'Challenger',
    description: '主动质疑假设与潜在盲点。',
    systemPrompt: '你是一名质疑者，请主动指出假设、漏洞、边界条件和潜在失败模式。',
    color: '#dc2626',
  },
  {
    id: 'agent-synthesizer',
    name: '综合分析师',
    roleLabel: 'Synthesizer',
    description: '整合多方观点，输出综合结论。',
    systemPrompt: '你是一名综合分析师，请整合多方观点，给出平衡且可执行的结论。',
    color: '#d97706',
  },
]

async function main() {
  for (const agent of builtInAgents) {
    await prisma.agentDefinition.upsert({
      where: { id: agent.id },
      update: {
        ...agent,
        isBuiltIn: true,
        isActive: true,
        config: '{}',
      },
      create: {
        ...agent,
        isBuiltIn: true,
        isActive: true,
        config: '{}',
      },
    })
  }

  console.log(`Seeded ${builtInAgents.length} built-in agents.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
