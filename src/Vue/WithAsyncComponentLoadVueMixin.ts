const WithAsyncComponentLoadVueMixin = {
  data() {
    return {
      asyncComponentLoaded: false,
      asyncComponentLoading: true,
      asyncComponentError: null,
      asyncComponentLoadPromise: null,
    };
  },

  async mounted() {
    await this.loadAsyncComponent(true);
  },

  methods: {
    async asyncComponentLoad() {
      // Override in component to load required async data.
    },

    async loadAsyncComponent(forceRefresh = false) {
      if (this.asyncComponentLoading && !forceRefresh) {
        return this.asyncComponentLoadPromise;
      }

      if (this.asyncComponentLoaded && !forceRefresh) {
        return;
      }

      this.asyncComponentLoading = true;
      this.asyncComponentError = null;

      this.asyncComponentLoadPromise = (async () => {
        try {
          await this.asyncComponentLoad();
          this.asyncComponentLoaded = true;
        } catch (error) {
          this.asyncComponentLoaded = false;
          this.asyncComponentError = error;
          throw error;
        } finally {
          this.asyncComponentLoading = false;
          this.asyncComponentLoadPromise = null;
        }
      })();

      return this.asyncComponentLoadPromise;
    },

    resetAsyncComponentState() {
      this.asyncComponentLoaded = false;
      this.asyncComponentLoading = true;
      this.asyncComponentError = null;
      this.asyncComponentLoadPromise = null;
    },
  },
};

export default WithAsyncComponentLoadVueMixin;
