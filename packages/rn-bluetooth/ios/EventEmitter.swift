/**
 * EventEmitter.swift
 * Handles event emission to JavaScript layer
 */

import Foundation
import React

@objc(RNLCBluetoothEventEmitter)
class EventEmitter: RCTEventEmitter {

  /// Shared singleton instance
  static var shared: EventEmitter?

  override init() {
    super.init()
    EventEmitter.shared = self
    print("[EventEmitter] 🔌 EventEmitter initialized and set as shared instance")
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc override func supportedEvents() -> [String]! {
    return ["RNLCBluetoothEvent"]
  }

  /// Send an event to JavaScript
  /// - Parameter payload: Dictionary containing event data
  func send(_ payload: [String: Any]) {
    sendEvent(withName: "RNLCBluetoothEvent", body: payload)
  }

  /// Send a device discovered event
  func sendDeviceDiscovered(
    deviceId: String,
    rssi: Int,
    payload: [String: Any]
  ) {
    print("[EventEmitter] 📤 Sending deviceDiscovered event: \(deviceId)")
    send([
      "type": "deviceDiscovered",
      "deviceId": deviceId,
      "rssi": rssi,
      "payload": payload
    ])
    print("[EventEmitter] ✅ Event sent to JavaScript")
  }

  /// Send a connection state changed event
  func sendConnectionStateChanged(
    deviceId: String,
    state: String
  ) {
    send([
      "type": "connectionStateChanged",
      "deviceId": deviceId,
      "state": state
    ])
  }

  /// Send a follow request received event
  func sendFollowRequestReceived(
    fromDeviceId: String,
    payloadJson: String
  ) {
    guard let payloadData = payloadJson.data(using: .utf8),
          let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
      return
    }

    send([
      "type": "followRequestReceived",
      "fromDeviceId": fromDeviceId,
      "payload": payload
    ])
  }

  /// Send a connection response received event
  func sendConnectionResponseReceived(
    fromDeviceId: String,
    payloadJson: String
  ) {
    guard let payloadData = payloadJson.data(using: .utf8),
          let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
      print("[EventEmitter] ❌ Failed to parse connection response JSON")
      return
    }

    print("[EventEmitter] 📤 Sending connectionResponseReceived event from: \(fromDeviceId)")
    send([
      "type": "connectionResponseReceived",
      "fromDeviceId": fromDeviceId,
      "payload": payload
    ])
  }

  /// Send a scan stopped event
  func sendScanStopped() {
    send(["type": "scanStopped"])
  }

  /// Send an error event
  func sendError(message: String, code: String? = nil) {
    var payload: [String: Any] = [
      "type": "error",
      "message": message
    ]
    if let code = code {
      payload["code"] = code
    }
    send(payload)
  }
  
  /// Send a debug event (for development/troubleshooting)
  func sendDebug(message: String, category: String? = nil) {
    var payload: [String: Any] = [
      "type": "debug",
      "message": message
    ]
    if let category = category {
      payload["category"] = category
    }
    send(payload)
  }
}
