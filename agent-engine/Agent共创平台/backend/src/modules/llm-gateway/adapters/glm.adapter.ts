import { LLMAdapter, LLMRequest, LLMResponse, LLMStreamChunk } from '../types'

export class GLMAdapter implements LLMAdapter {
  readonly provider = 'glm'

  constructor(
    private apiKey: string,
    private baseUrl = 'https://open.bigmodel.cn/api/paas/v4',
  ) {}

  supports(model: string): boolean {
    return model.startsWith('glm-')
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now()
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: false,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GLM API error: ${response.status} ${error}`)
    }

    const data = await response.json() as any
    const latencyMs = Date.now() - start

    return {
      content: data.choices?.[0]?.message?.content || '',
      model: request.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      latencyMs,
      provider: this.provider,
    }
  }

  async *chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GLM API error: ${response.status} ${error}`)
    }

    if (!response.body) throw new Error('GLM: response body is null')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            yield { content: fullContent, done: true }
            return
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              fullContent += delta
              yield { content: fullContent, done: false }
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock()
      yield { content: fullContent, done: true }
    }
  }
}
