# Testing Documentation

## Overview

This document describes the testing architecture and procedures for the Local Community Network React Native application. The test suite ensures the reliability and security of critical components, particularly the cryptographic identity system and data storage layers.

## Test Structure

```
LocalCommunityNetwork/
├── __tests__/
│   ├── setup.ts                    # Test environment setup and mocks
│   ├── services/
│   │   ├── crypto/
│   │   │   └── KeyManager.test.ts  # Ed25519 key operations
│   │   ├── storage/
│   │   │   ├── Database.test.ts    # SQLite database operations
│   │   │   └── SecureStorage.test.ts # Keychain/KeyStore operations
│   │   └── IdentityService.test.ts # Identity management
│   └── utils/
│       ├── base58.test.ts          # Base58 encoding/decoding
│       └── crypto.test.ts          # Crypto utility functions
```

## Running Tests

### All Tests
```bash
# From LocalCommunityNetwork directory
npm run test

# Or from project root
npm run mobile:test
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Test Coverage
```bash
npm run test:coverage
```

### Specific Test Suite
```bash
npm test -- KeyManager
npm test -- --testPathPattern=crypto
```

## Test Categories

### 1. Cryptographic Tests (`__tests__/services/crypto/`)

**KeyManager.test.ts**
- Ed25519 key pair generation
- Digital signature creation and verification
- Key serialization/deserialization
- Public key to user ID conversion

**Critical Security Validations:**
- Keys are 32 bytes (256 bits)
- Each key generation produces unique pairs
- Signature verification fails with tampered data
- Signature verification fails with wrong keys

### 2. Storage Tests (`__tests__/services/storage/`)

**SecureStorage.test.ts**
- Secure key storage in device keychain
- Key pair retrieval and deletion
- Biometry availability checks
- Round-trip storage integrity

**Database.test.ts**
- SQLite table creation
- User profile CRUD operations
- Connection management
- Event and message storage
- App state persistence
- Data clearing for factory reset

### 3. Identity Service Tests (`__tests__/services/`)

**IdentityService.test.ts**
- Complete identity creation flow
- Identity persistence and loading
- Profile management
- Data signing with identity
- Identity export (backup)
- Factory reset functionality

### 4. Utility Tests (`__tests__/utils/`)

**base58.test.ts**
- User ID encoding/decoding
- Leading zero handling
- Invalid character detection

**crypto.test.ts**
- Hex string conversion
- Random byte generation
- Constant-time comparison (timing attack prevention)

## Mock Setup

The test environment mocks React Native modules that aren't available in Jest:

```javascript
// __tests__/setup.ts
- react-native-keychain (Secure storage)
- react-native-sqlite-storage (Database)
- @react-native-async-storage/async-storage (App state)
- React Native core modules
```

## Testing Best Practices

### 1. Test Isolation
Each test should be independent:
```javascript
beforeEach(() => {
  jest.clearAllMocks();
  // Reset service state if needed
});
```

### 2. Comprehensive Coverage
Test both success and failure paths:
```javascript
it('should handle storage failure', async () => {
  mockStorage.mockRejectedValue(new Error('Storage error'));
  await expect(operation()).rejects.toThrow('Storage error');
});
```

### 3. Security-Critical Testing
For cryptographic operations, verify:
- Key uniqueness
- Signature validity
- Data integrity
- Timing attack resistance

### 4. Round-Trip Testing
Verify data integrity through complete cycles:
```javascript
const original = generateData();
const encoded = encode(original);
const decoded = decode(encoded);
expect(decoded).toEqual(original);
```

## Continuous Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd LocalCommunityNetwork && npm ci
      - run: cd LocalCommunityNetwork && npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hooks
Tests run automatically before commits:
```bash
# .husky/pre-commit
npm run mobile:test
```

## Coverage Requirements

Minimum coverage targets:
- **Statements**: 80%
- **Branches**: 75%
- **Functions**: 80%
- **Lines**: 80%

Critical components require 100% coverage:
- KeyManager
- SecureStorage
- Cryptographic utilities

## Debugging Tests

### Run Single Test
```javascript
it.only('should focus on this test', () => {
  // Test implementation
});
```

### Debug Output
```javascript
console.log('Debug:', JSON.stringify(result, null, 2));
```

### Inspect Mocks
```javascript
expect(mockFunction).toHaveBeenCalledWith(
  expect.objectContaining({
    key: expect.any(String),
    value: expect.any(Number)
  })
);
```

## Common Issues and Solutions

### Issue: "Cannot find module" errors
**Solution**: Ensure all dependencies are installed
```bash
cd LocalCommunityNetwork
npm install
```

### Issue: Mock not working
**Solution**: Check mock path matches import
```javascript
jest.mock('../../src/services/storage/SecureStorage');
```

### Issue: Async test timeout
**Solution**: Increase timeout for slow operations
```javascript
jest.setTimeout(10000); // 10 seconds
```

### Issue: Random test failures
**Solution**: Check for test interdependencies
```javascript
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});
```

## Adding New Tests

When adding new features:

1. **Write tests first** (TDD approach)
2. **Cover edge cases**
3. **Test error conditions**
4. **Verify security implications**
5. **Update this documentation**

Example test structure:
```javascript
describe('NewFeature', () => {
  describe('initialization', () => {
    it('should initialize with default values', () => {});
    it('should handle initialization errors', () => {});
  });

  describe('core functionality', () => {
    it('should perform main operation', () => {});
    it('should validate input', () => {});
    it('should handle edge cases', () => {});
  });

  describe('error handling', () => {
    it('should throw on invalid input', () => {});
    it('should recover from failures', () => {});
  });
});
```

## Performance Testing

For performance-critical code:
```javascript
it('should complete within time limit', async () => {
  const start = Date.now();
  await performOperation();
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(100); // 100ms
});
```

## Security Testing

Validate cryptographic operations:
```javascript
it('should resist timing attacks', () => {
  const times = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    constantTimeCompare(a, b);
    times.push(performance.now() - start);
  }
  const variance = calculateVariance(times);
  expect(variance).toBeLessThan(threshold);
});
```

## Maintenance

### Monthly Tasks
- Review and update test coverage
- Remove obsolete tests
- Update mock data
- Performance benchmarking

### Before Release
- Run full test suite
- Check coverage reports
- Review security tests
- Validate CI/CD pipeline

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)
- [Testing Library](https://testing-library.com/docs/react-native-testing-library/intro)
- [Coverage Reports](https://jestjs.io/docs/configuration#collectcoverage-boolean)