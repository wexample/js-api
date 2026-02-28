import type { ApiEntitySchemaProperty } from '../Common/AbstractApiEntity.js';

export function normalizePropertyType(type: unknown): string {
  if (typeof type !== 'string') {
    return '';
  }

  const lowered = type.toLowerCase();
  if (lowered === 'datetimeinterface' || lowered === 'date') {
    return 'datetime';
  }

  return lowered;
}

export function normalizeIncomingValue(
  property: ApiEntitySchemaProperty,
  value: unknown
): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  switch (normalizePropertyType(property.type)) {
    case 'datetime': {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    case 'integer': {
      const num = Number(value);
      return Number.isNaN(num) ? null : Math.trunc(num);
    }
    case 'float':
    case 'double':
    case 'decimal': {
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : Boolean(value);
    case 'string':
      return String(value);
    default:
      return value;
  }
}

export function serializeOutgoingValue(
  property: ApiEntitySchemaProperty,
  value: unknown
): unknown {
  if (value === undefined || value === null) {
    return null;
  }

  switch (normalizePropertyType(property.type)) {
    case 'datetime': {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
      }
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'integer': {
      const num = Number(value);
      return Number.isNaN(num) ? null : Math.trunc(num);
    }
    case 'float':
    case 'double':
    case 'decimal': {
      const num = Number(value);
      return Number.isNaN(num) ? null : num;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : Boolean(value);
    case 'string':
      return String(value);
    default:
      return value;
  }
}
