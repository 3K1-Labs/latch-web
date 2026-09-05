const MAX_JSON_BODY_BYTES = 1_024;

export class UnsupportedContentTypeError extends Error {}
export class RequestBodyTooLargeError extends Error {}
export class InvalidJsonBodyError extends Error {}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    throw new UnsupportedContentTypeError();
  }

  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }

  const reader = request.body?.getReader();

  if (!reader) {
    throw new InvalidJsonBodyError();
  }

  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    length += value.byteLength;

    if (length > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidJsonBodyError();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidJsonBodyError();
  }

  return parsed as Record<string, unknown>;
}

export function waitlistJson(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
