// jsdom provides localStorage, crypto, and fetch stubs.
// Silence Angular's dev-mode property check in test output.
Object.defineProperty(globalThis, 'ngDevMode', { value: false, writable: true });
