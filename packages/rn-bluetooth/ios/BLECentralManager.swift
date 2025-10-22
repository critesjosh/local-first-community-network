/**
 * BLECentralManager.swift
 * Handles BLE Central role: scanning, connecting, reading/writing characteristics
 */

import Foundation
import CoreBluetooth

class BLECentralManager: NSObject {

  // MARK: - Constants (Hardcoded GATT Schema)

  private let SERVICE_UUID = CBUUID(string: "6e400001-b5a3-f393-e0a9-e50e24dcca9e")
  private let PROFILE_CHAR_UUID = CBUUID(string: "6e400002-b5a3-f393-e0a9-e50e24dcca9e")
  private let HANDSHAKE_CHAR_UUID = CBUUID(string: "6e400003-b5a3-f393-e0a9-e50e24dcca9e")

  private let RSSI_THRESHOLD: Int = -70
  private let MANUFACTURER_ID: UInt16 = 0x1337
  private let USER_HASH_LENGTH = 6
  private let FOLLOW_TOKEN_LENGTH = 4

  // MARK: - Properties

  static let shared = BLECentralManager()

  private var centralManager: CBCentralManager!
  private var peripherals: [UUID: CBPeripheral] = [:]
  private var isScanning = false

  // Pending operations
  private var pendingReads: [String: (Result<Data, Error>) -> Void] = [:]
  private var pendingWrites: [String: (Error?) -> Void] = [:]

  // MARK: - Initialization

  override private init() {
    super.init()
  }

  func initialize(restoreIdentifier: String? = nil) {
    var options: [String: Any] = [:]
    if let identifier = restoreIdentifier {
      options[CBCentralManagerOptionRestoreIdentifierKey] = identifier
    }
    centralManager = CBCentralManager(delegate: self, queue: nil, options: options)
  }

  // MARK: - Scanning

  func startScanning() throws {
    guard centralManager.state == .poweredOn else {
      throw NSError(
        domain: "com.rnbluetooth",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not powered on"]
      )
    }

    if isScanning {
      return
    }

    isScanning = true
    let options: [String: Any] = [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ]
    centralManager.scanForPeripherals(
      withServices: [SERVICE_UUID],
      options: options
    )
  }

  func stopScanning() {
    if !isScanning {
      return
    }
    centralManager.stopScan()
    isScanning = false
    EventEmitter.shared?.sendScanStopped()
  }

  func getIsScanning() -> Bool {
    return isScanning
  }

  // MARK: - Connection

  func connect(deviceId: UUID, timeoutMs: Int) {
    guard let peripheral = peripherals[deviceId] else {
      EventEmitter.shared?.sendError(
        message: "Device not found",
        code: "DEVICE_NOT_FOUND"
      )
      return
    }

    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: deviceId.uuidString,
      state: "connecting"
    )

    centralManager.connect(peripheral, options: nil)

    // Connection timeout
    if timeoutMs > 0 {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [weak self] in
        guard let self = self else { return }
        if peripheral.state != .connected {
          self.centralManager.cancelPeripheralConnection(peripheral)
          EventEmitter.shared?.sendConnectionStateChanged(
            deviceId: deviceId.uuidString,
            state: "failed"
          )
        }
      }
    }
  }

  func disconnect(deviceId: UUID) {
    guard let peripheral = peripherals[deviceId] else {
      return
    }
    centralManager.cancelPeripheralConnection(peripheral)
  }

  func isConnected(deviceId: UUID) -> Bool {
    guard let peripheral = peripherals[deviceId] else {
      return false
    }
    return peripheral.state == .connected
  }

  // MARK: - GATT Operations

  func readProfile(deviceId: UUID, completion: @escaping (Result<String, Error>) -> Void) {
    guard let peripheral = peripherals[deviceId] else {
      completion(.failure(NSError(
        domain: "com.rnbluetooth",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Device not found"]
      )))
      return
    }

    guard peripheral.state == .connected else {
      completion(.failure(NSError(
        domain: "com.rnbluetooth",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Device not connected"]
      )))
      return
    }

    // Check if services and characteristics are discovered
    if let service = peripheral.services?.first(where: { $0.uuid == SERVICE_UUID }),
       let characteristic = service.characteristics?.first(where: { $0.uuid == PROFILE_CHAR_UUID }) {
      // Already discovered, read directly
      let key = makeKey(deviceId, SERVICE_UUID, PROFILE_CHAR_UUID)
      pendingReads[key] = { result in
        switch result {
        case .success(let data):
          if let jsonString = String(data: data, encoding: .utf8) {
            completion(.success(jsonString))
          } else {
            completion(.failure(NSError(
              domain: "com.rnbluetooth",
              code: 4,
              userInfo: [NSLocalizedDescriptionKey: "Failed to decode profile data"]
            )))
          }
        case .failure(let error):
          completion(.failure(error))
        }
      }
      peripheral.readValue(for: characteristic)
    } else {
      // Need to discover services first
      let key = makeKey(deviceId, SERVICE_UUID, PROFILE_CHAR_UUID)
      pendingReads[key] = { result in
        switch result {
        case .success(let data):
          if let jsonString = String(data: data, encoding: .utf8) {
            completion(.success(jsonString))
          } else {
            completion(.failure(NSError(
              domain: "com.rnbluetooth",
              code: 4,
              userInfo: [NSLocalizedDescriptionKey: "Failed to decode profile data"]
            )))
          }
        case .failure(let error):
          completion(.failure(error))
        }
      }
      peripheral.discoverServices([SERVICE_UUID])
    }
  }

  func writeFollowRequest(
    deviceId: UUID,
    payloadJson: String,
    completion: @escaping (Error?) -> Void
  ) {
    guard let peripheral = peripherals[deviceId] else {
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Device not found"]
      ))
      return
    }

    guard peripheral.state == .connected else {
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Device not connected"]
      ))
      return
    }

    guard let data = payloadJson.data(using: .utf8) else {
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Invalid JSON payload"]
      ))
      return
    }

    // Check if services and characteristics are discovered
    if let service = peripheral.services?.first(where: { $0.uuid == SERVICE_UUID }),
       let characteristic = service.characteristics?.first(where: { $0.uuid == HANDSHAKE_CHAR_UUID }) {
      // Already discovered, write directly
      let key = makeKey(deviceId, SERVICE_UUID, HANDSHAKE_CHAR_UUID)
      pendingWrites[key] = completion
      peripheral.writeValue(data, for: characteristic, type: .withResponse)
    } else {
      // Need to discover services first
      let key = makeKey(deviceId, SERVICE_UUID, HANDSHAKE_CHAR_UUID)
      pendingWrites[key] = { error in
        if let error = error {
          completion(error)
          return
        }
        // After discovery, perform the write
        if let service = peripheral.services?.first(where: { $0.uuid == self.SERVICE_UUID }),
           let characteristic = service.characteristics?.first(where: { $0.uuid == self.HANDSHAKE_CHAR_UUID }) {
          peripheral.writeValue(data, for: characteristic, type: .withResponse)
        } else {
          completion(NSError(
            domain: "com.rnbluetooth",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "Handshake characteristic not found"]
          ))
        }
      }
      peripheral.discoverServices([SERVICE_UUID])
    }
  }

  // MARK: - Helper Methods

  private func makeKey(_ deviceId: UUID, _ serviceUUID: CBUUID, _ charUUID: CBUUID) -> String {
    return "\(deviceId.uuidString)#\(serviceUUID.uuidString)#\(charUUID.uuidString)"
  }

  private func parseManufacturerData(_ data: Data) -> [String: Any]? {
    // Expected format: [version(1), nameLength(1), name(variable), userHash(6), followToken(4)]
    guard data.count >= 2 else { return nil }

    let version = data[0]
    let nameLength = Int(data[1])

    let expectedLength = 2 + nameLength + USER_HASH_LENGTH + FOLLOW_TOKEN_LENGTH
    guard data.count >= expectedLength else { return nil }

    var displayName: String? = nil
    if nameLength > 0 {
      let nameData = data.subdata(in: 2..<(2 + nameLength))
      displayName = String(data: nameData, encoding: .utf8)
    }

    let hashStart = 2 + nameLength
    let userHashData = data.subdata(in: hashStart..<(hashStart + USER_HASH_LENGTH))
    let userHashHex = userHashData.map { String(format: "%02x", $0) }.joined()

    let tokenStart = hashStart + USER_HASH_LENGTH
    let followTokenData = data.subdata(in: tokenStart..<(tokenStart + FOLLOW_TOKEN_LENGTH))
    let followTokenHex = followTokenData.map { String(format: "%02x", $0) }.joined()

    return [
      "version": Int(version),
      "displayName": displayName as Any,
      "userHashHex": userHashHex,
      "followTokenHex": followTokenHex
    ]
  }
}

// MARK: - CBCentralManagerDelegate

extension BLECentralManager: CBCentralManagerDelegate {

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      print("[BLECentralManager] Bluetooth powered on")
    case .poweredOff:
      print("[BLECentralManager] Bluetooth powered off")
      if isScanning {
        isScanning = false
        EventEmitter.shared?.sendError(message: "Bluetooth was turned off", code: "BLUETOOTH_OFF")
      }
    case .unauthorized:
      EventEmitter.shared?.sendError(message: "Bluetooth permission denied", code: "PERMISSION_DENIED")
    case .unsupported:
      EventEmitter.shared?.sendError(message: "Bluetooth not supported", code: "UNSUPPORTED")
    default:
      break
    }
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    // Filter by RSSI threshold
    if RSSI.intValue < RSSI_THRESHOLD {
      return
    }

    // Store peripheral
    peripherals[peripheral.identifier] = peripheral
    peripheral.delegate = self

    // Parse manufacturer data
    var payload: [String: Any]?
    if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
      // Check manufacturer ID (first 2 bytes)
      if manufacturerData.count >= 2 {
        let manufacturerId = manufacturerData.withUnsafeBytes { $0.load(fromByteOffset: 0, as: UInt16.self) }
        if manufacturerId == MANUFACTURER_ID {
          let payloadData = manufacturerData.subdata(in: 2..<manufacturerData.count)
          payload = parseManufacturerData(payloadData)
        }
      }
    }

    // If no manufacturer data payload, create empty one
    if payload == nil {
      payload = [
        "version": 0,
        "displayName": NSNull(),
        "userHashHex": "",
        "followTokenHex": ""
      ]
    }

    EventEmitter.shared?.sendDeviceDiscovered(
      deviceId: peripheral.identifier.uuidString,
      rssi: RSSI.intValue,
      payload: payload!
    )
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: peripheral.identifier.uuidString,
      state: "connected"
    )
    // Services will be discovered when needed (lazy discovery)
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: peripheral.identifier.uuidString,
      state: "failed"
    )
  }

  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: peripheral.identifier.uuidString,
      state: "disconnected"
    )
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
      for peripheral in peripherals {
        self.peripherals[peripheral.identifier] = peripheral
        peripheral.delegate = self
      }
    }
  }
}

// MARK: - CBPeripheralDelegate

extension BLECentralManager: CBPeripheralDelegate {

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      print("[BLECentralManager] Error discovering services: \(error.localizedDescription)")
      return
    }

    guard let services = peripheral.services else { return }

    for service in services where service.uuid == SERVICE_UUID {
      peripheral.discoverCharacteristics([PROFILE_CHAR_UUID, HANDSHAKE_CHAR_UUID], for: service)
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    if let error = error {
      print("[BLECentralManager] Error discovering characteristics: \(error.localizedDescription)")
      return
    }

    // After discovery, check if there are pending operations
    guard let characteristics = service.characteristics else { return }

    for characteristic in characteristics {
      // Check for pending read on profile characteristic
      if characteristic.uuid == PROFILE_CHAR_UUID {
        let key = makeKey(peripheral.identifier, SERVICE_UUID, PROFILE_CHAR_UUID)
        if pendingReads[key] != nil {
          peripheral.readValue(for: characteristic)
        }
      }

      // Check for pending write on handshake characteristic
      if characteristic.uuid == HANDSHAKE_CHAR_UUID {
        let key = makeKey(peripheral.identifier, SERVICE_UUID, HANDSHAKE_CHAR_UUID)
        if let writeCompletion = pendingWrites[key] {
          pendingWrites.removeValue(forKey: key)
          writeCompletion(nil) // Signal that discovery is complete
        }
      }
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    let key = makeKey(peripheral.identifier, characteristic.service!.uuid, characteristic.uuid)

    if let error = error {
      if let completion = pendingReads.removeValue(forKey: key) {
        completion(.failure(error))
      }
      return
    }

    guard let data = characteristic.value else {
      if let completion = pendingReads.removeValue(forKey: key) {
        completion(.failure(NSError(
          domain: "com.rnbluetooth",
          code: 7,
          userInfo: [NSLocalizedDescriptionKey: "No data received"]
        )))
      }
      return
    }

    // Complete pending read
    if let completion = pendingReads.removeValue(forKey: key) {
      completion(.success(data))
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    let key = makeKey(peripheral.identifier, characteristic.service!.uuid, characteristic.uuid)

    if let completion = pendingWrites.removeValue(forKey: key) {
      completion(error)
    }
  }
}
