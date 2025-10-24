#!/bin/bash

echo "🧹 Cleaning all build artifacts..."

# Kill any running processes
echo "Stopping Metro and simulators..."
killall -9 node 2>/dev/null
killall -9 Simulator 2>/dev/null

# Clean iOS build
echo "Cleaning iOS build directory..."
cd ios
rm -rf build
rm -rf DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData/localsocialnetworkexpo-*

# Clean Pods
echo "Cleaning Pods..."
rm -rf Pods
rm -rf Podfile.lock

# Reinstall Pods
echo "Installing Pods..."
pod install

cd ..

# Clean watchman
echo "Cleaning Watchman cache..."
watchman watch-del-all 2>/dev/null || echo "Watchman not installed or no watches"

# Clean Metro cache
echo "Cleaning Metro cache..."
rm -rf $TMPDIR/metro-* 2>/dev/null
rm -rf $TMPDIR/haste-* 2>/dev/null

echo ""
echo "✅ Clean complete!"
echo ""
echo "Now rebuild with:"
echo "  yarn ios --device=\"iPhone JG (2)\""
echo ""

