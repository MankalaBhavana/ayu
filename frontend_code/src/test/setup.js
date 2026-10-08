// Intentionally minimal setup for Vitest + JSDOM unit tests.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// App.tsx now drives page navigation off window.location.pathname (real
// paths like "/pharmacy-purchases-pr" instead of "?page=..."). JSDOM's
// `window.location` persists across tests, so without this reset a
// pushState/replaceState call in one test can leak into the next and
// change which page a freshly mounted <App /> resolves to on load.
beforeEach(() => {
  window.history.replaceState({}, "", "/");
});
