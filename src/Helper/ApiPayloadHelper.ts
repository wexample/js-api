import type { ApiEntityData } from '../Common/AbstractApiEntity.js';

type ApiPayload = Record<string, unknown> & { items?: ApiEntityData[] };

export function extractPayload(data: unknown): ApiEntityData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid API response: expected an object containing a "data" object.');
  }

  const record = data as Record<string, unknown>;
  const payload = record['data'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid API response: missing or invalid "data" object.');
  }

  return payload as ApiEntityData;
}

export function extractItems(payload: ApiEntityData): ApiEntityData[] {
  const items = (payload as ApiPayload)['items'];
  if (!Array.isArray(items)) {
    throw new Error('Invalid API payload: missing "items" array.');
  }

  return items;
}
