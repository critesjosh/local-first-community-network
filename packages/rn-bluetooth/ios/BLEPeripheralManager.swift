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

  // MARK: - Initialization

  override private init() {
    super.init()
  }

@objc public func initialize() {
    peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
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
    print("[BLEPeripheralManager] Profile data set: \(profileJson)")
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

    // Setup GATT service if not already done
    if service == nil {
      setupGattService()
    }

    // Build advertisement data
    let advertisementData = buildAdvertisementData(
      displayName: displayName,
      userHashHex: userHashHex,
      followTokenHex: followTokenHex
    )

    // Start advertising
    print("[BLEPeripheralManager] Starting advertising now...")
    peripheralManager.startAdvertising(advertisementData)
    isAdvertising = true
    print("[BLEPeripheralManager] Advertisement started")
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
    // Create Profile characteristic (READ)
    profileCharacteristic = CBMutableCharacteristic(
      type: PROFILE_CHAR_UUID,
      properties: [.read],
      value: nil, // Dynamic value
      permissions: [.readable]
    )

    // Create Handshake characteristic (WRITE)
    handshakeCharacteristic = CBMutableCharacteristic(
      type: HANDSHAKE_CHAR_UUID,
      properties: [.write],
      value: nil,
      permissions: [.writeable]
    )

    // Create service
    service = CBMutableService(type: SERVICE_UUID, primary: true)
    service.characteristics = [profileCharacteristic, handshakeCharacteristic]

    // Add service to peripheral manager
    peripheralManager.add(service)
    print("[BLEPeripheralManager] GATT service added")
  }

  // MARK: - Advertisement Data Builder

  private func buildAdvertisementData(
    displayName: String,
    userHashHex: String,
    followTokenHex: String
  ) -> [String: Any] {
    print("[BLEPeripheralManager] 📦 Building advertisement data...")
    var advertisementData: [String: Any] = [:]

    // Add service UUID
    advertisementData[CBAdvertisementDataServiceUUIDsKey] = [SERVICE_UUID]
    print("  - Service UUID: \(SERVICE_UUID.uuidString)")

    // Encode data in local name (iOS doesn't allow custom manufacturer data)
    // Format: "LCNS:<displayName>:<userHash>:<followToken>"
    let normalizedName = normalizeName(displayName)
    let encodedName = "LCNS:\(normalizedName):\(userHashHex):\(followTokenHex)"
    advertisementData[CBAdvertisementDataLocalNameKey] = encodedName
    print("  - Local name: \(encodedName)")

    print("  - Advertisement ready to broadcast")
    return advertisementData
  }

  private func buildManufacturerData(
    displayName: String,
    userHashHex: String,
    followTokenHex: String
  ) -> Data {
    print("[BLEPeripheralManager] 🏗️ Building manufacturer data:")
    print("  - displayName: \(displayName)")
    print("  - userHashHex: \(userHashHex)")
    print("  - followTokenHex: \(followTokenHex)")
    
    var data = Data()

    // Manufacturer ID (2 bytes, little-endian)
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
      
      // Setup GATT service when powered on
      if service == nil {
        setupGattService()
      }
      
      // Start any pending advertisement
      if let pending = pendingAdvertisement {
        print("[BLEPeripheralManager] Starting pending advertisement...")
        pendingAdvertisement = nil
        do {
          try startAdvertising(
            displayName: pending.displayName,
            userHashHex: pending.userHashHex,
            followTokenHex: pending.followTokenHex
          )
        } catch {
          print("[BLEPeripheralManager] Failed to start pending advertisement: \(error)")
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
      isAdvertising = false
      EventEmitter.shared?.sendError(
        message: "Failed to start advertising: \(error.localizedDescription)",
        code: "ADVERTISING_FAILED"
      )
    } else {
      print("[BLEPeripheralManager] ✅ Did start advertising successfully")
      if let name = currentDisplayName {
        print("[BLEPeripheralManager] Broadcasting as: \(name)")
      }
    }
  }

  public func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    if let error = error {
      print("[BLEPeripheralManager] Failed to add service: \(error.localizedDescription)")
      EventEmitter.shared?.sendError(
        message: "Failed to add GATT service: \(error.localizedDescription)",
        code: "SERVICE_ADD_FAILED"
      )
    } else {
      print("[BLEPeripheralManager] Service added successfully")
    }
  }

  // Handle read requests for Profile characteristic
  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    didReceiveRead request: CBATTRequest
  ) {
    if request.characteristic.uuid == PROFILE_CHAR_UUID {
      if let profileData = profileData {
        if request.offset > profileData.count {
          peripheral.respond(to: request, withResult: .invalidOffset)
          return
        }

        let range = request.offset..<profileData.count
        request.value = profileData.subdata(in: range)
        peripheral.respond(to: request, withResult: .success)
        print("[BLEPeripheralManager] Responded to profile read request")
      } else {
        peripheral.respond(to: request, withResult: .unlikelyError)
        print("[BLEPeripheralManager] No profile data available")
      }
    } else {
      peripheral.respond(to: request, withResult: .requestNotSupported)
    }
  }

  // Handle write requests for Handshake characteristic
  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    didReceiveWrite requests: [CBATTRequest]
  ) {
    for request in requests {
      if request.characteristic.uuid == HANDSHAKE_CHAR_UUID {
        guard let value = request.value else {
          peripheral.respond(to: request, withResult: .invalidAttributeValueLength)
          continue
        }

        // Parse follow request payload
        if let payloadJson = String(data: value, encoding: .utf8) {
          print("[BLEPeripheralManager] Received follow request: \(payloadJson)")

          // Emit event to JavaScript
          EventEmitter.shared?.sendFollowRequestReceived(
            fromDeviceId: "unknown", // iOS doesn't expose central identifier easily
            payloadJson: payloadJson
          )

          peripheral.respond(to: request, withResult: .success)
        } else {
          peripheral.respond(to: request, withResult: .unlikelyError)
        }
      } else {
        peripheral.respond(to: request, withResult: .requestNotSupported)
      }
    }
  }

  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    central: CBCentral,
    didSubscribeTo characteristic: CBCharacteristic
  ) {
    print("[BLEPeripheralManager] Central subscribed to characteristic: \(characteristic.uuid)")
  }

  public func peripheralManager(
    _ peripheral: CBPeripheralManager,
    central: CBCentral,
    didUnsubscribeFrom characteristic: CBCharacteristic
  ) {
    print("[BLEPeripheralManager] Central unsubscribed from characteristic: \(characteristic.uuid)")
  }
}
