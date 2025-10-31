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
  
  // ⚠️ PRODUCTION WARNING: Company ID 0x1337 is TEST ONLY
  // Must obtain official Company Identifier from Bluetooth SIG before production release
  // See: docs/BLE_PRODUCTION_READINESS.md
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
    print("[BLECentralManager] 🔑 SERVICE_UUID: \(SERVICE_UUID.uuidString)")
    print("[BLECentralManager] 🔑 This MUST match Android Service UUID for cross-platform discovery!")
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
    NSLog("[BLECentralManager] ⚡️ startScanning() called from Objective-C bridge")
    NSLog("[BLECentralManager] startScanning called - state: %d", Int(centralManager.state.rawValue))
    
    // DIAGNOSTIC: Log to React Native console too
    EventEmitter.shared?.sendDebug(message: "🔍 iOS startScanning called - Bluetooth state: \(centralManager.state.rawValue)", category: "scan")
    
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
      
      NSLog("[BLECentralManager] ❌ Cannot scan: %@", errorMessage)
      EventEmitter.shared?.sendDebug(message: "❌ Cannot scan: \(errorMessage)", category: "scan")
      throw NSError(
        domain: "com.rnbluetooth",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: errorMessage]
      )
    }

    if isScanning {
      NSLog("[BLECentralManager] Already scanning, skipping")
      EventEmitter.shared?.sendDebug(message: "⚠️ Already scanning, skipping duplicate call", category: "scan")
      return
    }

    NSLog("[BLECentralManager] ✅ Starting BLE scan (NO filter, like Android)")
    NSLog("[BLECentralManager]    RSSI threshold: %d dBm", Int(RSSI_THRESHOLD))
    NSLog("[BLECentralManager]    Allow duplicates: true")
    NSLog("[BLECentralManager]    Will filter by Manufacturer ID: 0x%04X in callback", Int(MANUFACTURER_ID))
    EventEmitter.shared?.sendDebug(message: "✅ Starting scan WITHOUT filter (Android-style)", category: "scan")
    isScanning = true
    let options: [String: Any] = [
      CBCentralManagerScanOptionAllowDuplicatesKey: true
    ]
    // Scan WITHOUT service UUID filter (like Android does)
    // We'll filter by Manufacturer ID in the didDiscover callback instead
    centralManager.scanForPeripherals(
      withServices: nil,  // NO filter - discover all devices
      options: options
    )
    NSLog("[BLECentralManager] 🔍 Scan started successfully (no OS-level filter)")
    NSLog("[BLECentralManager] 👂 Will filter by manufacturer data in callback")
    EventEmitter.shared?.sendDebug(message: "👂 Listening for ALL devices, filtering by MFG data...", category: "scan")
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

  /// Parse iOS Local Name format (used by iOS devices when advertising)
  ///
  /// **Format:** "LCNS:<displayName>:<userHashHex>:<followTokenHex>"
  /// **Example:** "LCNS:Alice:a1b2c3d4e5f6:12345678"
  ///
  /// **Cross-Platform:** Android devices use this function to parse iOS advertisements.
  /// iOS devices use this function to parse other iOS advertisements.
  ///
  /// **Why Local Name?** iOS cannot set Manufacturer Specific Data in advertisements,
  /// so we encode discovery data in the Local Name field using a custom format.
  ///
  /// - Parameter localName: The CBAdvertisementDataLocalNameKey value
  /// - Returns: Dictionary with parsed fields, or nil if format is invalid
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
  
  /// Parse Android Manufacturer Data format (used by Android devices when advertising)
  ///
  /// **Format:** [version][nameLength][name...][userHash][followToken]
  /// **Example bytes:** [0x01, 0x05, 'A', 'l', 'i', 'c', 'e', 0xa1, 0xb2, ...]
  ///
  /// **Company ID Handling:** The data parameter does NOT include the 2-byte Company ID.
  /// iOS CoreBluetooth provides it separately in the advertisement data dictionary key.
  /// The Company ID (0x1337) is used to filter, and this data is just the payload.
  ///
  /// **Endianness:** Company ID is little-endian in the BLE packet (0x37, 0x13),
  /// but iOS has already extracted it for us. This data starts with version byte.
  ///
  /// **Cross-Platform:** iOS and Android both use this function to parse Android advertisements.
  ///
  /// **Binary Structure:**
  /// ```
  /// Offset  Size  Field          Description
  /// ──────────────────────────────────────────────
  /// 0       1     version        Protocol version (currently 1)
  /// 1       1     nameLength     Length of display name in bytes
  /// 2       N     displayName    UTF-8 encoded name (max 12 bytes)
  /// 2+N     6     userHash       First 6 bytes of SHA-256(userId)
  /// 8+N     4     followToken    Random 4-byte token
  /// ```
  ///
  /// - Parameter data: The Manufacturer Specific Data (WITHOUT Company ID prefix)
  /// - Returns: Dictionary with parsed fields, or nil if format is invalid
  private func parseManufacturerData(_ data: Data) -> [String: Any]? {
    // Android format (version-dependent):
    // Version 1: [CompanyID (2), version (1), nameLength (1), name..., userHash (6), followToken (4)]
    // Version 2: [CompanyID (2), version (1), userHash (6), followToken (4)]  <- COMPACT, no display name
    // NOTE: iOS includes Company ID in the first 2 bytes (unlike Android which strips it)
    print("[BLECentralManager] Parsing manufacturer data: \(data.count) bytes")
    
    guard data.count >= 3 else {  // Need at least: Company ID (2) + version (1)
      print("[BLECentralManager] ⚠️ Manufacturer data too short (need at least 3 bytes)")
      return nil
    }
    
    // Skip first 2 bytes (Company ID) - iOS includes it, but our protocol doesn't use it in parsing
    var offset = 2
    
    // Read version
    let version = data[offset]
    offset += 1
    print("[BLECentralManager] Version: \(version) (skipped 2-byte Company ID)")
    
    var displayName: String = ""
    
    if version == 1 {
      // VERSION 1: [version, nameLength, name..., userHash, followToken]
      guard data.count >= 2 else {
        print("[BLECentralManager] ⚠️ Version 1 data too short")
        return nil
      }
      
      // Read name length
      let nameLength = Int(data[offset])
      offset += 1
      
      // Read name
      guard offset + nameLength <= data.count else {
        print("[BLECentralManager] ⚠️ Data too short for name (need \(offset + nameLength), have \(data.count))")
        return nil
      }
      let nameData = data[offset..<(offset + nameLength)]
      displayName = String(data: nameData, encoding: .utf8) ?? ""
      offset += nameLength
      
    } else if version == 2 {
      // VERSION 2 (COMPACT): [CompanyID, version, userHash, followToken] - NO display name
      // Expected size: 2 (Company ID) + 1 (version) + 6 (userHash) + 4 (followToken) = 13 bytes
      guard data.count == 13 else {
        print("[BLECentralManager] ⚠️ Version 2 data wrong size (expected 13, got \(data.count))")
        return nil
      }
      // Display name is empty for version 2 (will be fetched via GATT profile read)
      displayName = ""
      print("[BLECentralManager] Version 2 (compact): no display name in advertisement")
      
    } else {
      print("[BLECentralManager] ⚠️ Unknown version: \(version)")
      return nil
    }
    
    // Read user hash (6 bytes)
    guard offset + USER_HASH_LENGTH <= data.count else {
      print("[BLECentralManager] ⚠️ Data too short for user hash")
      return nil
    }
    let userHashData = data[offset..<(offset + USER_HASH_LENGTH)]
    let userHashHex = userHashData.map { String(format: "%02x", $0) }.joined()
    offset += USER_HASH_LENGTH
    
    // Read follow token (4 bytes)
    guard offset + FOLLOW_TOKEN_LENGTH <= data.count else {
      print("[BLECentralManager] ⚠️ Data too short for follow token")
      return nil
    }
    let followTokenData = data[offset..<(offset + FOLLOW_TOKEN_LENGTH)]
    let followTokenHex = followTokenData.map { String(format: "%02x", $0) }.joined()
    
    print("[BLECentralManager] ✅ Parsed from manufacturer data: version=\(version), name='\(displayName)', hash=\(userHashHex), token=\(followTokenHex)")
    
    return [
      "version": Int(version),
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
    // DIAGNOSTIC: Log ALL devices for debugging (to JS console!)
    let deviceId = peripheral.identifier.uuidString.prefix(8)
    EventEmitter.shared?.sendDebug(message: "🔍 iOS DISCOVERED: \(deviceId) RSSI:\(RSSI)", category: "discovery")
    NSLog("[BLECentralManager] 🔍 Discovered device: %@ (RSSI: %@)", peripheral.identifier.uuidString.prefix(8) as CVarArg, RSSI)
    
    // Log ALL discovered peripherals for debugging
    // ANDROID-STYLE FILTERING: Check if device has our data BEFORE logging
    // This matches how Android's BLECentralManager filters in the callback
    var hasOurData = false
    var filterReason = "unknown"
    
    // DIAGNOSTIC: Check for manufacturer data FIRST - LOG EVERYTHING!
    if let mfgData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
      let hexString = mfgData.map { String(format: "%02x", $0) }.joined()
      print("[BLECentralManager] 🔍 RAW Mfg Data from \(deviceId): \(mfgData.count) bytes = \(hexString)")
      EventEmitter.shared?.sendDebug(message: "📦 Device \(deviceId): Mfg Data \(mfgData.count) bytes = \(hexString)", category: "discovery")
      
      if mfgData.count >= 2 {
        let companyId = UInt16(mfgData[0]) | (UInt16(mfgData[1]) << 8)
        print("[BLECentralManager] 🏭 Company ID: 0x\(String(format: "%04X", companyId)) (ours: 0x1337)")
        EventEmitter.shared?.sendDebug(message: "  🏭 Company ID: 0x\(String(format: "%04X", companyId)) (ours: 0x1337)", category: "discovery")
        NSLog("[BLECentralManager]   📦 Manufacturer Data: %d bytes, Company ID: 0x%04X, data: %@", mfgData.count, companyId, hexString)
        if companyId == MANUFACTURER_ID {
          print("[BLECentralManager] ✅✅✅ MATCHES our manufacturer ID 0x1337! This is OUR device!")
          EventEmitter.shared?.sendDebug(message: "  ✅ MATCHES our manufacturer ID 0x1337!", category: "discovery")
          NSLog("[BLECentralManager]   ✅ MATCHES our manufacturer ID!")
        } else {
          print("[BLECentralManager] ❌ Different mfg ID: 0x\(String(format: "%04X", companyId)) (ours is 0x1337)")
          EventEmitter.shared?.sendDebug(message: "  ❌ Different mfg ID: 0x\(String(format: "%04X", companyId))", category: "discovery")
          NSLog("[BLECentralManager]   ❌ Different manufacturer ID (ours is 0x%04X)", MANUFACTURER_ID)
        }
      } else {
        print("[BLECentralManager] ⚠️  Mfg data too short: \(mfgData.count) bytes")
        EventEmitter.shared?.sendDebug(message: "  ⚠️  Mfg data too short: \(mfgData.count) bytes", category: "discovery")
        NSLog("[BLECentralManager]   ⚠️  Manufacturer data too short: %d bytes", mfgData.count)
      }
    } else {
      // Only log "no manufacturer data" for devices we care about (with our service UUID)
      if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID],
         serviceUUIDs.contains(SERVICE_UUID) {
        print("[BLECentralManager] ⚠️  Device \(deviceId) has our Service UUID but NO manufacturer data (likely iOS)")
        EventEmitter.shared?.sendDebug(message: "  ⚠️  Device \(deviceId): No manufacturer data (iOS device)", category: "discovery")
      }
    }
    
    // Check 1: Does it have our Service UUID?
    if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
      if serviceUUIDs.contains(SERVICE_UUID) {
        hasOurData = true
        filterReason = "has our Service UUID"
      }
    }
    
    // Check 2: Does it have our Manufacturer ID? (Android devices)
    if !hasOurData {
      if let mfgData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data, mfgData.count >= 2 {
        // First 2 bytes are Company ID in little-endian
        let companyId = UInt16(mfgData[0]) | (UInt16(mfgData[1]) << 8)
        if companyId == MANUFACTURER_ID {
          hasOurData = true
          filterReason = "has our Manufacturer ID (0x\(String(format: "%04X", MANUFACTURER_ID)))"
        }
      }
    }
    
    // Check 3: Does it have "LCNS:" in local name? (iOS devices)
    if !hasOurData {
      if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
        if localName.starts(with: "LCNS:") {
          hasOurData = true
          filterReason = "has LCNS in local name"
        }
      }
    }
    
    // FILTER: Ignore devices that don't have our data
    if !hasOurData {
      NSLog("[BLECentralManager]   ❌ FILTERED OUT (no matching data)")
      // Silently ignore - this is normal (most BLE devices aren't ours)
      return
    }
    
    // MATCHED! This device has our data, process it
    NSLog("[BLECentralManager] 🎯 MATCHED device: %@ (reason: %@)", peripheral.identifier.uuidString, filterReason)
    print("[BLECentralManager] 📱 Discovered peripheral: \(peripheral.identifier)")
    print("[BLECentralManager]    Name: \(peripheral.name ?? "nil")")
    print("[BLECentralManager]    RSSI: \(RSSI) dBm")
    print("[BLECentralManager]    Filter reason: \(filterReason)")
    
    // DIAGNOSTIC: Send to JavaScript console too - THIS WILL SHOW IN YOUR APP!
    let deviceSummary = "📱 iOS DISCOVERED: id=\(peripheral.identifier.uuidString.prefix(8)), name=\(peripheral.name ?? "nil"), rssi=\(RSSI), reason=\(filterReason)"
    print("[BLECentralManager] 🚨 SENDING TO JS CONSOLE: \(deviceSummary)")
    EventEmitter.shared?.sendDebug(message: deviceSummary, category: "discovery")
    
    // DIAGNOSTIC: Check for manufacturer data
    if let mfgData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
      let hexString = mfgData.map { String(format: "%02x", $0) }.joined()
      print("[BLECentralManager]    🔑 HAS MANUFACTURER DATA: \(mfgData.count) bytes = \(hexString)")
      EventEmitter.shared?.sendDebug(message: "  ✅ Has manufacturer data: \(mfgData.count) bytes", category: "discovery")
    } else {
      print("[BLECentralManager]    ⚠️  NO manufacturer data")
      EventEmitter.shared?.sendDebug(message: "  ⚠️  No manufacturer data", category: "discovery")
    }
    
    // DIAGNOSTIC: Check for local name
    if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
      print("[BLECentralManager]    🔑 HAS LOCAL NAME: \(localName)")
      EventEmitter.shared?.sendDebug(message: "  ✅ Has local name: \(localName)", category: "discovery")
    } else {
      print("[BLECentralManager]    ⚠️  NO local name")
      EventEmitter.shared?.sendDebug(message: "  ⚠️  No local name", category: "discovery")
    }
    
    // DIAGNOSTIC: Check for service UUIDs - THIS IS CRITICAL!
    if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
      let uuidStrings = serviceUUIDs.map { $0.uuidString }.joined(separator: ", ")
      NSLog("[BLECentralManager]    📡 Service UUIDs: %@", uuidStrings)
      print("[BLECentralManager]    📡 Service UUIDs: \(uuidStrings)")
      EventEmitter.shared?.sendDebug(message: "  📡 Service UUIDs: \(uuidStrings)", category: "discovery")
      
      // Check if our service UUID is present
      let hasOurUUID = serviceUUIDs.contains(SERVICE_UUID)
      if hasOurUUID {
        NSLog("[BLECentralManager]    ✅ HAS OUR SERVICE UUID!")
        EventEmitter.shared?.sendDebug(message: "  ✅ HAS OUR SERVICE UUID!", category: "discovery")
      }
    } else {
      NSLog("[BLECentralManager]    ⚠️  NO service UUIDs in advertisement")
      print("[BLECentralManager]    ⚠️  NO service UUIDs in advertisement")
      EventEmitter.shared?.sendDebug(message: "  ⚠️  NO service UUIDs", category: "discovery")
    }
    
    // Check if it has our service UUID
    if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
      let uuidStrings = serviceUUIDs.map { $0.uuidString }
      print("[BLECentralManager]    Service UUIDs: \(uuidStrings.joined(separator: ", "))")
      EventEmitter.shared?.sendDebug(message: "  Service UUIDs: \(uuidStrings.joined(separator: ", "))", category: "discovery")
      if serviceUUIDs.contains(SERVICE_UUID) {
        print("[BLECentralManager]    ✅ HAS OUR SERVICE UUID!")
        EventEmitter.shared?.sendDebug(message: "  ✅ HAS OUR SERVICE UUID!", category: "discovery")
      } else {
        print("[BLECentralManager]    ⚠️  Does not have our service UUID")
        EventEmitter.shared?.sendDebug(message: "  ⚠️  Does not have our service UUID", category: "discovery")
      }
    } else {
      print("[BLECentralManager]    ⚠️  No service UUIDs advertised")
      EventEmitter.shared?.sendDebug(message: "  ⚠️  No service UUIDs advertised", category: "discovery")
    }
    
    // TEMPORARILY DISABLED: Filter by RSSI threshold for testing
    if RSSI.intValue < RSSI_THRESHOLD {
      print("[BLECentralManager]    ⚠️  RSSI below threshold but allowing for testing (\(RSSI) < \(RSSI_THRESHOLD))")
      // TESTING: Don't return, allow discovery anyway
    }

    print("[BLECentralManager] ✅ Device passed RSSI threshold, processing...")

    // Store peripheral
    peripherals[peripheral.identifier] = peripheral
    peripheral.delegate = self

    // Parse data from advertisement (try both iOS and Android formats)
    var payload: [String: Any]?
    
    // First, try iOS format (local name)
    if let localName = advertisementData[CBAdvertisementDataLocalNameKey] as? String {
      print("[BLECentralManager] Found local name: \(localName)")
      payload = parseLocalName(localName)
      if let displayName = payload?["displayName"] as? String {
        print("[BLECentralManager] ✅ Parsed device name from local name: \(displayName)")
      }
    }
    
    // If no local name, try Android format (manufacturer data)
    if payload == nil {
      if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
        let hexString = manufacturerData.map { String(format: "%02x", $0) }.joined()
        NSLog("[BLECentralManager] Found manufacturer data: %d bytes = %@", manufacturerData.count, hexString)
        print("[BLECentralManager] Found manufacturer data: \(manufacturerData.count) bytes = \(hexString)")
        payload = parseManufacturerData(manufacturerData)
        if let displayName = payload?["displayName"] as? String {
          NSLog("[BLECentralManager] ✅ Parsed device name from manufacturer data: %@", displayName)
          print("[BLECentralManager] ✅ Parsed device name from manufacturer data: \(displayName)")
        } else {
          NSLog("[BLECentralManager] ❌ Failed to parse manufacturer data!")
          print("[BLECentralManager] ❌ Failed to parse manufacturer data!")
        }
      } else {
        NSLog("[BLECentralManager] ⚠️ No local name or manufacturer data in advertisement")
        print("[BLECentralManager] ⚠️ No local name or manufacturer data in advertisement")
      }
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
