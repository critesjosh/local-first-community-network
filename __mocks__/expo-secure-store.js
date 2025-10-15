// Mock for expo-secure-store

const mockStorage = {};

export const setItemAsync = jest.fn((key, value) => {
  mockStorage[key] = value;
  return Promise.resolve();
});

export const getItemAsync = jest.fn((key) => {
  return Promise.resolve(mockStorage[key] || null);
});

export const deleteItemAsync = jest.fn((key) => {
  delete mockStorage[key];
  return Promise.resolve();
});

export const clearAll = () => {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
};
