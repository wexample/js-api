const AbstractGraphMixin = {
  data() {
    return {
      graphWidth: 0,
      graphHeight: 0,
    };
  },

  mounted() {
    this._graphResizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      this.graphWidth = width;
      this.graphHeight = height;
    });

    this._graphResizeObserver.observe(this.getGraphEl());
  },

  beforeUnmount() {
    this._graphResizeObserver?.disconnect();
  },

  methods: {
    getGraphEl(): Element {
      throw new Error('getGraphEl() must be implemented.');
    },
  },
};

export default AbstractGraphMixin;
