import type { FieldControllerInterface } from './FieldControllerInterface';

export interface FormControllerInterface {
  registerField(field: FieldControllerInterface): void;
  unregisterField(field: FieldControllerInterface): void;
  getField(name: string): FieldControllerInterface | undefined;
  beginSubmit(): void;
  endSubmit(): void;
}
