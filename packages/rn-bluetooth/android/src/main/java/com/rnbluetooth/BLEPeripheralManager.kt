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
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Profile data set")
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
        eventEmitter.sendError("🎯 startAdvertising called: name=$displayName, hash=$userHashHex", "ADVERTISE_DEBUG")

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            val msg = "Bluetooth is ${if (bluetoothAdapter == null) "not available" else "disabled"}"
            Log.d("BLEPeripheralManager", "[$timestamp] ERROR: $msg")
            eventEmitter.sendError("ERROR: $msg", "ADVERTISE_DEBUG")
            promise.reject("bluetooth_unavailable", msg)
            return
        }

        if (bluetoothLeAdvertiser == null) {
            Log.d("BLEPeripheralManager", "[$timestamp] ERROR: Bluetooth LE advertiser not available")
            eventEmitter.sendError("ERROR: BLE advertiser not available", "ADVERTISE_DEBUG")
            promise.reject("advertiser_unavailable", "Bluetooth LE advertiser not available")
            return
        }

        if (isAdvertising) {
            Log.d("BLEPeripheralManager", "[$timestamp] Already advertising, resolving")
            eventEmitter.sendError("Already advertising, skipping", "ADVERTISE_DEBUG")
            promise.resolve(null)
            return
        }

        // Setup GATT server if not already done
        if (bluetoothGattServer == null) {
            setupGattServer()
        }

        // Build advertisement data
        val manufacturerData = buildManufacturerData(displayName, userHashHex, followTokenHex)
        val hexData = manufacturerData.joinToString("") { "%02x".format(it) }
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Built manufacturer data: ${manufacturerData.size} bytes, ID=$MANUFACTURER_ID")
        Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] Data hex: $hexData")

        // Send debug event to JavaScript
        eventEmitter.sendError("Advertising with ID $MANUFACTURER_ID, ${manufacturerData.size} bytes: $hexData", "ADVERTISE_DEBUG")

        val advertiseData = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            // Note: Service UUID removed to fit within 31-byte advertisement limit
            // Devices are identified by manufacturer ID instead
            .addManufacturerData(MANUFACTURER_ID, manufacturerData)
            .build()

        val advertiseSettings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(true)
            .setTimeout(0) // Advertise indefinitely
            .build()

        try {
            Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Calling bluetoothLeAdvertiser.startAdvertising()...")
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
        eventEmitter.sendError("🔄 updateAdvertisement called: name=$displayName, hash=$userHashHex", "ADVERTISE_DEBUG")

        if (!isAdvertising) {
            Log.d("BLEPeripheralManager", "[${System.currentTimeMillis()}] ERROR: Not currently advertising")
            eventEmitter.sendError("ERROR: Not advertising, cannot update", "ADVERTISE_DEBUG")
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

        // Create Handshake characteristic (WRITE)
        handshakeCharacteristic = BluetoothGattCharacteristic(
            HANDSHAKE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

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
            if (characteristic.uuid == PROFILE_CHAR_UUID) {
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
            if (characteristic.uuid == HANDSHAKE_CHAR_UUID) {
                val payloadJson = String(value, Charsets.UTF_8)
                Log.d("BLEPeripheralManager", "[" + System.currentTimeMillis() + "]  Received follow request: $payloadJson")

                // Emit event to JavaScript
                eventEmitter.sendFollowRequestReceived(device.address, payloadJson)

                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        offset,
                        null
                    )
                }
            } else {
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

        // Build manufacturer data: [version, nameLength, name..., userHash..., followToken...]
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
