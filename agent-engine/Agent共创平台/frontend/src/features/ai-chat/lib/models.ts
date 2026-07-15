/**
 * 可用模型列表（对应 muiltchat client/src/lib/models.ts）
 * 与后端 AVAILABLE_MODELS 保持同步
 */

export interface Model {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'dashscope' | 'glm' | 'minimax' | 'ollama'
  description: string
  contextWindow: number
}

export const AVAILABLE_MODELS: Model[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    description: 'OpenAI 旗舰模型，通过代理访问。',
    contextWindow: 128000,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    description: 'OpenAI 高性价比模型。',
    contextWindow: 128000,
  },
  {
    id: 'claude-4.6-sonnet',
    name: 'Claude 4.6 Sonnet',
    provider: 'anthropic',
    description: 'Claude 最新模型，通过代理访问。',
    contextWindow: 200000,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    description: 'Claude 高性价比版本。',
    contextWindow: 200000,
  },
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'glm',
    description: '智谱 AI 旗舰模型，编程与推理能力突出。',
    contextWindow: 200000,
  },
  {
    id: 'glm-4.7-flash',
    name: 'GLM-4.7 Flash',
    provider: 'glm',
    description: '智谱 AI 高性价比版本。',
    contextWindow: 128000,
  },
  {
    id: 'minimax-2.5',
    name: 'MiniMax 2.5',
    provider: 'minimax',
    description: 'MiniMax 性价比之选，推理速度快。',
    contextWindow: 128000,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    description: 'DeepSeek 推理与代码模型。',
    contextWindow: 64000,
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    description: 'DeepSeek 推理模型。',
    contextWindow: 64000,
  },
  {
    id: 'qwen3.5:9b',
    name: 'Qwen 3.5 9B (Ollama)',
    provider: 'ollama',
    description: '本地 Ollama 部署，需配置 OLLAMA_BASE_URL。',
    contextWindow: 32000,
  },
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'dashscope',
    description: '阿里百炼 Qwen，中文能力强。',
    contextWindow: 32000,
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    provider: 'dashscope',
    description: '阿里百炼 Qwen Plus。',
    contextWindow: 32000,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    description: 'Google 多模态模型，超大上下文。',
    contextWindow: 1000000,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    description: 'Google 高性价比多模态模型。',
    contextWindow: 1000000,
  },
]

/** Agent 角色定义（用于多Agent讨论模式） */
export interface AgentRole {
  id: string
  name: string
  icon: string
  color: string
  description: string
  systemPrompt: string
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'tech-expert',
    name: '技术专家',
    icon: '🔬',
    color: 'blue',
    description: '从技术角度分析问题，关注架构、性能、实现细节',
    systemPrompt: '你是一位资深技术专家，擅长从技术角度深入分析问题。关注点：架构设计、性能优化、实现细节、技术风险、可行性评估。你的分析要专业、深入、有技术深度。',
  },
  {
    id: 'product-manager',
    name: '产品经理',
    icon: '📊',
    color: 'green',
    description: '从市场和用户角度分析，关注需求、体验、商业价值',
    systemPrompt: '你是一位经验丰富的产品经理，擅长从市场和用户角度分析问题。关注点：用户需求、产品体验、商业价值、市场竞争、优先级排序。你的分析要务实、以用户为中心。',
  },
  {
    id: 'competitor-analyst',
    name: '竞品分析师',
    icon: '🔍',
    color: 'purple',
    description: '分析竞品动态、市场格局、技术趋势',
    systemPrompt: '你是一位专业的竞品分析师，擅长分析市场竞争格局和技术趋势。关注点：竞品动态、市场格局、技术趋势、差异化机会、威胁识别。你的分析要全面、客观、有战略视角。',
  },
  {
    id: 'skeptic',
    name: '质疑者',
    icon: '🤔',
    color: 'red',
    description: '蓝军视角，质疑假设、识别风险、找出漏洞',
    systemPrompt: '你是一位质疑者（蓝军），擅长从批判性角度分析问题。关注点：假设漏洞、潜在风险、论证缺陷、忽略因素、反例。你的质疑要有建设性，目的是让讨论更加完善，而不是否定一切。',
  },
  {
    id: 'synthesizer',
    name: '综合分析师',
    icon: '🎯',
    color: 'amber',
    description: '整合各方观点，给出最终结论和行动建议',
    systemPrompt: '你是一位综合分析师，擅长整合不同观点并给出清晰结论。关注点：共识与分歧、核心观点、行动建议、风险与机会的平衡。你的分析要全面、有条理，给出可执行的结论。',
  },
]
