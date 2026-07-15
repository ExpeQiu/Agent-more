/**
 * Quality Score HTTP Server — P1-T33
 * 独立的 HTTP 服务，暴露 GET /quality-score 端点
 * 基于 tRPC 架构风格，使用 Node.js 内置 http 模块
 */

import * as http from 'http';
import { parse as parseUrl } from 'url';
import { qualityRouter } from '../routes/quality.js';

const PORT = parseInt(process.env.QUALITY_PORT ?? '3001', 10);

/**
 * 解析 URL query 参数
 */
function parseQuery(urlStr: string): Record<string, string | string[]> {
  const parsed = parseUrl(urlStr, true);
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(parsed.query ?? {})) {
    if (value === undefined) continue;
    query[key] = value;
  }
  return query;
}

/**
 * 发送 JSON 响应
 */
function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * 从 qualityRouter 解析并执行 query
 * 模拟 tRPC 的 procedure 调用流程
 */
async function handleQualityScore(
  query: Record<string, string | string[]>
): Promise<{ status: number; data: unknown }> {
  const agentId = query.agentId as string | undefined;
  const output = query.output as string | undefined;
  const agentType = query.agentType as string | undefined;
  const mode = (query.mode as string | undefined) ?? 'normal';
  const thresholdStr = query.threshold as string | undefined;
  const threshold = thresholdStr ? parseInt(thresholdStr, 10) : 70;

  if (!output) {
    return {
      status: 400,
      data: { error: 'output query parameter is required' },
    };
  }

  if (!['strict', 'normal', 'lenient'].includes(mode)) {
    return {
      status: 400,
      data: { error: 'mode must be one of: strict, normal, lenient' },
    };
  }

  // 解析 tRPC input（与前端约定使用 JSON stringify）
  let parsedOutput = output;
  try {
    // 支持 output 为 JSON 字符串
    const maybeObj = JSON.parse(output);
    if (typeof maybeObj === 'object' && maybeObj !== null) {
      parsedOutput = JSON.stringify(maybeObj);
    }
  } catch {
    // 不是 JSON，当作纯文本处理
  }

  // 使用 tRPC 的解析器验证输入
  const input = {
    agentId,
    output: parsedOutput,
    agentType,
    mode: mode as 'strict' | 'normal' | 'lenient',
    threshold,
  };

  // 直接调用 procedure 逻辑
  try {
    const { LLMJudge } = await import('@agent-engine/core');
    const scorer = new LLMJudge({ threshold });
    const result = await scorer.score({
      content: parsedOutput,
      agentId,
      agentType,
      mode: input.mode,
    });

    return {
      status: 200,
      data: {
        score: result.score,
        passed: result.passed,
        threshold: result.threshold,
        dimensions: result.dimensions as Record<string, number>,
        deductions: result.deductions,
        bonuses: result.bonuses,
        comments: result.comments,
        durationMs: result.durationMs,
        method: result.method,
        agentId,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * 主请求处理函数
 */
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const url = req.url ?? '/';
  const parsed = parseUrl(url, true);
  const pathname = parsed.pathname;

  if (pathname === '/quality-score' && req.method === 'GET') {
    const query = parseQuery(url);
    handleQualityScore(query).then(({ status, data }) => {
      jsonResponse(res, status, data);
    });
    return;
  }

  if (pathname === '/health' && req.method === 'GET') {
    jsonResponse(res, 200, { ok: true, service: 'quality-api' });
    return;
  }

  // tRPC HTTP endpoint（用于 tRPC 客户端调用）
  if (pathname?.startsWith('/trpc/') && req.method === 'GET') {
    // 简单处理 batch get 格式
    const procedure = pathname.replace('/trpc/', '');
    if (procedure === 'quality.getScore') {
      const query = parseQuery(url);
      handleQualityScore(query).then(({ status, data }) => {
        jsonResponse(res, status, data);
      });
      return;
    }
  }

  jsonResponse(res, 404, { error: 'Not found. Available endpoints: GET /quality-score, GET /health' });
}

/**
 * 启动 Quality API HTTP Server
 */
export async function startQualityServer(port = PORT): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handleRequest);
    server.listen(port, () => {
      console.log(`✅ Quality Score API running on http://localhost:${port}/quality-score`);
      resolve(server);
    });
    server.on('error', (err) => {
      console.error('❌ Quality API server error:', err);
      throw err;
    });
  });
}

// 独立运行时启动
const isMain = process.argv[1]?.endsWith('quality-server.ts');
if (isMain) {
  startQualityServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
