// The deterministic default: nothing to add. Everything the app knows is already in the text.
export default {
  name: 'none',
  async suggest() {
    return [];
  }
};
