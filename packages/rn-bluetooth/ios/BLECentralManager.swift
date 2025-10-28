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

  private let RSSI_THRESHOLD: Int = -85  // More permissive for better discovery (~10 meters)
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
  private var pendingConnections: [UUID: (Error?) -> Void] = [:]
  
  // State management
  private var stateCallbacks: [(CBManagerState) -> Void] = []
  private var isReady: Bool {
    return centralManager?.state == .poweredOn
  }

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
    print("[BLECentralManager] 🔧 CBCentralManager created - waiting for state update...")
  }
  
  /// Wait for Bluetooth to be powered on (async)
  private func waitForPoweredOn() async throws {
    // Already powered on?
    if centralManager.state == .poweredOn {
      print("[BLECentralManager] Already powered on")
      return
    }
    
    print("[BLECentralManager] Waiting for Bluetooth to power on... (current state: \(centralManager.state.rawValue))")
    
    return try await withCheckedThrowingContinuation { continuation in
      // Set a timeout
      let timeoutWorkItem = DispatchWorkItem {
        continuation.resume(throwing: NSError(
          domain: "com.rnbluetooth",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Bluetooth initialization timeout. Current state: \(self.centralManager.state.rawValue)"]
        ))
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 5.0, execute: timeoutWorkItem)
      
      // Register callback for state change
      stateCallbacks.append { state in
        timeoutWorkItem.cancel()
        if state == .poweredOn {
          continuation.resume()
        } else {
          var stateDescription = "Unknown"
          switch state {
          case .poweredOff:
            stateDescription = "Powered Off - Please turn on Bluetooth"
          case .resetting:
            stateDescription = "Resetting"
          case .unauthorized:
            stateDescription = "Unauthorized - Please grant Bluetooth permission"
          case .unsupported:
            stateDescription = "Unsupported - This device doesn't support Bluetooth LE"
          default:
            stateDescription = "Unknown (\(state.rawValue))"
          }
          
          continuation.resume(throwing: NSError(
            domain: "com.rnbluetooth",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not available: \(stateDescription)"]
          ))
        }
      }
      
      // If already in a final state (not .unknown), trigger callback immediately
      if centralManager.state != .unknown {
        let currentState = centralManager.state
        DispatchQueue.main.async {
          self.notifyStateCallbacks(currentState)
        }
      }
    }
  }
  
  private func notifyStateCallbacks(_ state: CBManagerState) {
    let callbacks = stateCallbacks
    stateCallbacks.removeAll()
    callbacks.forEach { $0(state) }
  }

  // MARK: - Scanning

  @objc public func startScanning() throws {
    print("[BLECentralManager] ⚡️ startScanning() called from Objective-C bridge")
    print("[BLECentralManager] startScanning called - state: \(centralManager.state.rawValue)")
    
    // Provide detailed error messages based on state
    guard centralManager.state == .poweredOn else {
      var errorMessage = "Bluetooth is not available"
      switch centralManager.state {
      case .poweredOff:
        errorMessage = "Bluetooth is turned off. Please enable Bluetooth in Settings."
      case .resetting:
        errorMessage = "Bluetooth is resetting. Please try again in a moment."
      case .unauthorized:
        errorMessage = "Bluetooth permission denied. Please grant Bluetooth access in Settings."
      case .unsupported:
        errorMessage = "This device doesn't support Bluetooth LE."
      case .unknown:
        errorMessage = "Bluetooth is initializing. Please wait a moment and try again."
      default:
        errorMessage = "Bluetooth is not ready (state: \(centralManager.state.rawValue))"
      }
      
      print("[BLECentralManager] ❌ Cannot scan: \(errorMessage)")
      throw NSError(
        domain: "com.rnbluetooth",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: errorMessage]
      )
    }

    if isScanning {
      print("[BLECentralManager] Already scanning, skipping")
      return
    }

    print("[BLECentralManager] ✅ Starting BLE scan for service: \(SERVICE_UUID)")
    print("[BLECentralManager]    Service UUID string: \(SERVICE_UUID.uuidString)")
    print("[BLECentralManager]    RSSI threshold: \(RSSI_THRESHOLD) dBm")
    print("[BLECentralManager]    Allow duplicates: true")
    isScanning = true
    let options: [String: Any] = [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ]
    // Scan specifically for our service UUID - iOS handles this more reliably
    centralManager.scanForPeripherals(
      withServices: [SERVICE_UUID],
      options: options
    )
    print("[BLECentralManager] 🔍 Scan started successfully")
    print("[BLECentralManager] 👂 Now listening for peripherals advertising service: \(SERVICE_UUID.uuidString)")
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

  @objc public func connect(deviceId: UUID, timeoutMs: Int, completion: @escaping (Error?) -> Void) {
    print("[BLECentralManager] 🔌 Connect requested for device: \(deviceId)")
    
    guard let peripheral = peripherals[deviceId] else {
      print("[BLECentralManager] ❌ Device not found in peripherals dictionary")
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Device not found"]
      ))
      return
    }

    // Check if already connected
    if peripheral.state == .connected {
      print("[BLECentralManager] ✅ Already connected")
      completion(nil)
      return
    }

    // Check if already connecting
    if peripheral.state == .connecting {
      print("[BLECentralManager] ⏳ Already connecting, queuing callback")
      // Store additional callback
      let existingCallback = pendingConnections[deviceId]
      pendingConnections[deviceId] = { error in
        existingCallback?(error)
        completion(error)
      }
      return
    }

    print("[BLECentralManager] Found peripheral, initiating connection...")
    EventEmitter.shared?.sendConnectionStateChanged(
      deviceId: deviceId.uuidString,
      state: "connecting"
    )

    // Store the completion callback
    pendingConnections[deviceId] = completion

    centralManager.connect(peripheral, options: nil)
    print("[BLECentralManager] Connection request sent to CoreBluetooth")

    // Connection timeout
    if timeoutMs > 0 {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [weak self] in
        guard let self = self else { return }
        if peripheral.state != .connected {
          print("[BLECentralManager] ⏰ Connection timeout")
          self.centralManager.cancelPeripheralConnection(peripheral)
          
          // Call pending completion with timeout error
          if let callback = self.pendingConnections.removeValue(forKey: deviceId) {
            callback(NSError(
              domain: "com.rnbluetooth",
              code: 2,
              userInfo: [NSLocalizedDescriptionKey: "Connection timeout"]
            ))
          }
          
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
    EventEmitter.shared?.sendDebug(message: "[NATIVE] readProfileInternal called for device: \(deviceId)", category: "central")
    
    guard let peripheral = peripherals[deviceId] else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Device not found in peripherals", category: "central")
      completion(.failure(NSError(
        domain: "com.rnbluetooth",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Device not found"]
      )))
      return
    }

    EventEmitter.shared?.sendDebug(message: "[NATIVE] Peripheral found, state: \(peripheral.state.rawValue), services: \(peripheral.services?.count ?? 0)", category: "central")
    
    // Set delegate explicitly in case it wasn't set
    if peripheral.delegate == nil {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] WARNING: Peripheral delegate was nil, setting now", category: "central")
      peripheral.delegate = self
    }
    
    guard peripheral.state == .connected else {
      print("[BLECentralManager] ❌ Device not connected (state: \(peripheral.state.rawValue))")
      completion(.failure(NSError(
        domain: "com.rnbluetooth",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Device not connected"]
      )))
      return
    }
    
    print("[BLECentralManager] ✅ Device is connected")

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
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Need to discover services, calling discoverServices...", category: "central")
      let key = makeKey(deviceId, SERVICE_UUID, PROFILE_CHAR_UUID)
      pendingReads[key] = { result in
        switch result {
        case .success(let data):
          if let jsonString = String(data: data, encoding: .utf8) {
            EventEmitter.shared?.sendDebug(message: "[NATIVE] Profile data received: \(jsonString.prefix(50))...", category: "central")
            completion(.success(jsonString))
          } else {
            EventEmitter.shared?.sendDebug(message: "[NATIVE] Failed to decode profile data", category: "central")
            completion(.failure(NSError(
              domain: "com.rnbluetooth",
              code: 4,
              userInfo: [NSLocalizedDescriptionKey: "Failed to decode profile data"]
            )))
          }
        case .failure(let error):
          EventEmitter.shared?.sendDebug(message: "[NATIVE] Error in pending read: \(error.localizedDescription)", category: "central")
          completion(.failure(error))
        }
      }
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Peripheral delegate set? \(peripheral.delegate != nil)", category: "central")
      peripheral.discoverServices([SERVICE_UUID])
      EventEmitter.shared?.sendDebug(message: "[NATIVE] discoverServices() call completed", category: "central")
    }
  }

  /// Internal Swift-style method
  private func writeFollowRequestInternal(
    deviceId: UUID,
    payloadJson: String,
    completion: @escaping (Error?) -> Void
  ) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE] writeFollowRequestInternal called for device: \(deviceId)", category: "central")
    EventEmitter.shared?.sendDebug(message: "[NATIVE] Payload length: \(payloadJson.count) chars", category: "central")
    
    guard let peripheral = peripherals[deviceId] else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ❌ Device not found in peripherals", category: "central")
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Device not found"]
      ))
      return
    }

    guard peripheral.state == .connected else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ❌ Device not connected (state: \(peripheral.state.rawValue))", category: "central")
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Device not connected"]
      ))
      return
    }

    guard let data = payloadJson.data(using: .utf8) else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ❌ Invalid JSON payload", category: "central")
      completion(NSError(
        domain: "com.rnbluetooth",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Invalid JSON payload"]
      ))
      return
    }

    EventEmitter.shared?.sendDebug(message: "[NATIVE] Payload encoded to \(data.count) bytes", category: "central")

    // Check if services and characteristics are discovered
    if let service = peripheral.services?.first(where: { $0.uuid == SERVICE_UUID }),
       let characteristic = service.characteristics?.first(where: { $0.uuid == HANDSHAKE_CHAR_UUID }) {
      // Already discovered, write directly
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ✅ Handshake characteristic found, writing \(data.count) bytes...", category: "central")
      let key = makeKey(deviceId, SERVICE_UUID, HANDSHAKE_CHAR_UUID)
      pendingWrites[key] = completion
      peripheral.writeValue(data, for: characteristic, type: .withResponse)
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ✅ writeValue() call completed", category: "central")
      
      // Subscribe to notifications to receive response
      print("[BLECentralManager] 🔔 Subscribing to handshake notifications to receive response")
      peripheral.setNotifyValue(true, for: characteristic)
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
          
          // Subscribe to notifications to receive response
          print("[BLECentralManager] 🔔 Subscribing to handshake notifications to receive response")
          peripheral.setNotifyValue(true, for: characteristic)
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
    print("[BLECentralManager] 📖 readProfile (ObjC wrapper) called for device: \(deviceId)")
    readProfileInternal(deviceId: deviceId) { result in
      print("[BLECentralManager] 📖 readProfileInternal completed with result")
      switch result {
      case .success(let jsonString):
        print("[BLECentralManager] ✅ Success, calling completion with data")
        completion(jsonString, nil)
      case .failure(let error):
        print("[BLECentralManager] ❌ Failure: \(error.localizedDescription)")
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
    print("[BLECentralManager] 📡 State changed to: \(central.state.rawValue)")
    
    // Notify any waiting callbacks
    notifyStateCallbacks(central.state)
    
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
    // Log ALL discovered peripherals for debugging
    print("[BLECentralManager] 📱 Discovered peripheral: \(peripheral.identifier)")
    print("[BLECentralManager]    Name: \(peripheral.name ?? "nil")")
    print("[BLECentralManager]    RSSI: \(RSSI) dBm")
    
    // Log all advertisement data keys to see what we're receiving
    print("[BLECentralManager]    Advertisement data keys: \(advertisementData.keys.joined(separator: ", "))")
    
    // Check if it has our service UUID
    if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
      let uuidStrings = serviceUUIDs.map { $0.uuidString }
      print("[BLECentralManager]    Service UUIDs: \(uuidStrings.joined(separator: ", "))")
      if serviceUUIDs.contains(SERVICE_UUID) {
        print("[BLECentralManager]    ✅ HAS OUR SERVICE UUID!")
      } else {
        print("[BLECentralManager]    ⚠️  Does not have our service UUID")
      }
    } else {
      print("[BLECentralManager]    ⚠️  No service UUIDs advertised")
    }
    
    // Filter by RSSI threshold
    if RSSI.intValue < RSSI_THRESHOLD {
      print("[BLECentralManager]    ⛔️ Filtered out: RSSI too weak (\(RSSI) < \(RSSI_THRESHOLD))")
      return
    }

    print("[BLECentralManager] ✅ Device passed RSSI threshold, processing...")

    // Store peripheral
    peripherals[peripheral.identifier] = peripheral
    peripheral.delegate = self

    // Parse local name data (iOS format for data transmission)
    var payload: [String: Any]?
    if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
      print("[BLECentralManager] Found local name: \(localName)")
      payload = parseLocalName(localName)
      if let displayName = payload?["displayName"] as? String {
        print("[BLECentralManager] ✅ Parsed device name: \(displayName)")
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

    print("[BLECentralManager] 📤 Emitting device discovered event to JavaScript")
    EventEmitter.shared?.sendDeviceDiscovered(
      deviceId: peripheral.identifier.uuidString,
      rssi: RSSI.intValue,
      payload: payload!
    )
  }

  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    print("[BLECentralManager] ✅ Successfully connected to peripheral: \(peripheral.identifier)")
    
    // Call pending connection callback
    if let callback = pendingConnections.removeValue(forKey: peripheral.identifier) {
      print("[BLECentralManager] Calling pending connection callback with success")
      callback(nil)
    }
    
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
    print("[BLECentralManager] ❌ Failed to connect to peripheral: \(peripheral.identifier)")
    
    // Call pending connection callback with error
    if let callback = pendingConnections.removeValue(forKey: peripheral.identifier) {
      print("[BLECentralManager] Calling pending connection callback with error")
      callback(error ?? NSError(
        domain: "com.rnbluetooth",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Connection failed"]
      ))
    }
    
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
    print("[BLECentralManager] 🔌 Disconnected from peripheral: \(peripheral.identifier)")
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
    EventEmitter.shared?.sendDebug(message: "[NATIVE] didDiscoverServices called!", category: "central")
    
    if let error = error {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Error discovering services: \(error.localizedDescription)", category: "central")
      return
    }

    guard let services = peripheral.services else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] No services found", category: "central")
      return
    }

    EventEmitter.shared?.sendDebug(message: "[NATIVE] Found \(services.count) service(s)", category: "central")

    for service in services where service.uuid == SERVICE_UUID {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Found our service, discovering characteristics...", category: "central")
      peripheral.discoverCharacteristics([PROFILE_CHAR_UUID, HANDSHAKE_CHAR_UUID], for: service)
    }
  }

  public func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE] didDiscoverCharacteristics called!", category: "central")
    
    if let error = error {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Error discovering characteristics: \(error.localizedDescription)", category: "central")
      return
    }

    guard let characteristics = service.characteristics else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] No characteristics found", category: "central")
      return
    }

    EventEmitter.shared?.sendDebug(message: "[NATIVE] Found \(characteristics.count) characteristic(s)", category: "central")

    for characteristic in characteristics {
      if characteristic.uuid == PROFILE_CHAR_UUID {
        let key = makeKey(peripheral.identifier, SERVICE_UUID, PROFILE_CHAR_UUID)
        if pendingReads[key] != nil {
          EventEmitter.shared?.sendDebug(message: "[NATIVE] Found pending read, reading profile now...", category: "central")
          peripheral.readValue(for: characteristic)
        } else {
          EventEmitter.shared?.sendDebug(message: "[NATIVE] No pending read for profile char", category: "central")
        }
      }
    }
  }

  public func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE] didUpdateValue called!", category: "central")
    let key = makeKey(peripheral.identifier, characteristic.service!.uuid, characteristic.uuid)

    if let error = error {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Error reading: \(error.localizedDescription)", category: "central")
      if let completion = pendingReads.removeValue(forKey: key) {
        completion(.failure(error))
      }
      return
    }

    guard let data = characteristic.value else {
      print("[BLECentralManager] ❌ No data in characteristic")
      EventEmitter.shared?.sendDebug(message: "[NATIVE] No data in characteristic", category: "central")
      if let completion = pendingReads.removeValue(forKey: key) {
        completion(.failure(NSError(
          domain: "com.rnbluetooth",
          code: 7,
          userInfo: [NSLocalizedDescriptionKey: "No data received"]
        )))
      }
      return
    }

    print("[BLECentralManager] 📥 Received \(data.count) bytes from characteristic \(characteristic.uuid)")
    
    // Log the actual data if it's the profile characteristic
    if characteristic.uuid == PROFILE_CHAR_UUID {
      if let jsonString = String(data: data, encoding: .utf8) {
        print("[BLECentralManager] 📝 Profile data length: \(jsonString.count) characters")
        print("[BLECentralManager] 📝 Profile data: \(jsonString)")
      } else {
        print("[BLECentralManager] ⚠️ Could not decode profile data as UTF-8")
      }
    }
    
    EventEmitter.shared?.sendDebug(message: "[NATIVE] Received \(data.count) bytes!", category: "central")

    // Handle handshake characteristic notifications
    if characteristic.uuid == HANDSHAKE_CHAR_UUID {
      if let responseJson = String(data: data, encoding: .utf8) {
        EventEmitter.shared?.sendConnectionResponseReceived(
          fromDeviceId: peripheral.identifier.uuidString,
          payloadJson: responseJson
        )
      }
    }

    // Complete pending read
    if let completion = pendingReads.removeValue(forKey: key) {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Calling completion handler", category: "central")
      completion(.success(data))
    } else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] No pending read handler", category: "central")
    }
  }

  public func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE] didWriteValueFor called!", category: "central")
    EventEmitter.shared?.sendDebug(message: "[NATIVE] Characteristic: \(characteristic.uuid)", category: "central")
    
    if let error = error {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ❌ Write failed: \(error.localizedDescription)", category: "central")
    } else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ✅ Write successful!", category: "central")
    }
    
    let key = makeKey(peripheral.identifier, characteristic.service!.uuid, characteristic.uuid)

    if let completion = pendingWrites.removeValue(forKey: key) {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] Calling pending write completion handler", category: "central")
      completion(error)
    } else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE] ⚠️ No pending write completion handler found", category: "central")
    }
  }
}
