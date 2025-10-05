/**
 * Tests for base58 encoding/decoding
 */

import * as base58 from '../../src/utils/base58';

describe('base58', () => {
  describe('encode', () => {
    it('should encode empty array to empty string', () => {
      const result = base58.encode(new Uint8Array(0));
      expect(result).toBe('');
    });

    it('should encode single zero byte', () => {
      const result = base58.encode(new Uint8Array([0]));
      expect(result).toBe('1');
    });

    it('should encode multiple zero bytes', () => {
      const result = base58.encode(new Uint8Array([0, 0, 0]));
      expect(result).toBe('111');
    });

    it('should encode known test vector', () => {
      const input = new Uint8Array([1, 2, 3, 4, 5]);
      const result = base58.encode(input);
      expect(result).toBe('7bWpTW');
    });

    it('should encode 32-byte public key', () => {
      const publicKey = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        publicKey[i] = i;
      }
      const result = base58.encode(publicKey);
      expect(result.length).toBeGreaterThanOrEqual(42); // Base58 encoded 32 bytes is typically 43-44 chars
      expect(result.length).toBeLessThanOrEqual(44);
      expect(result).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/); // Valid base58 characters

      // Verify round-trip
      const decoded = base58.decode(result);
      expect(decoded).toEqual(publicKey);
    });
  });

  describe('decode', () => {
    it('should decode empty string to empty array', () => {
      const result = base58.decode('');
      expect(result).toEqual(new Uint8Array(0));
    });

    it('should decode single "1" to zero byte', () => {
      const result = base58.decode('1');
      expect(result).toEqual(new Uint8Array([0]));
    });

    it('should decode multiple "1"s to zero bytes', () => {
      const result = base58.decode('111');
      expect(result).toEqual(new Uint8Array([0, 0, 0]));
    });

    it('should decode known test vector', () => {
      const result = base58.decode('7bWpTW');
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    it('should throw error for invalid characters', () => {
      expect(() => base58.decode('0OIl')).toThrow('Invalid base58 character');
      expect(() => base58.decode('Hello!')).toThrow('Invalid base58 character');
    });
  });

  describe('round-trip', () => {
    it('should correctly encode and decode random data', () => {
      const original = new Uint8Array([
        255, 128, 64, 32, 16, 8, 4, 2, 1, 0,
        100, 200, 150, 75, 25, 50, 175, 225
      ]);

      const encoded = base58.encode(original);
      const decoded = base58.decode(encoded);

      expect(decoded).toEqual(original);
    });

    it('should handle edge case with leading zeros', () => {
      const original = new Uint8Array([0, 0, 0, 1, 2, 3]);

      const encoded = base58.encode(original);
      const decoded = base58.decode(encoded);

      expect(decoded).toEqual(original);
    });
  });
});