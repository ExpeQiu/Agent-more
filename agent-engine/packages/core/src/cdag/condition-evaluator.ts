import { Parser } from 'expr-eval';

export interface ConditionContext {
  input: any;
  globalState: Record<string, any>;
}

/**
 * 解析条件表达式中的变量引用
 * 支持 input.x.y 和 globalState.x.y 两种命名空间
 */
function resolveVar(name: string, context: ConditionContext): any {
  const { input, globalState } = context;
  const parts = name.trim().split('.');

  // 解析输入命名空间
  if (parts[0] === 'input' && parts.length > 1) {
    let val: any = input;
    for (let i = 1; i < parts.length; i++) {
      val = val?.[parts[i]];
    }
    if (val !== undefined) return val;
  }

  // 解析 globalState 命名空间
  if (parts[0] === 'globalState' && parts.length > 1) {
    let val: any = globalState;
    for (let i = 1; i < parts.length; i++) {
      val = val?.[parts[i]];
    }
    if (val !== undefined) return val;
  }

  // 兼容：直接用变量名，先查 input，再查 globalState
  let val: any = input;
  for (const part of parts) {
    val = val?.[part];
  }
  if (val !== undefined) return val;

  val = globalState;
  for (const part of parts) {
    val = val?.[part];
  }
  return val;
}

/**
 * 解析原始值为 JS 类型的值
 * - 数字、布尔值、引号字符串
 * - 变量引用（带命名空间）
 */
function parseLiteral(raw: string, context: ConditionContext): any {
  const trimmed = raw.trim();

  // 数字
  const num = Number(trimmed);
  if (!isNaN(num) && isFinite(num)) return num;

  // 布尔
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // 引号字符串
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  // 变量（可能带命名空间前缀）
  if (/^[a-zA-Z_$][\w$.]*$/.test(trimmed)) {
    return resolveVar(trimmed, context);
  }

  return trimmed;
}

export class ConditionEvaluator {
  private parser = new Parser();

  /**
   * 评估条件表达式
   * 支持: a > 5, score >= 0.8 && retries < 3, status == "ok" || count > 10
   * 支持: !flag, (a > 5 && b == "test")
   */
  evaluate(expression: string, context: ConditionContext): boolean {
    const expr = expression.trim();
    if (!expr) return false;

    try {
      // 预处理：转换 C-style 逻辑运算符 → expr-eval 兼容格式
      const normalized = this.normalizeLogicalOperators(expr);

      // 预处理：替换带命名空间的变量为占位符
      const { expr: transformed, vars } = this.replaceVariables(normalized, context);

      const parsed = this.parser.parse(transformed);

      // 构建变量值映射（expr-eval 通过 variables() 收集依赖）
      const varValues: Record<string, number | string | boolean> = {};
      for (const [placeholder, originalName] of Object.entries(vars)) {
        const val = resolveVar(originalName, context);
        varValues[placeholder] = val ?? '';
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = parsed.evaluate(varValues as any);
      return Boolean(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`条件表达式解析失败 "${expression}": ${msg}`);
    }
  }

  /**
   * 将 C-style 逻辑运算符转换为 expr-eval 兼容格式：
   * && → and, || → or, ! → not
   */
  private normalizeLogicalOperators(expr: string): string {
    // 一次性替换，避免重复处理
    return expr
      .replace(/&&/g, ' and ')
      .replace(/\|\|/g, ' or ')
      // ! 的替换要避开 != 和 !==（! 后面不是 = 才替换）
      .replace(/!([^=])/g, 'not $1');
  }

  /**
   * 将带命名空间变量的表达式转换为占位符形式，
   * 方便 expr-eval 解析（避免变量名冲突如 "input.score"）
   *
   * 同时处理隐式变量引用（无命名空间前缀，如 score >= 0.8）
   */
  private replaceVariables(
    expr: string,
    context: ConditionContext
  ): { expr: string; vars: Record<string, string> } {
    const vars: Record<string, string> = {};
    let counter = 0;

    // 匹配带命名空间的变量: input.xxx, globalState.xxx
    const nsPattern = /\b(input|globalState)(\.[\w$]+)+/g;

    // 匹配隐式变量（无命名空间前缀）：出现在比较操作符旁的标识符
    // 策略：先替换带命名空间的，再处理隐式的
    let transformed = expr.replace(nsPattern, (match) => {
      const placeholder = `__V${counter++}__`;
      vars[placeholder] = match;
      return placeholder;
    });

    // 隐式变量：识别比较符两侧或逻辑操作符旁的标识符
    // 排除已被替换的占位符和已有的字符串/数字字面量
    const implicitPattern = /(?<![__\w$"'])(\b[a-zA-Z_$][\w$]*\b)(?![__\w$"'])/g;

    transformed = transformed.replace(implicitPattern, (match) => {
      // 跳过关键词和已知占位符
      if (['true', 'false', 'null', 'undefined', 'and', 'or', 'not'].includes(match)) {
        return match;
      }
      if (match in vars) return match; // 已替换过

      // 检查这个变量在 context 中是否有值（避免误替换函数名等）
      const val = resolveVar(match, context);
      if (val !== undefined) {
        const placeholder = `__V${counter++}__`;
        vars[placeholder] = match;
        return placeholder;
      }
      return match;
    });

    return { expr: transformed, vars };
  }
}
