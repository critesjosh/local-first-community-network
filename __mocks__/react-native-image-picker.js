// Mock for react-native-image-picker
export const launchImageLibrary = jest.fn(() =>
  Promise.resolve({
    didCancel: false,
    errorCode: null,
    errorMessage: null,
    assets: [
      {
        uri: 'file:///test-image.jpg',
        width: 1024,
        height: 768,
        fileSize: 12345,
        type: 'image/jpeg',
        fileName: 'test-image.jpg',
        base64: 'base64encodedstring',
      },
    ],
  })
);

export const launchCamera = jest.fn(() =>
  Promise.resolve({
    didCancel: false,
    errorCode: null,
    errorMessage: null,
    assets: [
      {
        uri: 'file:///test-camera-image.jpg',
        width: 1024,
        height: 768,
        fileSize: 12345,
        type: 'image/jpeg',
        fileName: 'test-camera-image.jpg',
        base64: 'base64encodedstring',
      },
    ],
  })
);
