/**
 * BLECentralManager.swift
 * Handles BLE Central role: scanning, connecting, reading/writing characteristics
 */

import Foundation
import CoreBluetooth

@objc public class BLECentralManager: NSObject {

  // MARK: - Constants (Hardcoded GATT Schema)

  private let SERVICE_UUID = CBUUID(string: "6e400001-b5a3-f393-e0a9-e50e24dcca9e")
  private let PROFILE_CHAR_UUID = CBUUID(string: "6e400002-b5a3-f393-e0a9-e50e24dcca9e")
  private let HANDSHAKE_CHAR_UUID = CBUUID(string: "6e400003-b5a3-f393-e0a9-e50e24dcca9e")

  private let RSSI_THRESHOLD: Int = -70
  private let MANUFACTURER_ID: UInt16 = 0x1337
  private let USER_HASH_LENGTH = 6
  private let FOLLOW_TOKEN_LENGTH = 4

  // MARK: - Properties

  @objc public static let shared = BLECentralManager()

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

  @objc public func initialize(restoreIdentifier: String? = nil) {
    var options: [String: Any] = [:]
    if let identifier = restoreIdentifier {
      options[CBCentralManagerOptionRestoreIdentifierKey] = identifier
    }
    centralManager = CBCentralManager(delegate: self, queue: nil, options: options)
  }

  // MARK: - Scanning

  @objc public func startScanning() throws {
    print("[BLECentralManager] ⚡️ startScanning() called from Objective-C bridge")
    print("[BLECentralManager] startScanning called - state: \(centralManager.state.rawValue)")
    
    guard centralManager.state == .poweredOn else {
      throw NSError(
        domain: "com.rnbluetooth",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not powered on"]
      )
    }

    if isScanning {
      print("[BLECentralManager] Already scanning, skipping")
      return
    }

    print("[BLECentralManager] ✅ Starting BLE scan for service: \(SERVICE_UUID)")
    isScanning = true
    let options: [String: Any] = [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ]
    centralManager.scanForPeripherals(
      withServices: [SERVICE_UUID],
      options: options
    )
    print("[BLECentralManager] 🔍 Scan started - listening for devices...")
  }

@objc public func stopScanning() {
    if !isScanning {
      print("[BLECentralManager] Not scanning, nothing to stop")
      return
    }
    print("[BLECentralManager] 🛑 Stopping BLE scan")
    centralManager.stopScan()
    isScanning = false
    EventEmitter.shared?.sendScanStopped()
  }

@objc public func getIsScanning() -> Bool {
    return isScanning
  }

  // MARK: - Connection

  @objc public func connect(deviceId: UUID, timeoutMs: Int) {
    print("[BLECentralManager] 🔌 Connect requested for device: \(deviceId)")
    
    guard let peripheral = peripherals[deviceId] else {
      print("[BLECentralManager] ❌ Device not found in peripherals dictionary")
      EventEmitter.shared?.sendError(
        message: "Device not found",
        code: "DEVICE_NOT_FOUND"
      )
      return
    }

    print("[BLECentralManager] Found peripheral, initiating connection...")
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: deviceId.uuidString,
      state: "connecting"
    )

    centralManager.connect(peripheral, options: nil)
    print("[BLECentralManager] Connection request sent to CoreBluetooth")

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

@objc public func disconnect(deviceId: UUID) {
    guard let peripheral = peripherals[deviceId] else {
      return
    }
    centralManager.cancelPeripheralConnection(peripheral)
  }

@objc public func isConnected(deviceId: UUID) -> Bool {
    guard let peripheral = peripherals[deviceId] else {
      return false
    }
    return peripheral.state == .connected
  }

  // MARK: - GATT Operations

  /// Internal Swift-style method using Result
  private func readProfileInternal(deviceId: UUID, completion: @escaping (Result<String, Error>) -> Void) {
    print("[BLECentralManager] 📖 readProfileInternal called for device: \(deviceId)")
    
    guard let peripheral = peripherals[deviceId] else {
      print("[BLECentralManager] ❌ Device not found in peripherals")
      completion(.failure(NSError(
        domain: "com.rnbluetooth",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Device not found"]
      )))
      return
    }

    print("[BLECentralManager] Peripheral state: \(peripheral.state.rawValue)")
    guard peripheral.state == .connected else {
      print("[BLECentralManager] ❌ Device not connected (state: \(peripheral.state.rawValue))")
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
      print("[BLECentralManager] 📖 Reading profile characteristic (already discovered)")
      let key = makeKey(deviceId, SERVICE_UUID, PROFILE_CHAR_UUID)
      pendingReads[key] = { result in
        switch result {
        case .success(let data):
          if let jsonString = String(data: data, encoding: .utf8) {
            print("[BLECentralManager] ✅ Profile data received: \(jsonString.prefix(100))...")
            completion(.success(jsonString))
          } else {
            print("[BLECentralManager] ❌ Failed to decode profile data as UTF-8")
            completion(.failure(NSError(
              domain: "com.rnbluetooth",
              code: 4,
              userInfo: [NSLocalizedDescriptionKey: "Failed to decode profile data"]
            )))
          }
        case .failure(let error):
          print("[BLECentralManager] ❌ Error reading profile: \(error.localizedDescription)")
          completion(.failure(error))
        }
      }
      peripheral.readValue(for: characteristic)
    } else {
      // Need to discover services first
      print("[BLECentralManager] 🔍 Discovering services before reading...")
      let key = makeKey(deviceId, SERVICE_UUID, PROFILE_CHAR_UUID)
      pendingReads[key] = { result in
        switch result {
        case .success(let data):
          if let jsonString = String(data: data, encoding: .utf8) {
            print("[BLECentralManager] ✅ Profile data received: \(jsonString.prefix(100))...")
            completion(.success(jsonString))
          } else {
            print("[BLECentralManager] ❌ Failed to decode profile data as UTF-8")
            completion(.failure(NSError(
              domain: "com.rnbluetooth",
              code: 4,
              userInfo: [NSLocalizedDescriptionKey: "Failed to decode profile data"]
            )))
          }
        case .failure(let error):
          print("[BLECentralManager] ❌ Error reading profile: \(error.localizedDescription)")
          completion(.failure(error))
        }
      }
      peripheral.discoverServices([SERVICE_UUID])
    }
  }

  /// Internal Swift-style method
  private func writeFollowRequestInternal(
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
      print("[BLECentralManager] ✍️ Writing to handshake characteristic (already discovered)")
      let key = makeKey(deviceId, SERVICE_UUID, HANDSHAKE_CHAR_UUID)
      pendingWrites[key] = completion
      peripheral.writeValue(data, for: characteristic, type: .withResponse)
    } else {
      // Need to discover services first
      print("[BLECentralManager] 🔍 Discovering services before writing...")
      peripheral.discoverServices([SERVICE_UUID])
      
      // Wait a moment for discovery to complete, then retry the write
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        if let service = peripheral.services?.first(where: { $0.uuid == self.SERVICE_UUID }),
           let characteristic = service.characteristics?.first(where: { $0.uuid == self.HANDSHAKE_CHAR_UUID }) {
          print("[BLECentralManager] ✍️ Writing to handshake characteristic (after discovery)")
          let key = self.makeKey(deviceId, self.SERVICE_UUID, self.HANDSHAKE_CHAR_UUID)
          self.pendingWrites[key] = completion
          peripheral.writeValue(data, for: characteristic, type: .withResponse)
        } else {
          print("[BLECentralManager] ❌ Handshake characteristic not found after discovery")
          completion(NSError(
            domain: "com.rnbluetooth",
            code: 6,
            userInfo: [NSLocalizedDescriptionKey: "Handshake characteristic not found after discovery"]
          ))
        }
      }
    }
  }

  // MARK: - Objective-C Bridge Methods
  
  /// Objective-C compatible wrapper for readProfile
  @objc public func readProfile(
    deviceId: UUID,
    completion: @escaping (String?, Error?) -> Void
  ) {
    readProfileInternal(deviceId: deviceId) { result in
      switch result {
      case .success(let jsonString):
        completion(jsonString, nil)
      case .failure(let error):
        completion(nil, error)
      }
    }
  }
  
  /// Objective-C compatible wrapper for writeFollowRequest
  @objc public func writeFollowRequest(
    deviceId: UUID,
    payloadJson: String,
    completion: @escaping (Error?) -> Void
  ) {
    writeFollowRequestInternal(deviceId: deviceId, payloadJson: payloadJson, completion: completion)
  }

  // MARK: - Helper Methods

  private func makeKey(_ deviceId: UUID, _ serviceUUID: CBUUID, _ charUUID: CBUUID) -> String {
    return "\(deviceId.uuidString)#\(serviceUUID.uuidString)#\(charUUID.uuidString)"
  }

  private func parseLocalName(_ localName: String) -> [String: Any]? {
    // Expected format: "LCNS:<displayName>:<userHash>:<followToken>"
    print("[BLECentralManager] Parsing local name: \(localName)")
    
    guard localName.hasPrefix("LCNS:") else {
      print("[BLECentralManager] ⚠️ Local name doesn't match LCNS format")
      return nil
    }
    
    let content = String(localName.dropFirst(5)) // Remove "LCNS:" prefix
    let components = content.split(separator: ":", maxSplits: 2, omittingEmptySubsequences: false)
    
    guard components.count == 3 else {
      print("[BLECentralManager] ⚠️ Invalid LCNS format: expected 3 components, got \(components.count)")
      return nil
    }
    
    let displayName = String(components[0])
    let userHashHex = String(components[1])
    let followTokenHex = String(components[2])
    
    print("[BLECentralManager] ✅ Parsed: name='\(displayName)', hash=\(userHashHex), token=\(followTokenHex)")
    
    return [
      "version": 1,
      "displayName": displayName.isEmpty ? NSNull() : displayName,
      "userHashHex": userHashHex,
      "followTokenHex": followTokenHex
    ]
  }
}

// MARK: - CBCentralManagerDelegate

extension BLECentralManager: CBCentralManagerDelegate {

  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    print("[BLECentralManager] State changed to: \(central.state.rawValue)")
    
    switch central.state {
    case .poweredOn:
      print("[BLECentralManager] ✅ Bluetooth powered on - ready to scan")
    case .poweredOff:
      print("[BLECentralManager] ❌ Bluetooth powered off")
      if isScanning {
        isScanning = false
        EventEmitter.shared?.sendError(message: "Bluetooth was turned off", code: "BLUETOOTH_OFF")
      }
    case .unauthorized:
      print("[BLECentralManager] ❌ Bluetooth permission denied")
      EventEmitter.shared?.sendError(message: "Bluetooth permission denied", code: "PERMISSION_DENIED")
    case .unsupported:
      print("[BLECentralManager] ❌ Bluetooth not supported")
      EventEmitter.shared?.sendError(message: "Bluetooth not supported", code: "UNSUPPORTED")
    case .resetting:
      print("[BLECentralManager] ⚠️ Bluetooth is resetting...")
    case .unknown:
      print("[BLECentralManager] ⚠️ Bluetooth state unknown (initializing)...")
    @unknown default:
      print("[BLECentralManager] ⚠️ Unknown Bluetooth state")
    }
  }

  public func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    print("[BLECentralManager] 📱 Discovered peripheral: \(peripheral.identifier) RSSI: \(RSSI) dBm")
    
    // Filter by RSSI threshold
    if RSSI.intValue < RSSI_THRESHOLD {
      print("[BLECentralManager] ⚠️ Filtered out: RSSI \(RSSI.intValue) below threshold \(RSSI_THRESHOLD)")
      return
    }

    // Store peripheral
    peripherals[peripheral.identifier] = peripheral
    peripheral.delegate = self

    // Parse local name data (iOS format for data transmission)
    var payload: [String: Any]?
    if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
      print("[BLECentralManager] Found local name: \(localName)")
      payload = parseLocalName(localName)
      if let displayName = payload?["displayName"] as? String {
        print("[BLECentralManager] ✅ Found device: \(displayName)")
      }
    } else {
      print("[BLECentralManager] ⚠️ No local name in advertisement")
    }

    // If no payload parsed, create empty one
    if payload == nil {
      print("[BLECentralManager] Creating empty payload for device")
      payload = [
        "version": 0,
        "displayName": NSNull(),
        "userHashHex": "",
        "followTokenHex": ""
      ]
    }

    print("[BLECentralManager] 📤 Emitting device discovered event")
    EventEmitter.shared?.sendDeviceDiscovered(
      deviceId: peripheral.identifier.uuidString,
      rssi: RSSI.intValue,
      payload: payload!
    )
  }

  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    print("[BLECentralManager] ✅ Successfully connected to peripheral: \(peripheral.identifier)")
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: peripheral.identifier.uuidString,
      state: "connected"
    )
    // Services will be discovered when needed (lazy discovery)
  }

  public func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: peripheral.identifier.uuidString,
      state: "failed"
    )
  }

  public func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: peripheral.identifier.uuidString,
      state: "disconnected"
    )
  }

  public func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
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

  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      print("[BLECentralManager] Error discovering services: \(error.localizedDescription)")
      return
    }

    guard let services = peripheral.services else { return }

    for service in services where service.uuid == SERVICE_UUID {
      peripheral.discoverCharacteristics([PROFILE_CHAR_UUID, HANDSHAKE_CHAR_UUID], for: service)
    }
  }

  public func peripheral(
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
      // Note: The actual write will be performed in writeFollowRequestInternal after discovery
    }
  }

  public func peripheral(
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

  public func peripheral(
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
