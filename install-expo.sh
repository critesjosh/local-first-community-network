#!/bin/bash

echo "📲 Building and installing on iPhone 17 Pro (Device 3)..."
npx expo run:ios --device 7A6A4173-6B89-5686-9D20-2D4820DCC604

echo ""
echo "�� Building and installing on iPhone 15 Pro (Device 2)..."
npx expo run:ios --device 16C79670-B9E9-5A88-9131-260099BF87D0

echo ""
echo "🎉 Done! Check both devices."
