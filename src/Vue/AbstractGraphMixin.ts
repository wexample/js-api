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

    this._graphResizeObserver.observe(this.$el);
  },

  beforeUnmount() {
    this._graphResizeObserver?.disconnect();
  },
};

export default AbstractGraphMixin;
