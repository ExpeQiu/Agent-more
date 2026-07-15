import { LLMAdapter, LLMRequest, LLMResponse, LLMStreamChunk } from '../types'

export class OllamaAdapter implements LLMAdapter {
  readonly provider = 'ollama'

  constructor(
    private baseUrl = 'http://localhost:11434',
    private apiKey?: string,
  ) {}

  supports(model: string): boolean {
    return model.includes(':') // Ollama models have tags like qwen3.5:9b
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 2048,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${response.status} ${error}`)
    }

    const data = await response.json() as any
    const latencyMs = Date.now() - start

    return {
      content: data.message?.content || '',
      model: request.model,
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      latencyMs,
      provider: this.provider,
    }
  }

  async *chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 2048,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Ollama API error: ${response.status} ${error}`)
    }

    if (!response.body) throw new Error('Ollama: response body is null')

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
          try {
            const parsed = JSON.parse(line)
            const delta = parsed.message?.content
            if (delta) {
              fullContent += delta
              yield { content: fullContent, done: false }
            }
            if (parsed.done) {
              yield { content: fullContent, done: true }
              return
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
