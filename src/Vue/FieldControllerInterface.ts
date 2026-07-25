export interface FieldControllerInterface {
  readonly fieldName: string;
  disable(): void;
  enable(): void;
  setErrors(errors: string[]): void;
  clearErrors(): void;
}
