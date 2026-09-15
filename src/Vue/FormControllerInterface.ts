import type { FieldRegistryInterface } from './FieldRegistryInterface';

export interface FormControllerInterface extends FieldRegistryInterface {
  isSubmitting: boolean;
  beginSubmit(): void;
  endSubmit(): void;
}
