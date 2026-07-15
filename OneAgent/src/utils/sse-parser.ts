export type SseMessage = {
  event?: string;
  data: string;
};

export function parseSseBlock(block: string): SseMessage | undefined {
  const trimmed = block.trim();
  if (!trimmed) {
    return undefined;
  }

  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (!dataLines.length) {
    return undefined;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const separator = buffer.indexOf("\n\n");
        if (separator === -1) {
          break;
        }
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const message = parseSseBlock(block);
        if (message) {
          yield message;
        }
      }
    }

    const tail = parseSseBlock(buffer);
    if (tail) {
      yield tail;
    }
  } finally {
    reader.releaseLock();
  }
}
