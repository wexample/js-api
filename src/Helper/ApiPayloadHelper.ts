import type { ApiEntityData } from '../Common/AbstractApiEntity.js';

type ApiPayload = Record<string, unknown> & { items?: ApiEntityData[] };

export function extractPayload(data: unknown): ApiEntityData {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    const payload = record['data'];

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as ApiEntityData;
    }

    return record as ApiEntityData;
  }

  return {};
}

export function extractItems(payload: ApiEntityData): ApiEntityData[] {
  const items = (payload as ApiPayload)['items'];
  return Array.isArray(items) ? items : [];
}
