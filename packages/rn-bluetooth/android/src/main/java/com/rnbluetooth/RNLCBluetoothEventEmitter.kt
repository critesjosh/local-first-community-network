/**
 * RNLCBluetoothEventEmitter.kt
 * Native module for event emission
 */

package com.rnbluetooth

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class RNLCBluetoothEventEmitter(reactContext: ReactApplicationContext) :
    com.facebook.react.bridge.ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "RNLCBluetoothEventEmitter"
    }

    companion object {
        fun sendEvent(
            reactContext: ReactApplicationContext,
            eventName: String,
            params: com.facebook.react.bridge.WritableMap?
        ) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }
}

