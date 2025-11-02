/**
 * BLEPeripheralManager.swift
 * Handles BLE Peripheral role: advertising and GATT server
 */

import Foundation
import CoreBluetooth

@objc public class BLEPeripheralManager: NSObject {

  // MARK: - Constants (Hardcoded GATT Schema)

  private let SERVICE_UUID = CBUUID(string: "6e400001-b5a3-f393-e0a9-e50e24dcca9e")
  private let PROFILE_CHAR_UUID = CBUUID(string: "6e400002-b5a3-f393-e0a9-e50e24dcca9e")
  private let HANDSHAKE_CHAR_UUID = CBUUID(string: "6e400003-b5a3-f393-e0a9-e50e24dcca9e")

  // ⚠️ PRODUCTION WARNING: Company ID 0x1337 is TEST ONLY
  // Must obtain official Company Identifier from Bluetooth SIG before production release
  // See: docs/BLE_PRODUCTION_READINESS.md
  private let MANUFACTURER_ID: UInt16 = 0x1337
  private let BROADCAST_NAME_MAX_LENGTH = 12
  private let USER_HASH_LENGTH = 6
  private let FOLLOW_TOKEN_LENGTH = 4

  // MARK: - Properties

@objc public static let shared = BLEPeripheralManager()

  private var peripheralManager: CBPeripheralManager!
  private var service: CBMutableService!
  private var profileCharacteristic: CBMutableCharacteristic!
  private var handshakeCharacteristic: CBMutableCharacteristic!

  private var isAdvertising = false
  private var profileData: Data?
  private var isReady = false

  // Current advertisement data
  private var currentDisplayName: String?
  private var currentUserHashHex: String?
  private var currentFollowTokenHex: String?
  
  // Pending advertisement to start when powered on
  private var pendingAdvertisement: (displayName: String, userHashHex: String, followTokenHex: String)?
  
  // Track if GATT service has been added
  private var serviceAdded = false
  
  // Queue for pending notifications when central is not ready
  private var pendingNotifications: [(data: Data, characteristic: CBMutableCharacteristic)] = []

  // MARK: - Initialization

  override private init() {
    super.init()
  }

@objc public func initialize() {
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] initialize() called", category: "peripheral")
    
    // Reset state for clean initialization
    serviceAdded = false
    isReady = false
    service = nil
    
    peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Peripheral manager created, state: \(peripheralManager.state.rawValue)", category: "peripheral")
    
    // Check if already powered on (state might not trigger delegate if already ready)
    if peripheralManager.state == .poweredOn {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Already powered on at init, setting up service...", category: "peripheral")
      isReady = true
      setupGattService()
    }
  }

  // MARK: - Profile Data

@objc public func setProfileData(profileJson: String) throws {
    guard let data = profileJson.data(using: .utf8) else {
      throw NSError(
        domain: "com.rnbluetooth",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Invalid profile JSON"]
      )
    }
    profileData = data
    print("[BLEPeripheralManager] ✅ Profile data set (\(data.count) bytes): \(profileJson.prefix(100))...")
  }

  // MARK: - Advertising

  @objc public func startAdvertising(
    displayName: String,
    userHashHex: String,
    followTokenHex: String
  ) throws {
    print("[BLEPeripheralManager] ⚡️ startAdvertising() called from Objective-C bridge")
    print("[BLEPeripheralManager] startAdvertising called - state: \(peripheralManager.state.rawValue)")
    
    // If not powered on yet, queue the advertisement
    if peripheralManager.state != .poweredOn {
      print("[BLEPeripheralManager] Not powered on yet, queuing advertisement...")
      pendingAdvertisement = (displayName, userHashHex, followTokenHex)
      
      // Check if it's a permanent failure state
      if peripheralManager.state == .poweredOff {
        throw NSError(
          domain: "com.rnbluetooth",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Bluetooth is powered off. Please enable Bluetooth."]
        )
      } else if peripheralManager.state == .unauthorized {
        throw NSError(
          domain: "com.rnbluetooth",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Bluetooth permission denied. Please grant permission in Settings."]
        )
      } else if peripheralManager.state == .unsupported {
        throw NSError(
          domain: "com.rnbluetooth",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not supported on this device."]
        )
      }
      
      // Otherwise, it's just initializing - the delegate will call us back
      print("[BLEPeripheralManager] Bluetooth is initializing, will start advertising when ready")
      return
    }

    // Store current advertisement data
    currentDisplayName = displayName
    currentUserHashHex = userHashHex
    currentFollowTokenHex = followTokenHex

    // Check if service is already added to peripheral manager
    if !serviceAdded {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] startAdvertising: service not added, queueing...", category: "peripheral")
      setupGattService()
      // Queue the advertisement to start after service is added
      pendingAdvertisement = (displayName: displayName, userHashHex: userHashHex, followTokenHex: followTokenHex)
      return
    }
    
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] startAdvertising: service already added, proceeding...", category: "peripheral")

    // Build advertisement data
    let advertisementData = buildAdvertisementData(
      displayName: displayName,
      userHashHex: userHashHex,
      followTokenHex: followTokenHex
    )

    // Start advertising
    print("[BLEPeripheralManager] Starting advertising now...")
    print("[BLEPeripheralManager] Advertisement data: \(advertisementData)")
    peripheralManager.startAdvertising(advertisementData)
    isAdvertising = true
    
    // Verify advertising state
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      guard let self = self else { return }
      if self.peripheralManager.isAdvertising {
        print("[BLEPeripheralManager] ✅ Advertisement verified - actively advertising")
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Advertising verified active", category: "peripheral")
      } else {
        print("[BLEPeripheralManager] ⚠️ WARNING: Advertisement may not be active")
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ⚠️ Advertising state uncertain", category: "peripheral")
      }
    }
  }

@objc public func updateAdvertisement(
    displayName: String,
    userHashHex: String,
    followTokenHex: String
  ) throws {
    if !isAdvertising {
      throw NSError(
        domain: "com.rnbluetooth",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Not currently advertising"]
      )
    }

    // Store new advertisement data
    currentDisplayName = displayName
    currentUserHashHex = userHashHex
    currentFollowTokenHex = followTokenHex

    // Stop and restart with new data
    peripheralManager.stopAdvertising()

    let advertisementData = buildAdvertisementData(
      displayName: displayName,
      userHashHex: userHashHex,
      followTokenHex: followTokenHex
    )

    peripheralManager.startAdvertising(advertisementData)
    print("[BLEPeripheralManager] Updated advertisement")
  }

@objc public func stopAdvertising() {
    if isAdvertising {
      peripheralManager.stopAdvertising()
      isAdvertising = false
      print("[BLEPeripheralManager] Stopped advertising")
    }
  }

@objc public func getIsAdvertising() -> Bool {
    return isAdvertising
  }

  // MARK: - GATT Service Setup

  private func setupGattService() {
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] setupGattService() called", category: "peripheral")
    
    // Create Profile characteristic (READ)
    profileCharacteristic = CBMutableCharacteristic(
      type: PROFILE_CHAR_UUID,
      properties: [.read],
      value: nil, // Dynamic value
      permissions: [.readable]
    )

    // Create Handshake characteristic (WRITE + NOTIFY)
    handshakeCharacteristic = CBMutableCharacteristic(
      type: HANDSHAKE_CHAR_UUID,
      properties: [.write, .notify],
      value: nil,
      permissions: [.writeable]
    )

    // Create service
    service = CBMutableService(type: SERVICE_UUID, primary: true)
    service.characteristics = [profileCharacteristic, handshakeCharacteristic]

    // Add service to peripheral manager
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Adding service to peripheral manager...", category: "peripheral")
    peripheralManager.add(service)
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Service add() call completed, waiting for callback...", category: "peripheral")
  }

  // MARK: - Advertisement Data Builder

  /// Build iOS-compatible advertisement data
  ///
  /// **iOS Limitation:** iOS does NOT allow apps to set Manufacturer Specific Data
  /// or Service Data in advertisements. Only Service UUIDs and Local Name are allowed.
  ///
  /// **Solution:** Encode discovery data in Local Name using custom format:
  /// Format: "LCNS:<displayName>:<userHashHex>:<followTokenHex>"
  /// Example: "LCNS:Alice:a1b2c3d4e5f6:12345678"
  ///
  /// **Cross-Platform:** Android devices parse this Local Name format when scanning
  /// iOS devices. See BLECentralManager.parseLocalName() for parsing logic.
  ///
  /// - Parameters:
  ///   - displayName: User's display name (truncated to 12 chars)
  ///   - userHashHex: First 6 bytes of SHA-256(userId), hex encoded (12 chars)
  ///   - followTokenHex: Random 4-byte token, hex encoded (8 chars)
  /// - Returns: Advertisement data dictionary for CBPeripheralManager
  private func buildAdvertisementData(
    displayName: String,
    userHashHex: String,
    followTokenHex: String
  ) -> [String: Any] {
    print("[BLEPeripheralManager] 📦 Building advertisement data...")
    var advertisementData: [String: Any] = [:]

    // Add service UUID - THIS IS CRITICAL FOR DISCOVERY
    // Both iOS and Android devices filter scans by this UUID
    advertisementData[CBAdvertisementDataServiceUUIDsKey] = [SERVICE_UUID]
    print("  - Service UUID: \(SERVICE_UUID.uuidString)")
    print("  - ⚠️  IMPORTANT: This service UUID must match what scanners are looking for!")

    // Encode data in local name (iOS doesn't allow custom manufacturer data)
    // Format: "LCNS:<displayName>:<userHash>:<followToken>"
    // LCNS = Local Community Network Service (custom prefix)
    let normalizedName = normalizeName(displayName)
    let encodedName = "LCNS:\(normalizedName):\(userHashHex):\(followTokenHex)"
    advertisementData[CBAdvertisementDataLocalNameKey] = encodedName
    print("  - Local name: \(encodedName)")
    print("  - Local name length: \(encodedName.count) characters")

    print("  - ✅ Advertisement data complete:")
    print("    * Will advertise service: \(SERVICE_UUID.uuidString)")
    print("    * With device name: \(encodedName)")
    return advertisementData
  }

  /// ⚠️ UNUSED: Build manufacturer data (iOS CANNOT use this for advertising)
  ///
  /// **Why This Exists:**
  /// This function is kept as a REFERENCE for the Android manufacturer data format.
  /// It documents the binary structure that iOS must PARSE when scanning Android devices.
  ///
  /// **iOS Limitation:**
  /// iOS applications CANNOT set Manufacturer Specific Data in advertisements.
  /// This is an Apple platform restriction, not a CoreBluetooth limitation.
  ///
  /// **What iOS Does Instead:**
  /// iOS uses `buildAdvertisementData()` which encodes data in the Local Name field.
  ///
  /// **Manufacturer Data Format (Android uses this):**
  /// ```
  /// [Company ID: 2 bytes, little-endian - handled by platform]
  /// [version: 1 byte]
  /// [nameLength: 1 byte]
  /// [displayName: variable, max 12 bytes UTF-8]
  /// [userHash: 6 bytes]
  /// [followToken: 4 bytes]
  /// ```
  ///
  /// See: BLECentralManager.parseManufacturerData() for iOS parsing of Android advertisements
  /// See: packages/rn-bluetooth/android/.../BLEPeripheralManager.kt for actual Android usage
  ///
  /// - Returns: Manufacturer data payload (NOT used in iOS advertising)
  private func buildManufacturerData(
    displayName: String,
    userHashHex: String,
    followTokenHex: String
  ) -> Data {
    print("[BLEPeripheralManager] 🏗️ Building manufacturer data (REFERENCE ONLY - NOT USED FOR ADVERTISING):")
    print("  - displayName: \(displayName)")
    print("  - userHashHex: \(userHashHex)")
    print("  - followTokenHex: \(followTokenHex)")
    
    var data = Data()

    // Manufacturer ID (2 bytes, little-endian)
    // NOTE: In actual Android advertising, the platform handles this automatically
    // This is only here for documentation of the full format
    var manufacturerId = MANUFACTURER_ID
    data.append(Data(bytes: &manufacturerId, count: 2))

    // Version (1 byte)
    let version: UInt8 = 1
    data.append(version)

    // Name length and name bytes
    let normalizedName = normalizeName(displayName)
    let nameData = normalizedName.data(using: .utf8) ?? Data()
    let nameBytes = nameData.prefix(BROADCAST_NAME_MAX_LENGTH)
    let nameLength = UInt8(nameBytes.count)
    data.append(nameLength)
    data.append(nameBytes)
    
    print("  - Normalized name: '\(normalizedName)' (\(nameLength) bytes)")

    // User hash (6 bytes)
    if let userHashData = hexStringToData(userHashHex) {
      data.append(userHashData.prefix(USER_HASH_LENGTH))
      print("  - User hash: \(userHashData.prefix(USER_HASH_LENGTH).map { String(format: "%02x", $0) }.joined())")
    } else {
      // Fallback: append zeros
      data.append(Data(count: USER_HASH_LENGTH))
      print("  - User hash: ERROR - failed to parse hex string!")
    }

    // Follow token (4 bytes)
    if let tokenData = hexStringToData(followTokenHex) {
      data.append(tokenData.prefix(FOLLOW_TOKEN_LENGTH))
      print("  - Follow token: \(tokenData.prefix(FOLLOW_TOKEN_LENGTH).map { String(format: "%02x", $0) }.joined())")
    } else {
      // Fallback: append zeros
      data.append(Data(count: FOLLOW_TOKEN_LENGTH))
      print("  - Follow token: ERROR - failed to parse hex string!")
    }

    print("  - Total manufacturer data size: \(data.count) bytes")
    print("  - Raw hex: \(data.map { String(format: "%02x", $0) }.joined())")
    
    return data
  }

  // MARK: - Helper Methods

  private func normalizeName(_ name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    // Keep only ASCII printable characters (space through tilde)
    let printableAscii = CharacterSet(charactersIn: UnicodeScalar(32)...UnicodeScalar(126))
    return trimmed.unicodeScalars.filter { printableAscii.contains($0) }.map { String($0) }.joined()
  }

  private func hexStringToData(_ hex: String) -> Data? {
    var data = Data()
    var hex = hex

    // Remove any non-hex characters
    hex = hex.filter { "0123456789abcdefABCDEF".contains($0) }

    guard hex.count % 2 == 0 else { return nil }

    var index = hex.startIndex
    while index < hex.endIndex {
      let nextIndex = hex.index(index, offsetBy: 2)
      let byteString = String(hex[index..<nextIndex])
      guard let byte = UInt8(byteString, radix: 16) else { return nil }
      data.append(byte)
      index = nextIndex
    }

    return data
  }
}

// MARK: - CBPeripheralManagerDelegate

extension BLEPeripheralManager: CBPeripheralManagerDelegate {

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    print("[BLEPeripheralManager] State changed to: \(peripheral.state.rawValue)")
    
    switch peripheral.state {
    case .poweredOn:
      print("[BLEPeripheralManager] ✅ Peripheral manager powered on")
      isReady = true
      
      // Setup GATT service when powered on (if not already added)
      if !serviceAdded {
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Powered on, service not added yet, calling setupGattService...", category: "peripheral")
        setupGattService()
        // Pending advertisement will be started in didAdd service callback
      } else if let pending = pendingAdvertisement {
        // Service already added, start pending advertisement
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Service already added, starting pending ad...", category: "peripheral")
        pendingAdvertisement = nil
        do {
          try startAdvertising(
            displayName: pending.displayName,
            userHashHex: pending.userHashHex,
            followTokenHex: pending.followTokenHex
          )
        } catch {
          EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Failed to start ad: \(error)", category: "peripheral")
        }
      }
      
    case .poweredOff:
      print("[BLEPeripheralManager] ❌ Peripheral manager powered off")
      isReady = false
      if isAdvertising {
        isAdvertising = false
        EventEmitter.shared?.sendError(
          message: "Bluetooth was turned off",
          code: "BLUETOOTH_OFF"
        )
      }
    case .unauthorized:
      print("[BLEPeripheralManager] ❌ Bluetooth permission denied")
      isReady = false
      EventEmitter.shared?.sendError(
        message: "Bluetooth permission denied",
        code: "PERMISSION_DENIED"
      )
    case .unsupported:
      print("[BLEPeripheralManager] ❌ Bluetooth not supported")
      isReady = false
      EventEmitter.shared?.sendError(
        message: "Bluetooth not supported",
        code: "UNSUPPORTED"
      )
    case .resetting:
      print("[BLEPeripheralManager] ⚠️ Bluetooth is resetting...")
      isReady = false
    case .unknown:
      print("[BLEPeripheralManager] ⚠️ Bluetooth state unknown (initializing)...")
      isReady = false
    @unknown default:
      print("[BLEPeripheralManager] ⚠️ Unknown Bluetooth state")
      isReady = false
    }
  }

  public func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    if let error = error {
      print("[BLEPeripheralManager] ❌ Failed to start advertising: \(error.localizedDescription)")
      print("[BLEPeripheralManager]    Error code: \((error as NSError).code)")
      print("[BLEPeripheralManager]    Error domain: \((error as NSError).domain)")
      isAdvertising = false
      EventEmitter.shared?.sendError(
        message: "Failed to start advertising: \(error.localizedDescription)",
        code: "ADVERTISING_FAILED"
      )
    } else {
      print("[BLEPeripheralManager] ✅ Did start advertising successfully")
      print("[BLEPeripheralManager]    Peripheral state: \(peripheral.state.rawValue)")
      print("[BLEPeripheralManager]    isAdvertising: \(peripheral.isAdvertising)")
      if let name = currentDisplayName {
        print("[BLEPeripheralManager]    Broadcasting as: \(name)")
        print("[BLEPeripheralManager]    User hash: \(currentUserHashHex ?? "nil")")
        print("[BLEPeripheralManager]    Service UUID: \(SERVICE_UUID.uuidString)")
      }
      print("[BLEPeripheralManager] 📡 Other devices should now be able to discover this peripheral")
    }
  }

  public func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] didAdd service callback fired!", category: "peripheral")
    
    if let error = error {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ Failed to add service: \(error.localizedDescription)", category: "peripheral")
      pendingAdvertisement = nil
    } else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Service added! UUID: \(service.uuid.uuidString), chars: \(service.characteristics?.count ?? 0)", category: "peripheral")
      
      // Mark service as added
      serviceAdded = true
      
      // Start pending advertisement if there is one
      if let pending = pendingAdvertisement {
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Starting pending advertisement...", category: "peripheral")
        pendingAdvertisement = nil
        do {
          try startAdvertising(
            displayName: pending.displayName,
            userHashHex: pending.userHashHex,
            followTokenHex: pending.followTokenHex
          )
        } catch {
          EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Failed to start ad: \(error.localizedDescription)", category: "peripheral")
        }
      }
    }
  }

  // Handle read requests for Profile characteristic
  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    didReceiveRead request: CBATTRequest
  ) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] 📖 Received read request for char: \(request.characteristic.uuid)", category: "peripheral")
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH]    Service added: \(serviceAdded), Service: \(service?.uuid.uuidString ?? "nil")", category: "peripheral")
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH]    Offset: \(request.offset)", category: "peripheral")
    
    if request.characteristic.uuid == PROFILE_CHAR_UUID {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Request is for Profile characteristic", category: "peripheral")
      if let profileData = profileData {
        if request.offset > profileData.count {
          print("[BLEPeripheralManager] ❌ Invalid offset: \(request.offset) > \(profileData.count)")
          EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ Invalid offset: \(request.offset) > \(profileData.count)", category: "peripheral")
          peripheral.respond(to: request, withResult: .invalidOffset)
          return
        }

        // Calculate how much data to send
        // iOS CoreBluetooth automatically handles chunking, but we need to provide the full remaining data
        let remainingLength = profileData.count - request.offset
        let range = request.offset..<profileData.count
        let chunk = profileData.subdata(in: range)
        
        print("[BLEPeripheralManager] 📤 Profile read request - offset: \(request.offset), total: \(profileData.count), sending: \(chunk.count) bytes")
        
        // Log the actual data being sent for debugging
        if request.offset == 0 {
          if let previewString = String(data: chunk.prefix(200), encoding: .utf8) {
            print("[BLEPeripheralManager] 📝 Profile data (first 200 bytes): \(previewString)")
          }
          if let fullString = String(data: profileData, encoding: .utf8) {
            print("[BLEPeripheralManager] 📝 Full profile length: \(fullString.count) characters, \(profileData.count) bytes")
            print("[BLEPeripheralManager] 📝 Full profile: \(fullString)")
          }
        }
        
        request.value = chunk
        peripheral.respond(to: request, withResult: .success)
        print("[BLEPeripheralManager] ✅ Successfully responded with \(chunk.count) bytes")
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Responded with \(chunk.count) bytes (offset: \(request.offset))", category: "peripheral")
      } else {
        print("[BLEPeripheralManager] ❌ No profile data available!")
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ No profile data available!", category: "peripheral")
        peripheral.respond(to: request, withResult: .unlikelyError)
      }
    } else {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ Unknown characteristic requested", category: "peripheral")
      peripheral.respond(to: request, withResult: .requestNotSupported)
    }
  }

  // Handle write requests for Handshake characteristic
  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    didReceiveWrite requests: [CBATTRequest]
  ) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✍️ Received \(requests.count) write request(s)", category: "peripheral")
    
    for request in requests {
      EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Write to char: \(request.characteristic.uuid)", category: "peripheral")
      
      if request.characteristic.uuid == HANDSHAKE_CHAR_UUID {
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Write is for Handshake characteristic", category: "peripheral")
        
        guard let value = request.value else {
          EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ No value in write request", category: "peripheral")
          peripheral.respond(to: request, withResult: .invalidAttributeValueLength)
          continue
        }

        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] Received \(value.count) bytes", category: "peripheral")
        
        // Parse handshake payload (could be request or response)
        if let payloadJson = String(data: value, encoding: .utf8) {
          EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] 📥 Received handshake: \(payloadJson.prefix(100))...", category: "peripheral")

          // Parse JSON to determine type
          if let jsonData = payloadJson.data(using: .utf8),
             let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
             let type = json["type"] as? String {
            
            if type == "connection-request" {
              // This is a connection request
              EventEmitter.shared?.sendFollowRequestReceived(
                fromDeviceId: "unknown",
                payloadJson: payloadJson
              )
              EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Connection request event emitted", category: "peripheral")
            } else if type == "connection-response" {
              // This is a connection response
              EventEmitter.shared?.sendConnectionResponseReceived(
                fromDeviceId: "unknown",
                payloadJson: payloadJson
              )
              EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Connection response event emitted", category: "peripheral")
            } else {
              EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ⚠️ Unknown handshake type: \(type)", category: "peripheral")
            }
          } else {
            // Fallback: treat as connection request for backward compatibility
            EventEmitter.shared?.sendFollowRequestReceived(
              fromDeviceId: "unknown",
              payloadJson: payloadJson
            )
            EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ⚠️ No type field, treating as request", category: "peripheral")
          }

          peripheral.respond(to: request, withResult: .success)
        } else {
          EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ Failed to decode handshake data", category: "peripheral")
          peripheral.respond(to: request, withResult: .unlikelyError)
        }
      } else {
        EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ❌ Unknown characteristic for write", category: "peripheral")
        peripheral.respond(to: request, withResult: .requestNotSupported)
      }
    }
  }

  // When central subscribes to notifications
  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    central: CBCentral,
    didSubscribeTo characteristic: CBCharacteristic
  ) {
    print("[BLEPeripheralManager] 🔔 ===== SUBSCRIPTION EVENT =====")
    print("[BLEPeripheralManager] ✅ Central subscribed to: \(characteristic.uuid)")
    print("[BLEPeripheralManager]    Central ID: \(central.identifier)")
    print("[BLEPeripheralManager]    Max update value length: \(central.maximumUpdateValueLength)")
    
    if characteristic.uuid == HANDSHAKE_CHAR_UUID {
      print("[BLEPeripheralManager] 🎯 This is the HANDSHAKE characteristic - notifications are now ENABLED")
      print("[BLEPeripheralManager] 📱 Central can now receive connection responses")
    }
    
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] ✅ Central subscribed to: \(characteristic.uuid)", category: "peripheral")
  }
  
  // When central is ready to receive more data after updateValue returned false
  public func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    print("[BLEPeripheralManager] 📡 Central ready to receive - sending \(pendingNotifications.count) queued notification(s)")
    
    guard !pendingNotifications.isEmpty else {
      print("[BLEPeripheralManager] ℹ️ No pending notifications to send")
      return
    }
    
    // Try to send all queued notifications
    while !pendingNotifications.isEmpty {
      let (data, characteristic) = pendingNotifications.first!
      let success = peripheralManager.updateValue(data, for: characteristic, onSubscribedCentrals: nil)
      
      if success {
        print("[BLEPeripheralManager] ✅ Queued notification sent (\(data.count) bytes)")
        pendingNotifications.removeFirst()
      } else {
        print("[BLEPeripheralManager] ⚠️ Still not ready, will retry on next callback")
        print("[BLEPeripheralManager] 📝 Remaining queued: \(pendingNotifications.count)")
        break
      }
    }
    
    if pendingNotifications.isEmpty {
      print("[BLEPeripheralManager] ✅ All queued notifications sent successfully")
    }
  }
  
  // When central connects (not always called, but useful for debugging)
  public func peripheralManager(_ peripheral: CBPeripheralManager, willRestoreState dict: [String : Any]) {
    EventEmitter.shared?.sendDebug(message: "[NATIVE-PERIPH] willRestoreState called", category: "peripheral")
  }

  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    central: CBCentral,
    didUnsubscribeFrom characteristic: CBCharacteristic
  ) {
    print("[BLEPeripheralManager] ❌ Central unsubscribed from characteristic: \(characteristic.uuid)")
  }

  /// Send a connection response to subscribed centrals via notification
  @objc(sendConnectionResponse:)
  public func sendConnectionResponse(_ responseJson: String) {
    print("[BLEPeripheralManager] 📤 ===== SENDING CONNECTION RESPONSE =====")
    
    guard peripheralManager.state == .poweredOn else {
      print("[BLEPeripheralManager] ❌ Cannot send response - Bluetooth not powered on (state: \(peripheralManager.state.rawValue))")
      return
    }

    guard let data = responseJson.data(using: .utf8) else {
      print("[BLEPeripheralManager] ❌ Failed to encode response JSON")
      return
    }

    print("[BLEPeripheralManager] 📝 Response data: \(data.count) bytes")
    print("[BLEPeripheralManager] 📝 Response preview: \(responseJson.prefix(100))...")
    print("[BLEPeripheralManager] 🎯 Target characteristic: \(handshakeCharacteristic.uuid)")

    // Update characteristic value and notify subscribed centrals
    let success = peripheralManager.updateValue(
      data,
      for: handshakeCharacteristic,
      onSubscribedCentrals: nil // nil means notify all subscribed centrals
    )

    if success {
      print("[BLEPeripheralManager] ✅ ✅ ✅ Response notification sent successfully!")
      print("[BLEPeripheralManager] 📡 Notification was delivered to TX queue")
    } else {
      print("[BLEPeripheralManager] ⚠️ ⚠️ ⚠️ Central TX queue full - CANNOT send now")
      print("[BLEPeripheralManager] 📝 Queuing notification for retry when central is ready...")
      // Queue the notification to be sent when central is ready
      pendingNotifications.append((data, handshakeCharacteristic))
      print("[BLEPeripheralManager] 📝 Total queued notifications: \(pendingNotifications.count)")
    }
  }
}
