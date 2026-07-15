import { LLMAdapter, LLMRequest, LLMResponse, LLMStreamChunk } from '../types'

export class GoogleAdapter implements LLMAdapter {
  readonly provider = 'google'

  constructor(private apiKey: string) {}

  supports(model: string): boolean {
    return model.startsWith('gemini-')
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now()
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: request.messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Google API error: ${response.status} ${error}`)
    }

    const data = await response.json() as any
    const latencyMs = Date.now() - start

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    return {
      content: text,
      model: request.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      latencyMs,
      provider: this.provider,
    }
  }

  async *chatStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: request.messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Google API error: ${response.status} ${error}`)
    }

    if (!response.body) throw new Error('Google: response body is null')

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
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text
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
