type SetFormErrorsOptions = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

type SubmitFormActionOptions = {
  asyncAction: () => Promise<unknown>;
};

type ApiSubmitRequestOptions = {
  endpoint: string;
  method?: string;
  payload?: unknown;
};

type ApiValidationSummary = {
  global?: string[];
  fields?: Record<string, string[]>;
};

type ApiValidationResponse = {
  type?: string;
  data?: {
    summary?: ApiValidationSummary;
  };
};

const AbstractFormMixin = {
  data() {
    return {
      formIsSubmitting: false,
      formErrors: [],
      fieldErrors: {},
      submitEndpoint: null as string | null,
    };
  },

  methods: {
    getSubmitEndpoint(): string | null {
      return this.submitEndpoint;
    },

    getSubmitMethod(): string {
      return 'POST';
    },

    buildSubmitPayload(): unknown {
      return {};
    },

    async requestApiSubmit(options: ApiSubmitRequestOptions) {
      const {
        endpoint,
        method = 'POST',
        payload = {},
      } = options;

      return this.$apiClient.requestJson(
        endpoint,
        method,
        payload
      );
    },

    async onSubmit() {
      const endpoint = this.getSubmitEndpoint();
      if (!endpoint) {
        throw new Error('Missing submit endpoint. Override getSubmitEndpoint() or set submitEndpoint.');
      }

      const response = await this.requestApiSubmit({
        endpoint,
        method: this.getSubmitMethod(),
        payload: this.buildSubmitPayload(),
      });

      this.handleApiValidationResponse(response);
      return response;
    },

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

    applyApiValidationSummary(summary?: ApiValidationSummary): void {
      const safeSummary = summary && typeof summary === 'object' ? summary : {};
      this.setFormErrors({
        formErrors: Array.isArray(safeSummary.global) ? safeSummary.global : [],
        fieldErrors: safeSummary.fields && typeof safeSummary.fields === 'object'
          ? safeSummary.fields
          : {},
      });
    },

    applyApiValidationFromResponse(response: unknown): void {
      const safeResponse = response && typeof response === 'object'
        ? response as { data?: { summary?: ApiValidationSummary } }
        : {};
      const summary = safeResponse?.data?.summary;

      this.applyApiValidationSummary(summary);
    },

    responseHasValidationError(response: unknown): boolean {
      const safeResponse = response && typeof response === 'object'
        ? response as ApiValidationResponse
        : {};

      return safeResponse?.type === 'error';
    },

    handleApiValidationResponse(response: unknown): boolean {
      if (!this.responseHasValidationError(response)) {
        this.clearFormErrors();
        return false;
      }

      this.applyApiValidationFromResponse(response);
      return true;
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
