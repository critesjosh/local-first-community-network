// Mock for expo-image-picker

export const MediaTypeOptions = {
  All: 'All',
  Videos: 'Videos',
  Images: 'Images',
};

export const requestMediaLibraryPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted', granted: true })
);

export const requestCameraPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted', granted: true })
);

export const launchImageLibraryAsync = jest.fn(() =>
  Promise.resolve({
    canceled: false,
    assets: [
      {
        uri: 'mock://image.jpg',
        width: 1024,
        height: 768,
        base64: 'mockBase64String',
      },
    ],
  })
);

export const launchCameraAsync = jest.fn(() =>
  Promise.resolve({
    canceled: false,
    assets: [
      {
        uri: 'mock://photo.jpg',
        width: 1024,
        height: 768,
        base64: 'mockBase64String',
      },
    ],
  })
);
