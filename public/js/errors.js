// ─── LifeFlow Async Error Boundary ───
// Wraps async render/fetch operations with error handling + toast notifications.
// Usage: const safeRender = ErrorBoundary.wrap(renderToday, 'Today view');
(function(){
  window.ErrorBoundary = {
    /** Wrap an async function with error handling. Returns a wrapped function. */
    wrap(fn, label) {
      return async function (...args) {
        try {
          return await fn.apply(this, args);
        } catch (err) {
          const msg = label ? `${label}: ${err.message}` : err.message;
          console.error(`[LifeFlow] ${msg}`, err);
          if (typeof window.showToast === 'function') {
            window.showToast(msg, 'error');
          }
        }
      };
    },

    /** Execute an async operation with error handling (one-shot). */
    async run(fn, label) {
      try {
        return await fn();
      } catch (err) {
        const msg = label ? `${label}: ${err.message}` : err.message;
        console.error(`[LifeFlow] ${msg}`, err);
        if (typeof window.showToast === 'function') {
          window.showToast(msg, 'error');
        }
      }
    }
  };
})();
