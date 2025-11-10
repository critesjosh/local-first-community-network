/**
 * BLEPeripheralManager.kt
 * Handles BLE Peripheral role: advertising and GATT server
 */

package com.rnbluetooth

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.*

@SuppressLint("MissingPermission")
class BLEPeripheralManager(
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
        // Note: Android automatically handles Company ID in little-endian format (0x37, 0x13)
        // when adding manufacturer data. The app payload does NOT include the Company ID.
        private const val MANUFACTURER_ID = 0x1337
        private const val BROADCAST_NAME_MAX_LENGTH = 12
        private const val USER_HASH_LENGTH = 6
        private const val FOLLOW_TOKEN_LENGTH = 4
    }

    // MARK: - Properties

    private val bluetoothManager: BluetoothManager =
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private val bluetoothLeAdvertiser: BluetoothLeAdvertiser? =
        bluetoothAdapter?.bluetoothLeAdvertiser

    private var bluetoothGattServer: BluetoothGattServer? = null
    private var profileCharacteristic: BluetoothGattCharacteristic? = null
    private var handshakeCharacteristic: BluetoothGattCharacteristic? = null

    private var isAdvertising = false
    private var profileData: ByteArray? = null

    init {
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] 📍 BLEPeripheralManager created - initial isAdvertising: $isAdvertising")
    }

    // MARK: - Profile Data

    fun setProfileData(profileJson: String, promise: Promise) {
        try {
            profileData = profileJson.toByteArray(Charsets.UTF_8)
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  ✅ Profile data set: ${profileData!!.size} bytes")
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Profile JSON: ${profileJson.take(100)}...")
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("profile_error", "Failed to set profile data: ${e.message}", e)
        }
    }

    // MARK: - Advertising

    fun startAdvertising(
        displayName: String,
        userHashHex: String,
        followTokenHex: String,
        promise: Promise
    ) {
        val timestamp = System.currentTimeMillis()
        Log.d("BLEPeripheralManager", "[$timestamp] 🎯 startAdvertising called")
        Log.d("BLEPeripheralManager", "[$timestamp] displayName: $displayName")
        Log.d("BLEPeripheralManager", "[$timestamp] userHashHex: $userHashHex")
        Log.d("BLEPeripheralManager", "[$timestamp] followTokenHex: $followTokenHex")

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            val msg = "Bluetooth is ${if (bluetoothAdapter == null) "not available" else "disabled"}"
            Log.d("BLEPeripheralManager", "[$timestamp] ERROR: $msg")
            promise.reject("bluetooth_unavailable", msg)
            return
        }

        if (bluetoothLeAdvertiser == null) {
            Log.d("BLEPeripheralManager", "[$timestamp] ERROR: Bluetooth LE advertiser not available")
            promise.reject("advertiser_unavailable", "Bluetooth LE advertiser not available")
            return
        }

        if (isAdvertising) {
            Log.d("BLEPeripheralManager", "[$timestamp] Already advertising, resolving")
            promise.resolve(null)
            return
        }

        // Setup GATT server if not already done
        if (bluetoothGattServer == null) {
            setupGattServer()
        }

        // Build FULL manufacturer data (version 1 - WITH display name)
        // This allows iOS to show the name during scanning without connecting first
        val mfgData = buildManufacturerData(displayName, userHashHex, followTokenHex)
        val hexData = mfgData.joinToString("") { "%02x".format(it) }
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Built FULL manufacturer data: ${mfgData.size} bytes (version 1, with name)")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Data hex: $hexData")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Company ID 0x1337 (2 bytes) + data (${mfgData.size} bytes) = ${2 + mfgData.size} bytes total")
        // Note: Including display name uses more space but allows iOS to show name during scan
        // Service UUID is in GATT service for connections.
        val advertiseData = AdvertiseData.Builder()
            .setIncludeDeviceName(false)   // Exclude to save space
            .setIncludeTxPowerLevel(false) // Exclude to save space
            // .addServiceUuid(ParcelUuid(SERVICE_UUID))  // REMOVED - causes "Data too large"
            .addManufacturerData(MANUFACTURER_ID, mfgData)  // Version 1 with display name
            .build()
        
        // NO scan response, NO service UUID - only manufacturer data for iOS discovery
        
        val advertiseSettings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)  // More frequent for better iOS discovery
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)  // Stronger signal for better range
            .setConnectable(true)
            .setTimeout(0) // Advertise indefinitely
            .build()

        // Comprehensive diagnostics for iOS discovery debugging
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] ===== MINIMAL ADVERTISEMENT (MANUFACTURER DATA ONLY) =====")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Settings:")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Mode: ${advertiseSettings.mode} (2=LOW_LATENCY)")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - TX Power: ${advertiseSettings.txPowerLevel} (3=HIGH)")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Connectable: ${advertiseSettings.isConnectable}")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Advertisement Content:")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Service UUID: NONE (removed to fit 31-byte limit)")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Manufacturer ID: 0x${MANUFACTURER_ID.toString(16).uppercase()} = ${MANUFACTURER_ID} decimal")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Full Data: ${mfgData.size} bytes (version 1, WITH display name: $displayName)")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Data Hex: $hexData")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Packet Size:")
        val adOverhead = 2  // Length + Type bytes
        val mfgDataBytes = adOverhead + 2 + mfgData.size  // overhead + Company ID + data
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - Manufacturer Data: ${mfgDataBytes} bytes")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   - TOTAL: ${mfgDataBytes} bytes (max 31)")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}]   ✅ Should fit in 31-byte limit")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Note: Service UUID $SERVICE_UUID is still in GATT for connections")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] ================================================================")

        try {
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  🚀 Starting BLE advertising (MANUFACTURER DATA ONLY)")
            bluetoothLeAdvertiser.startAdvertising(advertiseSettings, advertiseData, advertiseCallback)
            // Note: isAdvertising will be set to true in onStartSuccess callback
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  startAdvertising() called, waiting for callback")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Exception in startAdvertising: ${e.message}")
            promise.reject("advertise_error", "Failed to start advertising: ${e.message}", e)
        }
    }

    fun updateAdvertisement(
        displayName: String,
        userHashHex: String,
        followTokenHex: String,
        promise: Promise
    ) {
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] 🔄 updateAdvertisement called")

        if (!isAdvertising) {
            Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] ERROR: Not currently advertising")
            promise.reject("not_advertising", "Not currently advertising")
            return
        }

        // Stop current advertising
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Stopping current advertising...")
        bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
        isAdvertising = false  // Reset state immediately so startAdvertising can proceed
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Advertising stopped, isAdvertising reset to false")

        // Start with new data
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Calling startAdvertising with new data...")
        startAdvertising(displayName, userHashHex, followTokenHex, promise)
    }

    fun stopAdvertising(promise: Promise) {
        if (isAdvertising) {
            bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Stopped advertising")
        }
        promise.resolve(null)
    }

    fun getIsAdvertising(): Boolean = isAdvertising

    /**
     * Reset state (called when module loads to clear stale state from previous sessions)
     */
    fun resetState() {
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] 🔄 Resetting state - was advertising: $isAdvertising")
        if (isAdvertising) {
            bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
        }
        isAdvertising = false
        profileData = null
    }

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  ✅ Advertising started successfully!")
            isAdvertising = true
        }

        override fun onStartFailure(errorCode: Int) {
            isAdvertising = false
            val errorMessage = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                else -> "Unknown error: $errorCode"
            }
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  ❌ Advertising FAILED: $errorMessage (code: $errorCode)")
            eventEmitter.sendError("Advertising failed: $errorMessage", "ADVERTISING_FAILED")
        }
    }

    // MARK: - GATT Server Setup

    private fun setupGattServer() {
        // Create Profile characteristic (READ)
        profileCharacteristic = BluetoothGattCharacteristic(
            PROFILE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )

        // Create Handshake characteristic (WRITE + NOTIFY)
        handshakeCharacteristic = BluetoothGattCharacteristic(
            HANDSHAKE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        // Add CCCD descriptor for notifications (CRITICAL for iOS central to subscribe)
        val cccdDescriptor = BluetoothGattDescriptor(
            UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
        handshakeCharacteristic!!.addDescriptor(cccdDescriptor)
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] ✅ Added CCCD descriptor to handshake characteristic")

        // Create service
        val service = BluetoothGattService(
            SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )
        service.addCharacteristic(profileCharacteristic)
        service.addCharacteristic(handshakeCharacteristic)

        // Open GATT server
        bluetoothGattServer = bluetoothManager.openGattServer(reactContext, gattServerCallback)
        bluetoothGattServer?.addService(service)

        Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  GATT server setup complete")
    }

    /**
     * Send a connection response to a connected central via notification
     * This matches the iOS BLEPeripheralManager.sendConnectionResponse API
     */
    fun sendConnectionResponse(deviceAddress: String, responseJson: String) {
        val device = bluetoothAdapter?.getRemoteDevice(deviceAddress)
        if (device == null) {
            Log.e("BLEPeripheralManager", "[${System.currentTimeMillis()}] ❌ Device not found: $deviceAddress")
            return
        }

        val data = responseJson.toByteArray(Charsets.UTF_8)
        handshakeCharacteristic?.value = data
        
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] 📤 Sending connection response via notification")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Response: ${responseJson.take(100)}...")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Data size: ${data.size} bytes")
        
        val success = bluetoothGattServer?.notifyCharacteristicChanged(
            device,
            handshakeCharacteristic,
            false // false = notification, true = indication
        )
        
        if (success == true) {
            Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] ✅ Response notification sent successfully")
        } else {
            Log.e("BLEPeripheralManager", "[${System.currentTimeMillis()}] ❌ Failed to send notification (central may not be subscribed)")
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            val state = when (newState) {
                BluetoothProfile.STATE_CONNECTED -> "connected"
                BluetoothProfile.STATE_DISCONNECTED -> "disconnected"
                else -> "unknown"
            }
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Connection state changed: $state for device ${device.address}")
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  📖 Read request from ${device.address} for char ${characteristic.uuid}")
            if (characteristic.uuid == PROFILE_CHAR_UUID) {
                Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  📖 Profile read request, profileData is ${if (profileData == null) "NULL" else "${profileData!!.size} bytes"}")
                if (profileData != null) {
                    val data = profileData!!
                    if (offset > data.size) {
                        bluetoothGattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_INVALID_OFFSET,
                            offset,
                            null
                        )
                        return
                    }

                    val value = data.copyOfRange(offset, data.size)
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        offset,
                        value
                    )
                    Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Responded to profile read request")
                } else {
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_FAILURE,
                        offset,
                        null
                    )
                    Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  No profile data available")
                }
            } else {
                bluetoothGattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                    offset,
                    null
                )
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            val timestamp = System.currentTimeMillis()
            if (characteristic.uuid == HANDSHAKE_CHAR_UUID) {
                val payloadJson = String(value, Charsets.UTF_8)
                Log.d("BLEPeripheralManager", "[$timestamp] 📥 Received handshake write from ${device.address}")
                Log.d("BLEPeripheralManager", "[$timestamp] Request ID: $requestId, Prepared: $preparedWrite, Offset: $offset")
                Log.d("BLEPeripheralManager", "[$timestamp] Payload (${value.size} bytes): ${payloadJson.take(100)}...")

                // Emit event to JavaScript
                // Note: Deduplication happens in JavaScript layer (BLEConnectionHandler)
                eventEmitter.sendFollowRequestReceived(device.address, payloadJson)
                Log.d("BLEPeripheralManager", "[$timestamp] ✅ Event emitted to JavaScript")

                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        offset,
                        null
                    )
                    Log.d("BLEPeripheralManager", "[$timestamp] ✅ GATT response sent")
                }
            } else {
                Log.d("BLEPeripheralManager", "[$timestamp] ⚠️ Write to unsupported characteristic: ${characteristic.uuid}")
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                        offset,
                        null
                    )
                }
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            val timestamp = System.currentTimeMillis()
            Log.d("BLEPeripheralManager", "[$timestamp] 📝 Descriptor write request from ${device.address}")
            Log.d("BLEPeripheralManager", "[$timestamp] Descriptor UUID: ${descriptor.uuid}")
            
            // Check if this is the CCCD descriptor (0x2902)
            if (descriptor.uuid.toString() == "00002902-0000-1000-8000-00805f9b34fb") {
                val notificationsEnabled = value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                val indicationsEnabled = value.contentEquals(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE)
                
                Log.d("BLEPeripheralManager", "[$timestamp] 📡 CCCD write: notifications=${notificationsEnabled}, indications=${indicationsEnabled}")
                
                if (notificationsEnabled || indicationsEnabled) {
                    Log.d("BLEPeripheralManager", "[$timestamp] ✅ Central ${device.address} subscribed to notifications")
                } else {
                    Log.d("BLEPeripheralManager", "[$timestamp] ❌ Central ${device.address} unsubscribed from notifications")
                }
                
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        offset,
                        value
                    )
                    Log.d("BLEPeripheralManager", "[$timestamp] ✅ Sent CCCD write response")
                }
            } else {
                Log.w("BLEPeripheralManager", "[$timestamp] ⚠️ Unknown descriptor write: ${descriptor.uuid}")
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_REQUEST_NOT_SUPPORTED,
                        offset,
                        null
                    )
                }
            }
        }

        override fun onServiceAdded(status: Int, service: BluetoothGattService) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Service added successfully")
            } else {
                eventEmitter.sendError("Failed to add GATT service", "SERVICE_ADD_FAILED")
            }
        }
    }

    // MARK: - Helper Methods

    /**
     * Build COMPACT manufacturer data payload for BLE advertisement (NO display name)
     * This version excludes the display name to fit in the 31-byte BLE advertisement limit.
     * Display name is still available via GATT characteristic read.
     *
     * **Binary Structure:**
     * ```
     * [version: 1 byte]
     * [userHash: 6 bytes]
     * [followToken: 4 bytes]
     * ```
     * Total: 11 bytes (plus 2-byte Company ID added by Android = 13 bytes)
     * With 16-byte Service UUID, total ~29 bytes - FITS in 31-byte limit!
     *
     * @param userHashHex First 6 bytes of SHA-256(userId), hex encoded (12 chars)
     * @param followTokenHex Random 4-byte token, hex encoded (8 chars)
     * @return Byte array of compact manufacturer data payload (WITHOUT Company ID)
     */
    private fun buildCompactManufacturerData(
        userHashHex: String,
        followTokenHex: String
    ): ByteArray {
        val version: Byte = 2  // Version 2 = compact format (no display name)
        val userHashBytes = hexStringToBytes(userHashHex).take(USER_HASH_LENGTH).toByteArray()
        val followTokenBytes = hexStringToBytes(followTokenHex).take(FOLLOW_TOKEN_LENGTH).toByteArray()

        // Build compact manufacturer data: [version, userHash..., followToken...]
        // Company ID is NOT included here - Android adds it automatically
        return byteArrayOf(version) + userHashBytes + followTokenBytes
    }

    /**
     * Build FULL manufacturer data payload for BLE advertisement (with display name)
     * This version is kept for reference and future use (scan response, or if we optimize further)
     *
     * **Binary Structure:**
     * ```
     * [version: 1 byte]
     * [nameLength: 1 byte]
     * [displayName: variable, max 12 bytes UTF-8]
     * [userHash: 6 bytes]
     * [followToken: 4 bytes]
     * ```
     *
     * @param displayName User's display name (will be truncated to 12 chars)
     * @param userHashHex First 6 bytes of SHA-256(userId), hex encoded (12 chars)
     * @param followTokenHex Random 4-byte token, hex encoded (8 chars)
     * @return Byte array of manufacturer data payload (WITHOUT Company ID)
     */
    private fun buildManufacturerData(
        displayName: String,
        userHashHex: String,
        followTokenHex: String
    ): ByteArray {
        val normalizedName = normalizeName(displayName)
        val nameBytes = normalizedName.toByteArray(Charsets.UTF_8)
            .take(BROADCAST_NAME_MAX_LENGTH)
            .toByteArray()

        val version: Byte = 1
        val nameLength = nameBytes.size.toByte()

        val userHashBytes = hexStringToBytes(userHashHex).take(USER_HASH_LENGTH).toByteArray()
        val followTokenBytes = hexStringToBytes(followTokenHex).take(FOLLOW_TOKEN_LENGTH).toByteArray()

        // Build manufacturer data payload: [version, nameLength, name..., userHash..., followToken...]
        // Company ID is NOT included here - Android adds it automatically
        return byteArrayOf(version, nameLength) +
                nameBytes +
                userHashBytes +
                followTokenBytes
    }

    private fun normalizeName(name: String): String {
        val trimmed = name.trim()
        // Strip non-ASCII characters
        return trimmed.replace(Regex("[^\\x20-\\x7E]"), "")
    }

    private fun hexStringToBytes(hex: String): ByteArray {
        // Remove any non-hex characters
        val cleanHex = hex.filter { it in "0123456789abcdefABCDEF" }

        if (cleanHex.length % 2 != 0) {
            return ByteArray(0)
        }

        return cleanHex.chunked(2)
            .map { it.toInt(16).toByte() }
            .toByteArray()
    }

    // MARK: - Cleanup

    fun cleanup() {
        if (isAdvertising) {
            bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
            isAdvertising = false
        }
        bluetoothGattServer?.close()
        bluetoothGattServer = null
    }
}
