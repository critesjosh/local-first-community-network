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
            val jsonObject = org.json.JSONObject(payloadJson)
            val payload = Arguments.createMap()

            // Parse the payload structure
            val payloadType = jsonObject.optString("type", "follow-request")
            payload.putString("type", payloadType)

            // Support both "requester" (new) and "follower" (legacy) field names
            val userFieldName = if (jsonObject.has("requester")) "requester" else "follower"
            val userJson = jsonObject.getJSONObject(userFieldName)
            val user = Arguments.createMap()
            user.putString("userId", userJson.getString("userId"))
            user.putString("displayName", userJson.getString("displayName"))
            user.putString("publicKey", userJson.getString("publicKey"))
            if (userJson.has("profilePhoto") && !userJson.isNull("profilePhoto")) {
                user.putString("profilePhoto", userJson.getString("profilePhoto"))
            }

            // Always export as "follower" for backward compatibility with existing event handlers
            payload.putMap("follower", user)

            payload.putString("timestamp", jsonObject.getString("timestamp"))

            event.putMap("payload", payload)
        } catch (e: Exception) {
            // Fallback: send as unparsed string (will likely fail on JS side, but easier to debug)
            android.util.Log.e("EventEmitter", "Failed to parse follow request JSON: ${e.message}")
            android.util.Log.e("EventEmitter", "Payload JSON: $payloadJson")
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
