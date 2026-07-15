/**
 * ToolExecutor 类型
 */
export interface ToolExecutionResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface SingleToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
}
