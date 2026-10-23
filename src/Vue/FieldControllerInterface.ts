import type { AssistanceWriteOptions } from '../Helper/Assistance';

export interface FieldControllerInterface {
  readonly fieldName: string;
  disable(): void;
  enable(): void;
  setErrors(errors: string[]): void;
  clearErrors(): void;

  // Whether something other than the person is holding the field right now.
  readonly isAssisted: boolean;

  /**
   * Hands the field over: it says so, and stops answering to the keyboard and
   * the pointer. Assistance is always temporary — a field left assisted is a
   * field nobody can use.
   */
  assistanceActivate(): void;

  /**
   * Gives it back. Any writing still under way lands on its final value at once
   * rather than stopping mid-word.
   */
  assistanceDeactivate(): void;

  /**
   * Writes a value the way an agent would: the caller says what, the field says
   * how — spelled out for a word, chosen for an option, ticked for a switch.
   * Takes the field over for the duration and gives it back at the end.
   */
  setValueAssisted(value: unknown, options?: AssistanceWriteOptions): Promise<void>;
}
