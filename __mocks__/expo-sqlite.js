// Mock for expo-sqlite

const mockDatabase = {
  tables: {},

  execAsync: jest.fn(function(query) {
    // Simple mock that handles CREATE TABLE
    return Promise.resolve();
  }),

  runAsync: jest.fn(function(query, params = []) {
    // Simple mock for INSERT/UPDATE/DELETE
    return Promise.resolve({ changes: 1, lastInsertRowId: 1 });
  }),

  getFirstAsync: jest.fn(function(query, params = []) {
    // Mock for SELECT returning first row
    return Promise.resolve(null);
  }),

  getAllAsync: jest.fn(function(query, params = []) {
    // Mock for SELECT returning all rows
    return Promise.resolve([]);
  }),

  closeAsync: jest.fn(function() {
    return Promise.resolve();
  }),
};

export const openDatabaseAsync = jest.fn((name) => {
  return Promise.resolve(mockDatabase);
});

export const deleteDatabaseAsync = jest.fn((name) => {
  return Promise.resolve();
});

// Helper to reset mocks
export const _resetMocks = () => {
  mockDatabase.tables = {};
  jest.clearAllMocks();
};
