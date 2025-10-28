/**
 * Mock for react-native-ble-advertiser
 */

module.exports = {
  setCompanyId: jest.fn(),
  broadcast: jest.fn().mockResolvedValue('ok'),
  stopBroadcast: jest.fn().mockResolvedValue('stopped'),
  ADVERTISE_MODE_LOW_POWER: 0,
  ADVERTISE_MODE_BALANCED: 1,
  ADVERTISE_MODE_LOW_LATENCY: 2,
  ADVERTISE_TX_POWER_LOW: 0,
  ADVERTISE_TX_POWER_MEDIUM: 1,
  ADVERTISE_TX_POWER_HIGH: 2,
  ADVERTISE_TX_POWER_ULTRA_LOW: -1,
};

