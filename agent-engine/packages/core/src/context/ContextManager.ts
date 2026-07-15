/**
 * 上下文管理服务
 * 从 todify4 backend/services/agent/ContextManager.ts 移植
 * 负责管理对话历史，实现不同的上下文策略
 */
import type { ChatMessage } from '../types/llm';
import type { ContextStrategy } from '../types/agent';
import type { IChatMessageService, ILLMProviderFactory } from '../interfaces';

export interface ContextManagerConfig {
  chatMessageService: IChatMessageService;
  llmProviderFactory: ILLMProviderFactory;
  // Optional: API key for LLM summary generation
  summaryApiKey?: string;
}

export class ContextManager {
  private config: ContextManagerConfig;

  constructor(config: ContextManagerConfig) {
    this.config = config;
  }

  /**
   * 获取上下文消息
   */
  async getContextMessages(
    conversationId: string,
    strategy: ContextStrategy,
    currentQuery: string
  ): Promise<ChatMessage[]> {
    if (!conversationId) {
      return [];
    }

    const limit = this.calculateMessageLimit(strategy);
    const history = await this.config.chatMessageService.getConversationMessages(
      conversationId,
      limit,
      0
    );

    if (history.length === 0) {
      return [];
    }

    switch (strategy.type) {
      case 'window':
        return this.applyWindowStrategy(history, strategy);
      
      case 'summary':
        return await this.applySummaryStrategy(history, strategy);
      
      case 'hybrid':
        return await this.applyHybridStrategy(history, strategy, currentQuery);
      
      default:
        return this.applyWindowStrategy(history, strategy);
    }
  }

  private applyWindowStrategy(history: any[], strategy: ContextStrategy): ChatMessage[] {
    const maxMessages = strategy.maxMessages || 10;
    const recentMessages = history.slice(-maxMessages);
    return recentMessages.map(msg => this.toMessage(msg));
  }

  private async applySummaryStrategy(
    history: any[],
    strategy: ContextStrategy
  ): Promise<ChatMessage[]> {
    const maxMessages = strategy.maxMessages || 10;
    const threshold = strategy.summaryThreshold || maxMessages * 2;

    if (history.length <= threshold) {
      return history.map(msg => this.toMessage(msg));
    }

    const oldMessages = history.slice(0, -maxMessages);
    const recentMessages = history.slice(-maxMessages);
    const summary = await this.generateSummary(oldMessages);

    const messages: ChatMessage[] = [];
    
    if (summary) {
      messages.push({
        role: 'system',
        content: `对话历史摘要：${summary}`
      });
    }

    messages.push(...recentMessages.map(msg => this.toMessage(msg)));

    return messages;
  }

  private async applyHybridStrategy(
    history: any[],
    strategy: ContextStrategy,
    currentQuery: string
  ): Promise<ChatMessage[]> {
    const maxTokens = strategy.maxTokens || 4000;
    const maxMessages = strategy.maxMessages || 20;

    const messages: ChatMessage[] = [];
    let tokenCount = 0;
    const queryTokens = this.estimateTokens(currentQuery);

    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgTokens = this.estimateTokens(msg.content || msg.query || '');

      if (tokenCount + msgTokens + queryTokens > maxTokens * 0.8) {
        if (i > 0) {
          const remainingMessages = history.slice(0, i);
          const summary = await this.generateSummary(remainingMessages);
          if (summary) {
            messages.unshift({
              role: 'system',
              content: `历史对话摘要：${summary}`
            });
          }
        }
        break;
      }

      messages.unshift(this.toMessage(msg));
      tokenCount += msgTokens;

      if (messages.length >= maxMessages) {
        if (i > 0) {
          const remainingMessages = history.slice(0, i);
          const summary = await this.generateSummary(remainingMessages);
          if (summary) {
            messages.unshift({
              role: 'system',
              content: `历史对话摘要：${summary}`
            });
          }
        }
        break;
      }
    }

    return messages;
  }

  private async generateSummary(messages: any[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    try {
      const conversationText = messages
        .map(msg => {
          const role = msg.message_type === 'user' ? '用户' : '助手';
          const content = msg.content || msg.query || msg.dify_answer || '';
          return `${role}: ${content}`;
        })
        .join('\n');

      const maxLength = 2000;
      const truncatedText = conversationText.length > maxLength 
        ? conversationText.substring(0, maxLength) + '...'
        : conversationText;

      const summaryPrompt = `请总结以下对话的关键信息，保留重要的上下文和细节。用中文回答，控制在100字以内。

对话内容：
${truncatedText}

摘要：`;

      // 尝试使用 LLM 生成摘要
      try {
        const provider = this.config.llmProviderFactory.create({
          provider: 'openai',
          apiKey: this.config.summaryApiKey || '',
          model: 'gpt-3.5-turbo',
          temperature: 0.3,
          maxTokens: 200
        });
        
        const response = await provider.chat(
          [{ role: 'user', content: summaryPrompt }],
          { provider: 'openai', apiKey: '', model: 'gpt-3.5-turbo', temperature: 0.3, maxTokens: 200 }
        );
        
        return response.content || '';
      } catch {
        // 降级：返回简化摘要
        return conversationText.substring(0, 200) + (conversationText.length > 200 ? '...' : '');
      }
    } catch (error) {
      console.error('生成摘要失败:', error);
      return '';
    }
  }

  private calculateMessageLimit(strategy: ContextStrategy): number {
    switch (strategy.type) {
      case 'window':
        return strategy.maxMessages || 10;
      
      case 'summary':
        const maxMessages = strategy.maxMessages || 10;
        const threshold = strategy.summaryThreshold || maxMessages * 2;
        return Math.ceil(threshold * 1.5);
      
      case 'hybrid':
        const hybridMaxMessages = strategy.maxMessages || 20;
        const maxTokens = strategy.maxTokens || 4000;
        const tokenBasedLimit = Math.ceil(maxTokens / 200);
        return Math.max(hybridMaxMessages, tokenBasedLimit);
      
      default:
        return 10;
    }
  }

  private estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }
    return Math.ceil(text.length / 4);
  }

  private toMessage(msg: any): ChatMessage {
    const role = msg.message_type === 'user' ? 'user' : 'assistant';
    const content = msg.content || msg.query || msg.dify_answer || '';

    return {
      role,
      content,
    };
  }
}
