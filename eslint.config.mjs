// Vaktbikkja: ESLint kjøres av build.mjs før appen bygges. Finner den en feil, stopper publiseringen.
export default [
  {
    files: ["app.source.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly", localStorage: "readonly", sessionStorage: "readonly",
        fetch: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
        console: "readonly", location: "readonly", history: "readonly", URL: "readonly", URLSearchParams: "readonly",
        Blob: "readonly", File: "readonly", FileReader: "readonly", Image: "readonly", FormData: "readonly", CustomEvent: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly", atob: "readonly", btoa: "readonly", Intl: "readonly",
        AbortController: "readonly", Notification: "readonly", performance: "readonly", getComputedStyle: "readonly",
        TextEncoder: "readonly", TextDecoder: "readonly", crypto: "readonly", alert: "readonly", confirm: "readonly",
        matchMedia: "readonly", ResizeObserver: "readonly", IntersectionObserver: "readonly", HTMLElement: "readonly",
        Event: "readonly", structuredClone: "readonly", queueMicrotask: "readonly", screen: "readonly", innerWidth: "readonly", innerHeight: "readonly",
        createImageBitmap: "readonly", OffscreenCanvas: "readonly", ClipboardItem: "readonly", MutationObserver: "readonly", DOMParser: "readonly", Response: "readonly", Request: "readonly", Headers: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { vars: "all", args: "none", caughtErrors: "none" }],
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-self-assign": "error",
      "no-unsafe-finally": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
    },
  },
];
