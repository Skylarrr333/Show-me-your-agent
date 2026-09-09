const MAX_BYTES = 12_000;
export function guard(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new Error('Origin not allowed');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('Origin not allowed');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON content type required');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('Request too large');
}
export async function body(request: Request) {
  guard(request);
  if (!request.body) throw new Error('JSON body required');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let length = 0, raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('Request too large'); }
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally { reader.releaseLock(); }
}
