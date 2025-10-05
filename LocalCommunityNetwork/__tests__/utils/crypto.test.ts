/**
 * Tests for crypto utility functions
 */

import {
  uint8ArrayToHex,
  hexToUint8Array,
  generateRandomBytes,
  constantTimeCompare,
  generateUUID,
} from '../../src/utils/crypto';

describe('crypto utilities', () => {
  describe('uint8ArrayToHex', () => {
    it('should convert empty array to empty string', () => {
      expect(uint8ArrayToHex(new Uint8Array(0))).toBe('');
    });

    it('should convert single byte correctly', () => {
      expect(uint8ArrayToHex(new Uint8Array([0]))).toBe('00');
      expect(uint8ArrayToHex(new Uint8Array([15]))).toBe('0f');
      expect(uint8ArrayToHex(new Uint8Array([255]))).toBe('ff');
    });

    it('should convert multiple bytes correctly', () => {
      const input = new Uint8Array([0, 1, 15, 16, 255]);
      expect(uint8ArrayToHex(input)).toBe('00010f10ff');
    });

    it('should handle 32-byte array (typical for keys)', () => {
      const input = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        input[i] = i;
      }
      const result = uint8ArrayToHex(input);
      expect(result).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('hexToUint8Array', () => {
    it('should convert empty string to empty array', () => {
      const result = hexToUint8Array('');
      expect(result).toEqual(new Uint8Array(0));
    });

    it('should convert single byte hex correctly', () => {
      expect(hexToUint8Array('00')).toEqual(new Uint8Array([0]));
      expect(hexToUint8Array('0f')).toEqual(new Uint8Array([15]));
      expect(hexToUint8Array('ff')).toEqual(new Uint8Array([255]));
    });

    it('should convert multiple bytes correctly', () => {
      const result = hexToUint8Array('00010f10ff');
      expect(result).toEqual(new Uint8Array([0, 1, 15, 16, 255]));
    });

    it('should handle uppercase hex', () => {
      const result = hexToUint8Array('0A1B2C3D');
      expect(result).toEqual(new Uint8Array([10, 27, 44, 61]));
    });

    it('should throw error for odd length hex string', () => {
      expect(() => hexToUint8Array('abc')).toThrow('Invalid hex string');
    });

    it('should throw error for invalid hex characters', () => {
      expect(() => hexToUint8Array('gg')).toThrow();
    });
  });

  describe('hex round-trip', () => {
    it('should correctly convert back and forth', () => {
      const original = new Uint8Array([0, 128, 255, 64, 32, 16]);
      const hex = uint8ArrayToHex(original);
      const result = hexToUint8Array(hex);
      expect(result).toEqual(original);
    });
  });

  describe('generateRandomBytes', () => {
    it('should generate array of specified length', () => {
      const result = generateRandomBytes(16);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(16);
    });

    it('should generate different values', () => {
      const result1 = generateRandomBytes(32);
      const result2 = generateRandomBytes(32);

      // Very unlikely to be equal
      expect(result1).not.toEqual(result2);
    });

    it('should handle zero length', () => {
      const result = generateRandomBytes(0);
      expect(result).toEqual(new Uint8Array(0));
    });
  });

  describe('constantTimeCompare', () => {
    it('should return true for identical arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 5]);
      expect(constantTimeCompare(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      expect(constantTimeCompare(a, b)).toBe(false);
    });

    it('should return false for different length arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3, 4]);
      expect(constantTimeCompare(a, b)).toBe(false);
    });

    it('should return true for empty arrays', () => {
      const a = new Uint8Array(0);
      const b = new Uint8Array(0);
      expect(constantTimeCompare(a, b)).toBe(true);
    });

    it('should work with 32-byte keys', () => {
      const key1 = new Uint8Array(32);
      const key2 = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        key1[i] = i;
        key2[i] = i;
      }
      expect(constantTimeCompare(key1, key2)).toBe(true);

      key2[31] = 255;
      expect(constantTimeCompare(key1, key2)).toBe(false);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID v4', () => {
      const uuid = generateUUID();

      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('should generate different UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();

      expect(uuid1).not.toBe(uuid2);
    });

    it('should generate UUIDs with correct format', () => {
      const uuid = generateUUID();
      const parts = uuid.split('-');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toHaveLength(8);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(4);
      expect(parts[3]).toHaveLength(4);
      expect(parts[4]).toHaveLength(12);

      // Check version (4) in third group
      expect(parts[2][0]).toBe('4');

      // Check variant (10xx) in fourth group
      const variantChar = parseInt(parts[3][0], 16);
      expect(variantChar & 0xc).toBe(0x8); // 10xx pattern
    });

    it('should generate many unique UUIDs', () => {
      const uuids = new Set();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100); // All should be unique
    });
  });
});