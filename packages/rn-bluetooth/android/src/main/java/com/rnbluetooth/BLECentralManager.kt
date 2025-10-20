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
        eventEmitter.sendError("Bluetooth enabled: $isBluetoothEnabled", "SCAN_DEBUG")

        if (!isBluetoothEnabled) {
            android.util.Log.d("BLECentralManager", "[$timestamp] ERROR: Bluetooth is disabled")
            eventEmitter.sendError("ERROR: Bluetooth is disabled - please enable it in system settings", "SCAN_DEBUG")
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
        eventEmitter.sendError("Location Services enabled: $isLocationEnabled", "SCAN_DEBUG")

        if (!isLocationEnabled) {
            android.util.Log.d("BLECentralManager", "[$timestamp] WARNING: Location Services disabled - BLE scan may not work")
            eventEmitter.sendError("WARNING: Location Services are disabled - BLE scanning requires Location to be enabled in system settings", "SCAN_DEBUG")
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
            eventEmitter.sendError("ERROR: Missing Bluetooth permissions: $permList", "SCAN_DEBUG")
            promise.reject("missing_permissions", "Missing required permissions: $permList")
            return
        }

        android.util.Log.d("BLECentralManager", "[$timestamp] ✅ All required permissions granted")
        eventEmitter.sendError("✅ All Bluetooth permissions granted", "SCAN_DEBUG")

        if (bluetoothLeScanner == null) {
            android.util.Log.d("BLECentralManager", "[$timestamp] ERROR: Scanner not available")
            promise.reject("scanner_unavailable", "Bluetooth LE scanner not available")
            return
        }

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        // TEMPORARILY REMOVED FILTER FOR DEBUGGING - scan for ALL devices
        // Filter by manufacturer ID instead of service UUID to match advertising data
        // val scanFilter = ScanFilter.Builder()
        //     .setManufacturerData(
        //         MANUFACTURER_ID,
        //         ByteArray(0),  // Match any manufacturer data with our company ID
        //         ByteArray(0)   // No mask
        //     )
        //     .build()

        try {
            android.util.Log.d("BLECentralManager", "[$timestamp] Starting scan WITHOUT FILTER (debugging)")
            bluetoothLeScanner.startScan(null, scanSettings, scanCallback) // null = no filter
            isScanning = true
            android.util.Log.d("BLECentralManager", "[$timestamp] ✅ Scan started successfully")

            // Emit debug event to JavaScript
            eventEmitter.sendError("Scan started WITHOUT FILTER (debugging - will detect ALL BLE devices)", "SCAN_DEBUG")

            // Check scan state after 2 seconds to verify it's still running
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                android.util.Log.d("BLECentralManager", "[${System.currentTimeMillis()}] 🔍 Scan state check: isScanning=$isScanning")
                eventEmitter.sendError("🔍 Scan state after 2s: isScanning=$isScanning", "SCAN_DEBUG")

                // Try to detect if Android silently stopped the scan
                if (isScanning) {
                    eventEmitter.sendError("⚠️ Scan appears to be running, but no devices detected yet. Possible issues: (1) No BLE devices nearby (2) Android battery optimization blocking scan (3) Simultaneous advertise+scan conflict", "SCAN_DEBUG")
                } else {
                    eventEmitter.sendError("❌ Scan was stopped by Android! Check battery optimization settings.", "SCAN_DEBUG")
                }
            }, 2000)

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
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            // IMMEDIATE CALLBACK CONFIRMATION - Send this FIRST before anything else
            val timestamp = System.currentTimeMillis()
            android.util.Log.d("BLECentralManager", "[$timestamp] 🔥🔥🔥 CALLBACK FIRED! onScanResult invoked!")
            eventEmitter.sendError("🔥 CALLBACK FIRED! Device detected!", "SCAN_DEBUG")

            android.util.Log.d("BLECentralManager", "[$timestamp] 📱 onScanResult: device=${result.device.address}, rssi=${result.rssi}")

            // Send debug event for ALL discoveries
            eventEmitter.sendError("Scan result: device=${result.device.address}, rssi=${result.rssi}", "SCAN_DEBUG")

            // Filter by RSSI
            if (result.rssi < RSSI_THRESHOLD) {
                android.util.Log.d("BLECentralManager", "[$timestamp] ⚠️ Filtered out: RSSI ${result.rssi} < threshold $RSSI_THRESHOLD")
                eventEmitter.sendError("Filtered: RSSI ${result.rssi} < $RSSI_THRESHOLD", "SCAN_DEBUG")
                return
            }

            // Parse manufacturer data
            val manufacturerData = result.scanRecord?.getManufacturerSpecificData(MANUFACTURER_ID)
            android.util.Log.d("BLECentralManager", "[$timestamp] Manufacturer data: ${if (manufacturerData != null) "${manufacturerData.size} bytes" else "null"}")

            val payload = if (manufacturerData != null) {
                val hexData = manufacturerData.joinToString("") { "%02x".format(it) }
                eventEmitter.sendError("Found manufacturer data ($MANUFACTURER_ID): $hexData", "SCAN_DEBUG")
                parseManufacturerData(manufacturerData)
            } else {
                // Empty payload if no manufacturer data
                android.util.Log.d("BLECentralManager", "[$timestamp] ⚠️ No manufacturer data for our ID ($MANUFACTURER_ID)")
                eventEmitter.sendError("No manufacturer data for ID $MANUFACTURER_ID", "SCAN_DEBUG")
                Arguments.createMap().apply {
                    putInt("version", 0)
                    putNull("displayName")
                    putString("userHashHex", "")
                    putString("followTokenHex", "")
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
                    if (gatt.getConnectionState(device) != BluetoothProfile.STATE_CONNECTED) {
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
}
