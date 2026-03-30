import type { ApiEntitySchemaProperty } from '../Common/AbstractApiEntity.js';

export function getSchemaPropertyByName(
  schemaProperties: ApiEntitySchemaProperty[],
  name: string
): ApiEntitySchemaProperty | undefined {
  return schemaProperties.find((property) => property.name === name);
}

export function isPropertyWritable(property: ApiEntitySchemaProperty): boolean {
  if (property.writable === false) {
    return false;
  }

  return property.readOnly !== true;
}

export function isPropertySerializable(property: ApiEntitySchemaProperty): boolean {
  return property.serializable !== false;
}
