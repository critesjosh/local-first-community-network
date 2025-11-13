# macOS Permissions Checklist

## Have you completed ALL of these steps?

### Step 1: Open System Settings
- [ ] Click Apple menu () → System Settings

### Step 2: Navigate to Full Disk Access
- [ ] Click **Privacy & Security** in left sidebar
- [ ] Scroll down and click **Full Disk Access**

### Step 3: Unlock Settings
- [ ] Click the **🔒 lock icon** at bottom left
- [ ] Enter your Mac password

### Step 4: Add Xcode
- [ ] Click the **+** button
- [ ] Navigate to **Applications** folder
- [ ] Select **Xcode.app**
- [ ] Click **Open**
- [ ] **VERIFY: Checkbox appears next to Xcode** ✅

### Step 5: Add Cursor/Terminal
- [ ] Click the **+** button again
- [ ] Navigate to **Applications**
- [ ] Select **Cursor.app** (or go to Applications → Utilities → Terminal.app)
- [ ] Click **Open**
- [ ] **VERIFY: Checkbox appears next to Cursor/Terminal** ✅

### Step 6: Lock Settings
- [ ] Click the **🔒 lock icon** again to prevent changes

### Step 7: Restart Mac (CRITICAL!)
- [ ] **Click Apple menu () → Restart**
- [ ] Wait for Mac to fully restart

### Step 8: Try Build Again
```bash
cd ~/Developer/local-first-community-network
npx expo run:ios --device "iPhone JG 17"
```

---

## If You See This Error After Completing Steps 1-8:
```
❌ Sandbox: rsync deny(1) file-write-create
```

Then Full Disk Access **was NOT properly granted** or **Mac was NOT restarted**.

## Alternative: Build in Xcode
```bash
open ios/localsocialnetworkexpo.xcworkspace
```
Then:
- Select "iPhone JG 17" device at top
- Press **Cmd + B** to build
- Press **Cmd + R** to run

