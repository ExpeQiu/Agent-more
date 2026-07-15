/**
 * Prompt 管理服务
 * 从 todify4 backend/services/agent/PromptManager.ts 移植
 * 负责渲染 Prompt，替换变量等
 */
import type { PromptVariable } from '../types/agent';

export class PromptManager {
  /**
   * 渲染 Prompt（替换变量）
   * @param template Prompt 模板字符串
   * @param variables 变量定义列表
   * @param context 上下文数据
   * @returns 渲染后的 Prompt
   */
  renderPrompt(
    template: string,
    variables: PromptVariable[],
    context: Record<string, any>
  ): string {
    if (!variables || variables.length === 0) {
      return template;
    }

    let rendered = template;

    for (const variable of variables) {
      const value = this.resolveVariable(variable, context);
      // 支持 {{variable}} 和 {variable} 两种格式
      const patterns = [
        new RegExp(`\\{\\{${this.escapeRegex(variable.name)}\\}\\}`, 'g'),
        new RegExp(`\\{${this.escapeRegex(variable.name)}\\}`, 'g')
      ];
      
      for (const pattern of patterns) {
        rendered = rendered.replace(pattern, value);
      }
    }

    return rendered;
  }

  /**
   * 解析变量值
   */
  private resolveVariable(variable: PromptVariable, context: Record<string, any>): string {
    switch (variable.type) {
      case 'static':
        return variable.value || '';
      
      case 'dynamic':
        if (variable.source) {
          return this.getNestedValue(context, variable.source) || '';
        }
        return '';
      
      case 'context':
        return context[variable.name] || '';
      
      default:
        return '';
    }
  }

  /**
   * 获取嵌套属性值（如：user.profile.name）
   */
  private getNestedValue(obj: any, path: string): string {
    if (!obj || !path) {
      return '';
    }

    try {
      const value = path.split('.').reduce((acc: any, part: string) => {
        if (acc === null || acc === undefined) {
          return null;
        }
        return acc[part];
      }, obj);

      if (value === null || value === undefined) {
        return '';
      }

      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      return String(value);
    } catch (error) {
      console.warn(`获取嵌套属性值失败: ${path}`, error);
      return '';
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 提取模板中的所有变量名
   */
  extractVariables(template: string): string[] {
    const variables: string[] = [];
    const patterns = [
      /\{\{(\w+)\}\}/g,  // {{variable}}
      /\{(\w+)\}/g        // {variable}
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(template)) !== null) {
        const varName = match[1];
        if (!variables.includes(varName)) {
          variables.push(varName);
        }
      }
    }

    return variables;
  }
}
