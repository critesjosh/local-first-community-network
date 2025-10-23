#!/bin/bash

# Find the latest IPA file
LATEST_IPA=$(ls -t build-*.ipa 2>/dev/null | head -1)

if [ -z "$LATEST_IPA" ]; then
  echo "❌ No IPA file found!"
  exit 1
fi

echo "📱 Installing: $LATEST_IPA"
echo "   Built: $(date -r "$LATEST_IPA" '+%Y-%m-%d %H:%M:%S')"
echo ""

# iPhone 15 Pro (Device 2)
echo "📲 Installing on iPhone JG (2) - iPhone 15 Pro..."
xcrun devicectl device install app --device 16C79670-B9E9-5A88-9131-260099BF87D0 "$LATEST_IPA"
if [ $? -eq 0 ]; then
  echo "✅ Installed on iPhone 15 Pro"
else
  echo "❌ Failed to install on iPhone 15 Pro"
fi
echo ""

# iPhone 17 Pro (Device 3)
echo "📲 Installing on iPhone JG (3) - iPhone 17 Pro..."
xcrun devicectl device install app --device 7A6A4173-6B89-5686-9D20-2D4820DCC604 "$LATEST_IPA"
if [ $? -eq 0 ]; then
  echo "✅ Installed on iPhone 17 Pro"
else
  echo "❌ Failed to install on iPhone 17 Pro"
fi

echo ""
echo "🎉 Installation complete! Launch the app on both devices."
echo "👀 Watch for these logs:"
echo "   - 📡 Starting BLE advertisement"
echo "   - [BLE] Starting BLE scan..."
echo "   - [BLE] Device discovered: <name>"
