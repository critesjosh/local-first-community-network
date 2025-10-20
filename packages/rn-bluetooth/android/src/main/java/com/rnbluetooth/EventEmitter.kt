/**
 * EventEmitter.kt
 * Handles event emission to JavaScript layer
 */

package com.rnbluetooth

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class EventEmitter(private val reactContext: ReactApplicationContext) {

    companion object {
        private const val EVENT_NAME = "RNLCBluetoothEvent"
    }

    /**
     * Send an event to JavaScript
     */
    fun send(event: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, event)
    }

    /**
     * Send device discovered event
     */
    fun sendDeviceDiscovered(
        deviceId: String,
        rssi: Int,
        payload: WritableMap
    ) {
        val event = Arguments.createMap()
        event.putString("type", "deviceDiscovered")
        event.putString("deviceId", deviceId)
        event.putInt("rssi", rssi)
        event.putMap("payload", payload)
        send(event)
    }

    /**
     * Send connection state changed event
     */
    fun sendConnectionStateChanged(
        deviceId: String,
        state: String
    ) {
        val event = Arguments.createMap()
        event.putString("type", "connectionStateChanged")
        event.putString("deviceId", deviceId)
        event.putString("state", state)
        send(event)
    }

    /**
     * Send follow request received event
     */
    fun sendFollowRequestReceived(
        fromDeviceId: String,
        payloadJson: String
    ) {
        val event = Arguments.createMap()
        event.putString("type", "followRequestReceived")
        event.putString("fromDeviceId", fromDeviceId)

        // Parse JSON payload
        try {
            val payload = Arguments.createMap()
            // Note: In production, properly parse JSON here
            // For now, pass as string
            event.putString("payloadJson", payloadJson)
        } catch (e: Exception) {
            // Fallback: just send the JSON string
            event.putString("payloadJson", payloadJson)
        }

        send(event)
    }

    /**
     * Send scan stopped event
     */
    fun sendScanStopped() {
        val event = Arguments.createMap()
        event.putString("type", "scanStopped")
        send(event)
    }

    /**
     * Send error event
     */
    fun sendError(message: String, code: String? = null) {
        val event = Arguments.createMap()
        event.putString("type", "error")
        event.putString("message", message)
        code?.let { event.putString("code", it) }
        send(event)
    }
}
