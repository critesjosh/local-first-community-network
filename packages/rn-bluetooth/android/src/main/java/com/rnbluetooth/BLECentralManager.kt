/**
 * BLECentralManager.kt
 * Handles BLE Central role: scanning, connecting, reading/writing characteristics
 */

package com.rnbluetooth

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.*

@SuppressLint("MissingPermission")
class BLECentralManager(
    private val reactContext: ReactApplicationContext,
    private val eventEmitter: EventEmitter
) {

    // MARK: - Constants (Hardcoded GATT Schema)

    companion object {
        private val SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
        private val PROFILE_CHAR_UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
        private val HANDSHAKE_CHAR_UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")

        // ⚠️ PRODUCTION WARNING: Company ID 0x1337 is TEST ONLY
        // Must obtain official Company Identifier from Bluetooth SIG before production release
        // See: docs/BLE_PRODUCTION_READINESS.md
        //
        // Note: When parsing, getManufacturerSpecificData() returns data WITHOUT the Company ID prefix
        // The Company ID is used as a filter key, and the returned data is just the payload
        private const val MANUFACTURER_ID = 0x1337
        private const val RSSI_THRESHOLD = -70
        private const val USER_HASH_LENGTH = 6
        private const val FOLLOW_TOKEN_LENGTH = 4
    }

    // MARK: - Properties

    private val bluetoothManager: BluetoothManager =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private val bluetoothLeScanner: BluetoothLeScanner? = bluetoothAdapter?.bluetoothLeScanner

    private var isScanning = false
    private val gattMap = mutableMapOf<String, BluetoothGatt>()

    // Pending operations
    private val pendingReads = mutableMapOf<String, Promise>()
    private val pendingWrites = mutableMapOf<String, Promise>()

    // MARK: - Scanning

    fun startScanning(promise: Promise) {
        val timestamp = System.currentTimeMillis()
        android.util.Log.d("BLECentralManager", "[$timestamp] startScanning called, isScanning=$isScanning")

        if (isScanning) {
            android.util.Log.d("BLECentralManager", "[$timestamp] Already scanning, resolving")
            promise.resolve(null)
            return
        }

        // Check if Bluetooth is enabled
        val isBluetoothEnabled = bluetoothAdapter?.isEnabled == true
        android.util.Log.d("BLECentralManager", "[$timestamp] Bluetooth enabled: $isBluetoothEnabled")

        if (!isBluetoothEnabled) {
            android.util.Log.d("BLECentralManager", "[$timestamp] ERROR: Bluetooth is disabled")
            promise.reject("bluetooth_disabled", "Bluetooth is disabled")
            return
        }

        // Check if Location Services are enabled (required for BLE scanning on Android)
        val locationManager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val isLocationEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            locationManager.isLocationEnabled
        } else {
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
        android.util.Log.d("BLECentralManager", "[$timestamp] Location Services enabled: $isLocationEnabled")

        if (!isLocationEnabled) {
            android.util.Log.d("BLECentralManager", "[$timestamp] WARNING: Location Services disabled - BLE scan may not work")
        }

        // Check runtime permissions
        val requiredPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ (API 31+)
            // IMPORTANT: ACCESS_FINE_LOCATION is STILL required on Android 12+ for BLE scan
            // callbacks to fire on many devices (Samsung, OnePlus, etc.)
            listOf(
                android.Manifest.permission.BLUETOOTH_SCAN,
                android.Manifest.permission.BLUETOOTH_CONNECT,
                android.Manifest.permission.ACCESS_FINE_LOCATION  // Critical for callback firing!
            )
        } else {
            // Android 11 and below
            listOf(android.Manifest.permission.ACCESS_FINE_LOCATION)
        }

        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(reactContext, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isNotEmpty()) {
            val permList = missingPermissions.joinToString(", ")
            android.util.Log.d("BLECentralManager", "[$timestamp] ERROR: Missing permissions: $permList")
            promise.reject("missing_permissions", "Missing required permissions: $permList")
            return
        }

        android.util.Log.d("BLECentralManager", "[$timestamp] ✅ All required permissions granted")

        if (bluetoothLeScanner == null) {
            android.util.Log.d("BLECentralManager", "[$timestamp] ERROR: Scanner not available")
            promise.reject("scanner_unavailable", "Bluetooth LE scanner not available")
            return
        }

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        // TEMPORARILY: Scan without hardware filter to debug
        // We'll filter by manufacturer ID in the callback instead
        // val scanFilter = ScanFilter.Builder()
        //     .setManufacturerData(
        //         MANUFACTURER_ID,
        //         ByteArray(0),  // Match any manufacturer data with our company ID
        //         ByteArray(0)   // No mask
        //     )
        //     .build()

        try {
            android.util.Log.d("BLECentralManager", "[$timestamp] Starting scan WITHOUT hardware filter (will filter in callback)")
            bluetoothLeScanner.startScan(null, scanSettings, scanCallback)
            isScanning = true
            android.util.Log.d("BLECentralManager", "[$timestamp] ✅ Scan started successfully")

            promise.resolve(null)
        } catch (e: Exception) {
            android.util.Log.d("BLECentralManager", "[$timestamp] ❌ Scan failed: ${e.message}")
            promise.reject("scan_error", "Failed to start scan: ${e.message}", e)
        }
    }

    fun stopScanning(promise: Promise) {
        if (!isScanning) {
            promise.resolve(null)
            return
        }

        try {
            bluetoothLeScanner?.stopScan(scanCallback)
            isScanning = false
            eventEmitter.sendScanStopped()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("stop_scan_error", "Failed to stop scan: ${e.message}", e)
        }
    }

    fun getIsScanning(): Boolean = isScanning

    init {
        // Log that the callback is initialized
        android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] 📍 BLECentralManager initialized, scanCallback ready")
        android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] 🔑 SERVICE_UUID: ${SERVICE_UUID}")
        android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] 🔑 This MUST match iOS Service UUID for cross-platform discovery!")
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val timestamp = System.currentTimeMillis()
            android.util.Log.d("BLECentralManager", "[$timestamp] onScanResult: device=${result.device.address}, rssi=${result.rssi}")

            // Filter by RSSI
            if (result.rssi < RSSI_THRESHOLD) {
                return
            }

            // Check if device advertises our Service UUID
            val serviceUuids = result.scanRecord?.serviceUuids
            val hasOurService = serviceUuids?.any { it.uuid == SERVICE_UUID } == true
            
            if (!hasOurService) {
                // Not our service, skip
                return
            }
            
            android.util.Log.d("BLECentralManager", "[$timestamp] ✅ Found device with our Service UUID")

            // Try to parse manufacturer data first (Android devices)
            val manufacturerData = result.scanRecord?.getManufacturerSpecificData(MANUFACTURER_ID)
            val payload = if (manufacturerData != null) {
                android.util.Log.d("BLECentralManager", "[$timestamp] Parsing Android-style manufacturer data: ${manufacturerData.size} bytes")
                val hexData = manufacturerData.joinToString("") { "%02x".format(it) }
                android.util.Log.d("BLECentralManager", "[$timestamp] Manufacturer data hex: $hexData")
                parseManufacturerData(manufacturerData)
            } else {
                // Try parsing iOS-style local name
                val localName = result.scanRecord?.deviceName
                android.util.Log.d("BLECentralManager", "[$timestamp] No manufacturer data, checking local name: $localName")
                if (localName != null) {
                    parseLocalName(localName)
                } else {
                    android.util.Log.d("BLECentralManager", "[$timestamp] ⚠️ Device has service UUID but no data - skipping")
                    return
                }
            }

            android.util.Log.d("BLECentralManager", "[$timestamp] ✅ Emitting deviceDiscovered event for ${result.device.address}")
            eventEmitter.sendDeviceDiscovered(
                deviceId = result.device.address,
                rssi = result.rssi,
                payload = payload
            )
        }

        override fun onScanFailed(errorCode: Int) {
            val timestamp = System.currentTimeMillis()
            android.util.Log.d("BLECentralManager", "[$timestamp] ❌ onScanFailed: errorCode=$errorCode")
            isScanning = false
            eventEmitter.sendError("Scan failed with error code: $errorCode", "SCAN_FAILED")
        }
    }

    // MARK: - Connection

    fun connect(deviceId: String, timeoutMs: Int, promise: Promise) {
        val device = bluetoothAdapter?.getRemoteDevice(deviceId)
        if (device == null) {
            promise.reject("device_not_found", "Device not found")
            return
        }

        eventEmitter.sendConnectionStateChanged(deviceId, "connecting")

        try {
            val gatt = device.connectGatt(
                reactContext,
                false, // autoConnect
                gattCallback,
                BluetoothDevice.TRANSPORT_LE
            )

            gattMap[deviceId] = gatt

            // Connection timeout
            if (timeoutMs > 0) {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    // Use BluetoothManager.getConnectionState() instead of deprecated GATT method
                    val currentState = bluetoothManager.getConnectionState(device, BluetoothProfile.GATT)
                    if (currentState != BluetoothProfile.STATE_CONNECTED) {
                        gatt.close()
                        gattMap.remove(deviceId)
                        eventEmitter.sendConnectionStateChanged(deviceId, "failed")
                    }
                }, timeoutMs.toLong())
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("connect_error", "Failed to connect: ${e.message}", e)
        }
    }

    fun disconnect(deviceId: String, promise: Promise) {
        val gatt = gattMap.remove(deviceId)
        gatt?.close()
        promise.resolve(null)
    }

    fun isConnected(deviceId: String): Boolean {
        val gatt = gattMap[deviceId] ?: return false
        return gatt.getDevice()?.let { device ->
            bluetoothManager.getConnectionState(device, BluetoothProfile.GATT) ==
                    BluetoothProfile.STATE_CONNECTED
        } ?: false
    }

    // MARK: - GATT Operations

    fun readProfile(deviceId: String, promise: Promise) {
        val gatt = gattMap[deviceId]
        if (gatt == null) {
            promise.reject("not_connected", "Device not connected")
            return
        }

        val service = gatt.getService(SERVICE_UUID)
        val characteristic = service?.getCharacteristic(PROFILE_CHAR_UUID)

        if (characteristic == null) {
            // Need to discover services first
            val key = makeKey(deviceId, PROFILE_CHAR_UUID)
            pendingReads[key] = promise
            gatt.discoverServices()
        } else {
            // Already discovered, read directly
            val key = makeKey(deviceId, PROFILE_CHAR_UUID)
            pendingReads[key] = promise
            gatt.readCharacteristic(characteristic)
        }
    }

    fun writeFollowRequest(deviceId: String, payloadJson: String, promise: Promise) {
        val gatt = gattMap[deviceId]
        if (gatt == null) {
            promise.reject("not_connected", "Device not connected")
            return
        }

        val data = payloadJson.toByteArray(Charsets.UTF_8)
        val service = gatt.getService(SERVICE_UUID)
        val characteristic = service?.getCharacteristic(HANDSHAKE_CHAR_UUID)

        if (characteristic == null) {
            // Need to discover services first
            val key = makeKey(deviceId, HANDSHAKE_CHAR_UUID)
            pendingWrites[key] = promise
            gatt.discoverServices()
        } else {
            // Already discovered, write directly
            val key = makeKey(deviceId, HANDSHAKE_CHAR_UUID)
            pendingWrites[key] = promise

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ (API 33+)
                gatt.writeCharacteristic(
                    characteristic,
                    data,
                    BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                )
            } else {
                // Android 12 and below
                @Suppress("DEPRECATION")
                characteristic.value = data
                @Suppress("DEPRECATION")
                characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                @Suppress("DEPRECATION")
                gatt.writeCharacteristic(characteristic)
            }
        }
    }

    // MARK: - GATT Callback

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val deviceId = gatt.device.address
            val state = when (newState) {
                BluetoothProfile.STATE_CONNECTED -> "connected"
                BluetoothProfile.STATE_CONNECTING -> "connecting"
                BluetoothProfile.STATE_DISCONNECTED -> "disconnected"
                else -> "failed"
            }

            eventEmitter.sendConnectionStateChanged(deviceId, state)

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                // Discover services when connected
                gatt.discoverServices()

                // Request MTU increase for larger payloads
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    gatt.requestMtu(512)
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                return
            }

            val deviceId = gatt.device.address

            // Check for pending read operations
            val readKey = makeKey(deviceId, PROFILE_CHAR_UUID)
            if (pendingReads.containsKey(readKey)) {
                val service = gatt.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(PROFILE_CHAR_UUID)
                if (characteristic != null) {
                    gatt.readCharacteristic(characteristic)
                } else {
                    val promise = pendingReads.remove(readKey)
                    promise?.reject("char_not_found", "Profile characteristic not found")
                }
            }

            // Check for pending write operations
            val writeKey = makeKey(deviceId, HANDSHAKE_CHAR_UUID)
            if (pendingWrites.containsKey(writeKey)) {
                val service = gatt.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(HANDSHAKE_CHAR_UUID)
                if (characteristic != null) {
                    // The write will be performed in the next step
                    // For now, just signal that discovery is complete
                } else {
                    val promise = pendingWrites.remove(writeKey)
                    promise?.reject("char_not_found", "Handshake characteristic not found")
                }
            }
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
            status: Int
        ) {
            val deviceId = gatt.device.address
            val key = makeKey(deviceId, characteristic.uuid)
            val promise = pendingReads.remove(key)

            if (status == BluetoothGatt.GATT_SUCCESS) {
                val jsonString = String(value, Charsets.UTF_8)
                promise?.resolve(jsonString)
            } else {
                promise?.reject("read_failed", "Failed to read characteristic: status $status")
            }
        }

        @Deprecated("Deprecated in API 33")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            // For Android 12 and below
            val deviceId = gatt.device.address
            val key = makeKey(deviceId, characteristic.uuid)
            val promise = pendingReads.remove(key)

            if (status == BluetoothGatt.GATT_SUCCESS) {
                @Suppress("DEPRECATION")
                val value = characteristic.value
                val jsonString = String(value, Charsets.UTF_8)
                promise?.resolve(jsonString)
            } else {
                promise?.reject("read_failed", "Failed to read characteristic: status $status")
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            val deviceId = gatt.device.address
            val key = makeKey(deviceId, characteristic.uuid)
            val promise = pendingWrites.remove(key)

            if (status == BluetoothGatt.GATT_SUCCESS) {
                promise?.resolve(null)
            } else {
                promise?.reject("write_failed", "Failed to write characteristic: status $status")
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                println("[BLECentralManager] MTU changed to: $mtu")
            }
        }
    }

    // MARK: - Helper Methods

    private fun makeKey(deviceId: String, charUuid: UUID): String {
        return "$deviceId#${charUuid}"
    }

    /**
     * Parse Android manufacturer data format (used by Android devices when advertising)
     *
     * **Company ID Handling:**
     * The data parameter does NOT include the 2-byte Company ID.
     * Android's getManufacturerSpecificData(MANUFACTURER_ID) returns only the payload.
     * The Company ID (0x1337) is used as a lookup key, not included in the returned data.
     *
     * **Binary Structure:**
     * ```
     * Offset  Size  Field          Description
     * ──────────────────────────────────────────────
     * 0       1     version        Protocol version (currently 1)
     * 1       1     nameLength     Length of display name in bytes
     * 2       N     displayName    UTF-8 encoded name (max 12 bytes)
     * 2+N     6     userHash       First 6 bytes of SHA-256(userId)
     * 8+N     4     followToken    Random 4-byte token
     * ```
     *
     * **Cross-Platform:**
     * Both iOS and Android use this function to parse Android advertisements.
     *
     * @param data Manufacturer data payload (WITHOUT Company ID prefix)
     * @return WritableMap with parsed fields for React Native
     */
    private fun parseManufacturerData(data: ByteArray): com.facebook.react.bridge.WritableMap {
        val result = Arguments.createMap()

        try {
            if (data.size < 2) {
                return result.apply {
                    putInt("version", 0)
                    putNull("displayName")
                    putString("userHashHex", "")
                    putString("followTokenHex", "")
                }
            }

            val version = data[0].toInt()
            val nameLength = data[1].toInt()

            val expectedLength = 2 + nameLength + USER_HASH_LENGTH + FOLLOW_TOKEN_LENGTH
            if (data.size < expectedLength) {
                return result.apply {
                    putInt("version", version)
                    putNull("displayName")
                    putString("userHashHex", "")
                    putString("followTokenHex", "")
                }
            }

            // Extract display name
            val displayName = if (nameLength > 0) {
                String(data, 2, nameLength, Charsets.UTF_8)
            } else {
                null
            }

            // Extract user hash
            val hashStart = 2 + nameLength
            val userHashBytes = data.slice(hashStart until (hashStart + USER_HASH_LENGTH))
            val userHashHex = userHashBytes.joinToString("") { "%02x".format(it) }

            // Extract follow token
            val tokenStart = hashStart + USER_HASH_LENGTH
            val followTokenBytes = data.slice(tokenStart until (tokenStart + FOLLOW_TOKEN_LENGTH))
            val followTokenHex = followTokenBytes.joinToString("") { "%02x".format(it) }

            result.putInt("version", version)
            if (displayName != null) {
                result.putString("displayName", displayName)
            } else {
                result.putNull("displayName")
            }
            result.putString("userHashHex", userHashHex)
            result.putString("followTokenHex", followTokenHex)
        } catch (e: Exception) {
            println("[BLECentralManager] Error parsing manufacturer data: ${e.message}")
            result.putInt("version", 0)
            result.putNull("displayName")
            result.putString("userHashHex", "")
            result.putString("followTokenHex", "")
        }

        return result
    }

    /**
     * Parse iOS local name format (used by iOS devices when advertising)
     *
     * **Format:** "LCNS:<displayName>:<userHashHex>:<followTokenHex>"
     * **Example:** "LCNS:Alice:a1b2c3d4e5f6:12345678"
     *
     * **Why Local Name?**
     * iOS cannot set Manufacturer Specific Data in advertisements (Apple restriction).
     * Instead, iOS encodes discovery data in the Local Name field using this custom format.
     *
     * **Cross-Platform:**
     * Both iOS and Android use this function to parse iOS advertisements.
     * LCNS = Local Community Network Service (custom prefix to identify our format)
     *
     * @param localName The device's local name from advertisement
     * @return WritableMap with parsed fields for React Native
     */
    private fun parseLocalName(localName: String): com.facebook.react.bridge.WritableMap {
        val result = Arguments.createMap()

        try {
            android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] Parsing iOS local name: $localName")
            
            // Check for LCNS prefix (iOS format)
            if (!localName.startsWith("LCNS:")) {
                android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] ⚠️ Not LCNS format - expected 'LCNS:' prefix")
                result.putInt("version", 0)
                result.putNull("displayName")
                result.putString("userHashHex", "")
                result.putString("followTokenHex", "")
                return result
            }
            
            // Remove "LCNS:" prefix and split by colon
            val dataString = localName.substring(5)  // Remove "LCNS:"
            val parts = dataString.split(":")
            
            if (parts.size != 3) {
                android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] ⚠️ Invalid LCNS format (expected 3 parts after prefix, got ${parts.size})")
                result.putInt("version", 1)
                result.putNull("displayName")
                result.putString("userHashHex", "")
                result.putString("followTokenHex", "")
                return result
            }

            val displayName = parts[0]
            val userHashHex = parts[1]
            val followTokenHex = parts[2]

            android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] ✅ Parsed iOS LCNS advertisement - displayName: $displayName, userHash: $userHashHex, followToken: $followTokenHex")

            result.putInt("version", 1)
            result.putString("displayName", displayName)
            result.putString("userHashHex", userHashHex)
            result.putString("followTokenHex", followTokenHex)
        } catch (e: Exception) {
            android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] ❌ Error parsing iOS local name: ${e.message}")
            result.putInt("version", 0)
            result.putNull("displayName")
            result.putString("userHashHex", "")
            result.putString("followTokenHex", "")
        }

        return result
    }
}
