import type { FormControllerInterface } from './FormControllerInterface';
import type { FieldControllerInterface } from './FieldControllerInterface';

export class VueFormController implements FormControllerInterface {
  isSubmitting = false;
  private readonly fields = new Map<string, FieldControllerInterface>();

  registerField(field: FieldControllerInterface): void {
    this.fields.set(field.fieldName, field);
  }

  unregisterField(field: FieldControllerInterface): void {
    this.fields.delete(field.fieldName);
  }

  getField(name: string): FieldControllerInterface | undefined {
    return this.fields.get(name);
  }

  beginSubmit(): void {
    this.isSubmitting = true;
    this.fields.forEach(field => field.disable());
  }

  endSubmit(): void {
    this.isSubmitting = false;
    this.fields.forEach(field => field.enable());
  }
}
