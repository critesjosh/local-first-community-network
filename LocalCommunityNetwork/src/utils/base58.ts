/**
 * Base58 encoding/decoding utilities for public key representation
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = ALPHABET.length;

export function encode(buffer: Uint8Array): string {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const digits = [0];

  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % BASE;
      carry = (carry / BASE) | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = (carry / BASE) | 0;
    }
  }

  // Count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    leadingZeros++;
  }

  // Build the encoded string
  let encoded = ALPHABET[0].repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    encoded += ALPHABET[digits[i]];
  }

  return encoded;
}

export function decode(encoded: string): Uint8Array {
  if (!encoded || encoded.length === 0) {
    return new Uint8Array(0);
  }

  // Count leading '1's (they represent leading zeros in the output)
  let leadingZeros = 0;
  for (let i = 0; i < encoded.length && encoded[i] === ALPHABET[0]; i++) {
    leadingZeros++;
  }

  // Decode the rest
  const bytes = [0];
  for (let i = leadingZeros; i < encoded.length; i++) {
    const value = ALPHABET.indexOf(encoded[i]);
    if (value === -1) {
      throw new Error('Invalid base58 character');
    }

    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * BASE;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Add leading zeros and reverse
  const result = new Uint8Array(leadingZeros + bytes.length - 1);
  let j = 0;
  for (let i = 0; i < leadingZeros; i++) {
    result[j++] = 0;
  }
  for (let i = bytes.length - 1; i >= 1; i--) {
    result[j++] = bytes[i];
  }

  return result;
}