export function normalizeRelationshipName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function lowerFirstCharacter(value: string): string {
  if (!value) {
    return value;
  }

  return value[0].toLowerCase() + value.slice(1);
}
