import ApiHttpError from '../Common/Errors/ApiHttpError';

/**
 * Whether a failed request may succeed if sent again later: a transient HTTP
 * status, a network failure (fetch rejects with a TypeError) or a timeout.
 */
export function apiErrorIsTransient(error: unknown): boolean {
  if (error instanceof ApiHttpError) {
    return error.isTransient();
  }

  if (error instanceof TypeError) {
    return true;
  }

  return (error as { name?: unknown } | null)?.name === 'TimeoutError';
}
