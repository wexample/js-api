import type { FieldControllerInterface } from './FieldControllerInterface';

export interface FormControllerInterface {
  isSubmitting: boolean;
  registerField(field: FieldControllerInterface): void;
  unregisterField(field: FieldControllerInterface): void;
  getField(name: string): FieldControllerInterface | undefined;
  beginSubmit(): void;
  endSubmit(): void;
}
