import { LLMAdapter, LLMRequest, LLMResponse, LLMStreamChunk } from '../types'

export class AnthropicAdapter implements LLMAdapter {
  readonly provider = 'anthropic'

  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.anthropic.com/v1',
  ) {}

  supports(model: string): boolean {
    return model.startsWith('claude-')
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now()

    // Build Anthropic messages format (no system in messages array)
    const systemMsg = request.messages.find(m => m.role === 'system')
    const nonSystemMsgs = request.messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
    }

    if (systemMsg) {
      body.system = systemMsg.content
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${error}`)
    }

    const data = await response.json() as any
    const latencyMs = Date.now() - start

    return {
      content: data.content?.[0]?.text || '',
      model: request.model,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      latencyMs,
      provider: this.provider,
    }
  }

  async *chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const systemMsg = request.messages.find(m => m.role === 'system')
    const nonSystemMsgs = request.messages.filter(m => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMsgs.map(m => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    }

    if (systemMsg) {
      body.system = systemMsg.content
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${error}`)
    }

    if (!response.body) throw new Error('Anthropic: response body is null')

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
            yield { content: fullContent, done: true, modelId: request.model }
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta?.text
              if (delta) {
                fullContent += delta
                yield { content: fullContent, done: false, modelId: request.model }
              }
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock()
      yield { content: fullContent, done: true, modelId: request.model }
    }
  }
}
