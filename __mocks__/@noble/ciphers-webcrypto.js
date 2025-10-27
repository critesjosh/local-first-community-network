// Mock for @noble/ciphers/webcrypto.js

export const randomBytes = jest.fn((length) => {
  // Return deterministic "random" bytes for testing
  return new Uint8Array(length).fill(42);
});
