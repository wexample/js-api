type SetFormErrorsOptions = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

type SubmitFormActionOptions = {
  asyncAction: () => Promise<unknown>;
};

const AbstractFormMixin = {
  data() {
    return {
      formIsSubmitting: false,
      formErrors: [],
      fieldErrors: {},
    };
  },

  methods: {
    clearFormErrors() {
      this.formErrors = [];
      this.fieldErrors = {};
    },

    setFormErrors(options: SetFormErrorsOptions = {}) {
      const { formErrors = [], fieldErrors = {} } = options;

      this.formErrors = Array.isArray(formErrors) ? formErrors : [];
      this.fieldErrors = fieldErrors && typeof fieldErrors === 'object'
        ? fieldErrors
        : {};
    },

    getFieldErrors(fieldPath: string): string[] {
      return this.fieldErrors[fieldPath] || [];
    },

    async submitFormAction(options: SubmitFormActionOptions) {
      const { asyncAction } = options;

      this.formIsSubmitting = true;
      this.clearFormErrors();

      try {
        return await asyncAction();
      } catch (error) {
        this.handleSubmitError(error);
        throw error;
      } finally {
        this.formIsSubmitting = false;
      }
    },

    handleSubmitError(_error: unknown): void {
      // Hook for child mixins/components.
    },
  },
};

export default AbstractFormMixin;
