import type { FieldControllerInterface } from './FieldControllerInterface';

/**
 * What holds the fields of one form and answers for them by name.
 *
 * The point of naming this apart from the form itself is that something asking
 * for a field — an agent filling an address, a routine reporting errors — needs
 * nothing else: it says which field, never where it is in the page nor what it
 * is made of. Both worlds implement it, the vue form controller and the form
 * component of a server-rendered page, so that caller is written once.
 */
export interface FieldRegistryInterface {
  registerField(field: FieldControllerInterface): void;
  unregisterField(field: FieldControllerInterface): void;
  getField(name: string): FieldControllerInterface | undefined;
  getFields(): FieldControllerInterface[];
}
