/** Tool result carrying both a text rendering and the typed structuredContent. */
export function toolResult<T extends object>(structured: T, text?: string) {
  return {
    content: [{ type: "text" as const, text: text ?? JSON.stringify(structured, null, 2) }],
    structuredContent: structured as T & Record<string, unknown>,
  };
}
