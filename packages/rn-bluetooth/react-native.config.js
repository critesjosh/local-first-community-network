module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.rnbluetooth.RNLCBluetoothPackage;',
      },
      ios: {
        podspecPath: './ios/RNLCBluetooth.podspec',
      },
    },
  },
};
