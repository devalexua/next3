import type { SseMessage } from "./types.js";

export function parseSseChunk(buffer: string): { messages: SseMessage[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() ?? "";

  return {
    messages: blocks.map(parseSseMessage).filter(hasMeaningfulContent),
    remainder,
  };
}

function parseSseMessage(block: string): SseMessage {
  const message: SseMessage = {};
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? "" : line.slice(separator + 1).trimStart();

    if (field === "id") message.id = value;
    if (field === "event") message.event = value;
    if (field === "data") dataLines.push(value);
  }

  if (dataLines.length > 0) {
    message.data = dataLines.join("\n");
  }

  return message;
}

function hasMeaningfulContent(message: SseMessage): boolean {
  return Boolean(message.id || message.event || message.data);
}
