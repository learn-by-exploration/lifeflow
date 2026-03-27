// ─── LifeFlow Event Cleanup Registry ───
// Prevents memory leaks by tracking and cleaning up event listeners on re-render.
// Usage: Events.on('today', el, 'click', handler) → Events.cleanup('today') on re-render
(function(){
  const _registry = new Map();

  window.Events = {
    /** Add an event listener and register it for cleanup. */
    on(scope, el, event, handler, opts) {
      if (!el) return;
      el.addEventListener(event, handler, opts);
      if (!_registry.has(scope)) _registry.set(scope, []);
      _registry.get(scope).push({ el, event, handler, opts });
    },

    /** Remove all event listeners for a scope. Call at START of each render. */
    cleanup(scope) {
      const entries = _registry.get(scope);
      if (!entries) return;
      for (const { el, event, handler, opts } of entries) {
        el.removeEventListener(event, handler, opts);
      }
      _registry.delete(scope);
    },

    /** Remove all event listeners for all scopes. */
    cleanupAll() {
      for (const scope of _registry.keys()) {
        this.cleanup(scope);
      }
    },

    /** Event delegation — one listener on parent, match children by selector. */
    delegate(scope, parent, event, selector, handler) {
      this.on(scope, parent, event, (e) => {
        const target = e.target.closest(selector);
        if (target && parent.contains(target)) handler(e, target);
      });
    }
  };
})();
