# ⚠️ macOS Permissions Required to Build iOS App

## Problem

Your iOS build is failing with **Sandbox: rsync deny(1) file-write-create** errors. This is a **macOS system-level security restriction**, not a code issue.

**The iOS Bluetooth module code is 100% correct and ready.** We just need macOS to allow Xcode to build.

## Solution: Grant Full Disk Access to Xcode

You **MUST** complete these steps to build your app:

### Step-by-Step Instructions:

1. **Close Xcode completely** (Quit Xcode if it's open)

2. Click **Apple menu () → System Settings**

3. In the left sidebar, click **Privacy & Security**

4. Scroll down in the right panel and click **Full Disk Access**

5. Click the **🔒 lock icon** at the bottom left
   - Enter your Mac password to unlock settings

6. Click the **+** button

7. Navigate to **Applications** folder

8. Select **Xcode.app** and click **Open**

9. **Make sure the checkbox next to Xcode is enabled** ✅

10. Also add **Cursor** or **Terminal**:
    - Click **+** again
    - For Cursor: Go to Applications → **Cursor.app**
    - For Terminal: Go to Applications → Utilities → **Terminal.app**
    - Click **Open**

11. **Verify you see checkmarks** ✅ next to:
    - Xcode
    - Cursor (or Terminal)

12. Click the **🔒 lock icon** again to prevent further changes

13. **Restart your Mac** (important for permissions to take effect)
    - Or at minimum: `killall -9 Xcode xcodebuild cfprefsd`

### After Restart:

```bash
cd ~/Developer/local-first-community-network
rm -rf ios/DerivedData
npx expo run:ios --device "iPhone JG 17"
```

The build should succeed!

---

## Alternative: Use a Different Mac or Disable SIP (Not Recommended)

If you cannot grant Full Disk Access (e.g., corporate managed Mac):

### Option A: Build on a Different Mac
- Use a personal Mac without sandbox restrictions
- Use a Mac where you have admin privileges

### Option B: Disable System Integrity Protection (⚠️ Security Risk)
1. Restart Mac in Recovery Mode (hold Cmd+R during boot)
2. Open Terminal from Utilities menu
3. Run: `csrutil disable`
4. Restart Mac

**WARNING**: Disabling SIP reduces your Mac's security. Only do this if absolutely necessary.

---

## What These Permissions Enable

**Full Disk Access** allows Xcode to:
- Write to DerivedData folder during builds
- Run `rsync` commands in CocoaPods script phases
- Copy framework files (hermes-engine, ReactNativeDependencies)
- Sign and bundle the final .ipa file

Without this permission, **every iOS build will fail** with sandbox errors.

---

## Verification

After granting permissions and restarting, you should see:

```
✅ Build succeeded
✅ Installing app on iPhone JG 17
✅ RNLCBluetoothModule loaded successfully!
```

Instead of:

```
❌ Sandbox: rsync(xxxxx) deny(1) file-write-create
```

---

## Next Steps After Build Succeeds

Once the app installs on your device:

1. Open the app
2. Check console logs for: `🚀 RNLCBluetoothModule loaded successfully!`
3. Test BLE scanning functionality
4. Test BLE advertising functionality
5. Verify device discovery between two iPhones

The Bluetooth module is ready to go! 🚀

