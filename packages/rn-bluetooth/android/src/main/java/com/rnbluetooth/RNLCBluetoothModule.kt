/**
 * RNLCBluetoothModule.kt
 * Main TurboModule that bridges to managers
 */

package com.rnbluetooth

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class RNLCBluetoothModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), PermissionListener {

    companion object {
        private const val PERMISSION_REQUEST_CODE = 1337
    }

    private val eventEmitter = EventEmitter(reactContext)
    private val centralManager = BLECentralManager(reactContext, eventEmitter)
    private val peripheralManager = BLEPeripheralManager(reactContext, eventEmitter)
    private var permissionPromise: Promise? = null

    init {
        android.util.Log.d("RNLCBluetoothModule", "[${System.currentTimeMillis()}] 🚀 Module initialized - BUILD TIMESTAMP: ${System.currentTimeMillis()}")

        // Reset advertising state on module load (in case app was killed while advertising)
        peripheralManager.resetState()
    }

    override fun getName(): String {
        return "RNLCBluetooth"
    }

    // MARK: - Initialization

    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            // Managers are already initialized
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("init_error", "Failed to initialize: ${e.message}", e)
        }
    }

    @ReactMethod
    fun requestPermissions(promise: Promise) {
        val timestamp = System.currentTimeMillis()
        android.util.Log.d("RNLCBluetoothModule", "[$timestamp] requestPermissions called")

        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ (API 31+)
            // IMPORTANT: ACCESS_FINE_LOCATION is STILL required on Android 12+ for BLE scan
            // callbacks to fire on many devices (Samsung, OnePlus, etc.)
            arrayOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.ACCESS_FINE_LOCATION  // Critical for callback firing!
            )
        } else {
            // Android 11 and below
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        // Check if permissions are already granted
        val allGranted = permissions.all {
            ActivityCompat.checkSelfPermission(reactApplicationContext, it) ==
                    PackageManager.PERMISSION_GRANTED
        }

        if (allGranted) {
            android.util.Log.d("RNLCBluetoothModule", "[$timestamp] All permissions already granted")
            promise.resolve(true)
            return
        }

        // Need to request permissions from user
        val activity = getCurrentActivity()
        if (activity == null) {
            android.util.Log.d("RNLCBluetoothModule", "[$timestamp] ERROR: No activity available")
            promise.reject("no_activity", "Activity doesn't exist")
            return
        }

        if (activity !is PermissionAwareActivity) {
            android.util.Log.d("RNLCBluetoothModule", "[$timestamp] ERROR: Activity is not PermissionAwareActivity")
            promise.reject("wrong_activity", "Activity is not PermissionAwareActivity")
            return
        }

        // Store the promise to resolve later
        permissionPromise = promise

        android.util.Log.d("RNLCBluetoothModule", "[$timestamp] Requesting permissions from user...")

        // Request permissions
        activity.requestPermissions(
            permissions,
            PERMISSION_REQUEST_CODE,
            this
        )
    }

    // Handle permission request result
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ): Boolean {
        val timestamp = System.currentTimeMillis()
        android.util.Log.d("RNLCBluetoothModule", "[$timestamp] onRequestPermissionsResult: requestCode=$requestCode")

        if (requestCode != PERMISSION_REQUEST_CODE) {
            return false
        }

        val promise = permissionPromise
        permissionPromise = null

        if (promise == null) {
            android.util.Log.d("RNLCBluetoothModule", "[$timestamp] ERROR: No promise to resolve")
            return false
        }

        // Check if all permissions were granted
        val allGranted = grantResults.isNotEmpty() && grantResults.all {
            it == PackageManager.PERMISSION_GRANTED
        }

        android.util.Log.d("RNLCBluetoothModule", "[$timestamp] Permissions result: allGranted=$allGranted")
        promise.resolve(allGranted)
        return true
    }

    // MARK: - Central Role (Scanning & Connection)

    @ReactMethod
    fun startScanning(promise: Promise) {
        centralManager.startScanning(promise)
    }

    @ReactMethod
    fun stopScanning(promise: Promise) {
        centralManager.stopScanning(promise)
    }

    @ReactMethod
    fun connect(deviceId: String, timeoutMs: Int, promise: Promise) {
        centralManager.connect(deviceId, timeoutMs, promise)
    }

    @ReactMethod
    fun disconnect(deviceId: String, promise: Promise) {
        centralManager.disconnect(deviceId, promise)
    }

    @ReactMethod
    fun readProfile(deviceId: String, promise: Promise) {
        centralManager.readProfile(deviceId, promise)
    }

    @ReactMethod
    fun writeFollowRequest(deviceId: String, payloadJson: String, promise: Promise) {
        centralManager.writeFollowRequest(deviceId, payloadJson, promise)
    }

    // MARK: - Peripheral Role (Advertising & GATT Server)

    @ReactMethod
    fun setProfileData(profileJson: String, promise: Promise) {
        peripheralManager.setProfileData(profileJson, promise)
    }

    @ReactMethod
    fun startAdvertising(
        displayName: String,
        userHashHex: String,
        followTokenHex: String,
        promise: Promise
    ) {
        peripheralManager.startAdvertising(displayName, userHashHex, followTokenHex, promise)
    }

    @ReactMethod
    fun updateAdvertisement(
        displayName: String,
        userHashHex: String,
        followTokenHex: String,
        promise: Promise
    ) {
        peripheralManager.updateAdvertisement(displayName, userHashHex, followTokenHex, promise)
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        peripheralManager.stopAdvertising(promise)
    }

    // MARK: - Utility Methods

    @ReactMethod
    fun isScanning(promise: Promise) {
        val scanning = centralManager.getIsScanning()
        promise.resolve(scanning)
    }

    @ReactMethod
    fun isAdvertising(promise: Promise) {
        val advertising = peripheralManager.getIsAdvertising()
        android.util.Log.d("RNLCBluetoothModule", "[${System.currentTimeMillis()}] isAdvertising() called - returning: $advertising")
        promise.resolve(advertising)
    }

    @ReactMethod
    fun isConnected(deviceId: String, promise: Promise) {
        val connected = centralManager.isConnected(deviceId)
        promise.resolve(connected)
    }

    // MARK: - Event Emitter Support

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for EventEmitter - no-op on Android
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for EventEmitter - no-op on Android
    }

    // MARK: - Module Lifecycle

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        peripheralManager.cleanup()
    }
}
