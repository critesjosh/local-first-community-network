# Quick Start Guide - Test on Physical Device in 5 Minutes

## Fastest Method: Using Expo Go

### Step 1: Install Expo Go on Your Phone (2 minutes)

**Android:**
- Open Google Play Store
- Search for "Expo Go"
- Install the app

**iOS:**
- Open Apple App Store
- Search for "Expo Go"
- Install the app

### Step 2: Start the Development Server (30 seconds)

Open your terminal in this project directory and run:

```bash
npm start
```

You should see:
- A QR code in the terminal
- A message saying "Metro waiting on..."
- Options to press 'a' for Android, 'i' for iOS, etc.

### Step 3: Connect Your Device (1 minute)

**Make sure your phone and computer are on the same WiFi network!**

**Android:**
1. Open the Expo Go app
2. Tap "Scan QR code"
3. Scan the QR code from your terminal
4. Wait for the app to load

**iOS:**
1. Open the default Camera app (not Expo Go)
2. Point it at the QR code in your terminal
3. Tap the notification that appears
4. Expo Go will open and load your app

### Step 4: Start Developing

- Your app is now running on your phone!
- Edit `App.js` in your code editor
- Save the file
- Watch it automatically update on your phone
- Shake your device to open the developer menu

## Troubleshooting

**Can't connect?**
- Verify both devices are on the same WiFi
- Try running: `npm start -- --tunnel` (slower but works)
- Check if firewall is blocking port 8081

**App crashes or shows errors?**
- Run: `npm start -- --clear` to clear cache
- Close Expo Go completely and reopen
- Restart the development server

**Still having issues?**
See the full SETUP.md file for more detailed instructions and alternative methods.

## What's Next?

Once this works, you can:
1. Edit `App.js` to build your app
2. Install additional packages: `npm install <package>`
3. When you need custom native features, build a development build (see SETUP.md)

For the full setup guide including local builds and advanced features, see **SETUP.md**.
