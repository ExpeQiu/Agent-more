/**
 * 专家工具定义
 * 从 todify4 backend/services/agent/tools/expert-tools.ts 移植
 */
import type { ToolConfig } from '../types/agent';

export const expertTools: ToolConfig[] = [
  {
    id: 'consult-tech',
    name: 'Consult_Tech',
    description: '咨询技术原教旨主义者：提取硬核参数、物理原理、核心壁垒。用于"去伪存真"，从技术文档中提取真实的技术参数和工程难点。',
    type: 'agent',
    enabled: true,
    parameters: [
      {
        name: 'techDocument',
        type: 'string',
        description: '原始技术文档、参数表或技术描述',
        required: true
      },
      {
        name: 'analysisType',
        type: 'string',
        description: '分析类型：five-view（五看分析）、three-fix（三定分析）、tech-matrix（技术矩阵）',
        required: false,
        enum: ['five-view', 'three-fix', 'tech-matrix']
      },
      {
        name: 'query',
        type: 'string',
        description: '用户的具体问题或需求',
        required: false
      }
    ],
    implementation: {
      agentId: 'tech-fundamentalist'
    }
  },
  {
    id: 'consult-scene',
    name: 'Consult_Scene',
    description: '咨询场景炼金术师：将技术点映射为用户痛点/爽点场景。用于"说人话"，将生硬的技术参数转化为用户能理解的真实场景。',
    type: 'agent',
    enabled: true,
    parameters: [
      {
        name: 'techPoint',
        type: 'string',
        description: '核心技术点，例如：800V高压平台、激光雷达、固态电池等',
        required: true
      },
      {
        name: 'userContext',
        type: 'string',
        description: '用户画像或使用场景上下文',
        required: false
      },
      {
        name: 'query',
        type: 'string',
        description: '用户的具体问题或需求',
        required: false
      }
    ],
    implementation: {
      agentId: 'scene-alchemist'
    }
  },
  {
    id: 'consult-market',
    name: 'Consult_Market',
    description: '咨询市场狙击手：竞品分析、差异化定位、传播策略。用于"找差异"，制定竞争策略和传播方案。',
    type: 'agent',
    enabled: true,
    parameters: [
      {
        name: 'techDescription',
        type: 'string',
        description: '自身技术描述或核心卖点',
        required: true
      },
      {
        name: 'targetAudience',
        type: 'string',
        description: '目标人群或市场定位',
        required: false
      },
      {
        name: 'competitors',
        type: 'string',
        description: '竞品信息或对比维度',
        required: false
      },
      {
        name: 'query',
        type: 'string',
        description: '用户的具体问题或需求',
        required: false
      }
    ],
    implementation: {
      agentId: 'market-sniper'
    }
  },
  {
    id: 'consult-content',
    name: 'Consult_Content',
    description: '咨询内容总导演：生成脚本、PPT大纲、海报文案。用于"出活儿"，将策略转化为具体的执行物料。',
    type: 'agent',
    enabled: true,
    parameters: [
      {
        name: 'strategy',
        type: 'string',
        description: '传播策略或核心信息',
        required: true
      },
      {
        name: 'contentType',
        type: 'string',
        description: '内容类型：script（脚本）、ppt-outline（PPT大纲）、poster（海报文案）、video（视频分镜）',
        required: false,
        enum: ['script', 'ppt-outline', 'poster', 'video']
      },
      {
        name: 'materials',
        type: 'string',
        description: '已有素材或参考资料',
        required: false
      },
      {
        name: 'query',
        type: 'string',
        description: '用户的具体问题或需求',
        required: false
      }
    ],
    implementation: {
      agentId: 'content-director'
    }
  }
];

/**
 * 工具名称到角色ID的映射
 */
export const toolToRoleMapping: Record<string, string> = {
  'Consult_Tech': 'tech-fundamentalist',
  'Consult_Scene': 'scene-alchemist',
  'Consult_Market': 'market-sniper',
  'Consult_Content': 'content-director'
};

/**
 * 工具名称到功能类型的映射
 */
export const toolToFeatureTypeMapping: Record<string, string> = {
  'Consult_Tech': 'five-view-analysis',
  'Consult_Scene': 'tech-matrix',
  'Consult_Market': 'propagation-strategy',
  'Consult_Content': 'script'
};
