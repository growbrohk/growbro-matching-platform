/** Max IDs per `.in()` filter to stay within PostgREST URL length limits. */
export const IN_CHUNK_SIZE = 200;

/** Default timeout for product-orders-table queryFn. */
export const PRODUCT_ORDERS_QUERY_TIMEOUT_MS = 45_000;

/** Split an ID array into chunks for batched Supabase `.in()` queries. */
export function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + IN_CHUNK_SIZE));
  }
  return chunks;
}

/** Run a fetch function over ID chunks in parallel and flatten results. */
export async function mapChunked<T>(
  ids: string[],
  fn: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const results = await Promise.all(chunkIds(ids).map(fn));
  return results.flat();
}

/** Reject when the query exceeds `ms` or when `signal` aborts. */
export function withQueryTimeout<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number = PRODUCT_ORDERS_QUERY_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      reject(new Error(`Product orders load timed out after ${Math.round(ms / 1000)}s`));
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

/** Apply abort signal to a Supabase query builder when provided. */
export function applyAbortSignal<T extends { abortSignal: (signal: AbortSignal) => T }>(
  query: T,
  signal?: AbortSignal
): T {
  return signal ? query.abortSignal(signal) : query;
}
