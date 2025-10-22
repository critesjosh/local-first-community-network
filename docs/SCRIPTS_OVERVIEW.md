# Scripts Overview & Communication Guide

This document provides a comprehensive overview of all available scripts and how to communicate about them effectively.

## 📋 Script Categories

### 🚀 **Development Scripts**
```bash
npm start                 # Start Expo development server
npm run start:dev-client  # Start for development builds
npm run android          # Run on Android device/emulator
npm run ios              # Run on iOS device/simulator
npm run web              # Run in web browser
```

### 🔨 **Build Scripts**
```bash
npm run prebuild          # Generate native projects (android/, ios/)
npm run prebuild:clean    # Clean and regenerate native projects
npm run build:android     # Build Android APK locally
npm run build:ios         # Build iOS app locally (macOS only)
npm run build:ios:preview # Build iOS preview version
npm run build:ios:development # Build iOS development version
npm run build:ios:production  # Build iOS for App Store submission
```

### 📱 **Release & Update Scripts**
```bash
# Over-the-Air Updates (Instant deployment)
npm run hotfix            # Emergency fixes
npm run release:ota       # Regular OTA updates

# App Store Releases (1-7 day review)
npm run release:patch     # Bug fixes (1.0.0 → 1.0.1)
npm run release:minor     # New features (1.0.0 → 1.1.0)
npm run release:major     # Breaking changes (1.0.0 → 2.0.0)

# Interactive Release Script
npm run release ota       # Deploy OTA update
npm run release patch     # Create patch release
npm run release minor     # Create minor release
npm run release major     # Create major release
npm run release hotfix    # Emergency hotfix
```

### 🏷️ **Version Management Scripts**
```bash
npm run version:patch     # Bump patch version (1.0.0 → 1.0.1)
npm run version:minor     # Bump minor version (1.0.0 → 1.1.0)
npm run version:major     # Bump major version (1.0.0 → 2.0.0)
```

### 📤 **Submission Scripts**
```bash
npm run submit:ios        # Submit iOS app to App Store
```

### 🔄 **Update Scripts**
```bash
npm run update:development # Deploy to development channel
npm run update:preview     # Deploy to preview channel
npm run update:production  # Deploy to production channel
npm run update:auto        # Auto-detect branch and deploy
```

### 🧪 **Testing Scripts**
```bash
npm test                  # Run all tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Run tests with coverage report
```

## 🎯 **Communication Strategy**

### **For Team Members**

#### **Daily Development**
- Use `npm start` for regular development
- Use `npm run start:dev-client` for development builds
- Use `npm run test:watch` while coding

#### **Testing & QA**
- Use `npm run build:ios:preview` for internal testing
- Use `npm run update:preview` for preview updates

#### **Production Releases**
- Use `npm run release:ota` for quick fixes
- Use `npm run release:patch` for bug fixes
- Use `npm run release:minor` for new features

### **For Stakeholders**

#### **Update Types**
- **OTA Updates**: "We can deploy this fix immediately"
- **App Store Updates**: "This will be available in 1-7 days after review"

#### **Release Communication**
- **Hotfix**: "Critical issue fixed and deployed"
- **Patch**: "Bug fixes and improvements released"
- **Minor**: "New features added to the app"
- **Major**: "Significant updates and improvements"

## 📢 **Communication Templates**

### **OTA Update Announcement**
```
🚀 Update Deployed!
We've just pushed a new update that includes:
• Bug fixes
• Performance improvements
• UI enhancements

The update will be available immediately when users open the app.
```

### **App Store Release Announcement**
```
📱 New Version Available!
Version 1.1.0 is now live in the App Store with:
• New features
• Bug fixes
• Performance improvements

Update now to get the latest features!
```

### **Hotfix Communication**
```
🚨 Critical Fix Deployed
We've identified and fixed a critical issue. The fix has been deployed immediately via OTA update.

All users will receive the fix automatically when they open the app.
```

## 🔄 **Workflow Communication**

### **Development Workflow**
1. **Feature Development**: Use `npm start` for development
2. **Testing**: Use `npm run test:watch` for continuous testing
3. **Preview**: Use `npm run update:preview` for team testing
4. **Release**: Use appropriate release script based on change type

### **Release Workflow**
1. **Code Review**: Ensure all changes are reviewed
2. **Testing**: Verify changes work as expected
3. **Release**: Choose appropriate release type
4. **Communication**: Notify stakeholders of release
5. **Monitoring**: Track adoption and feedback

## 📊 **Monitoring & Feedback**

### **Metrics to Track**
- Update adoption rates
- User feedback
- Crash reports
- Performance metrics

### **Communication Channels**
- Internal: Slack/Teams for team updates
- External: App Store release notes
- User: In-app notifications for major updates

## 🚨 **Emergency Procedures**

### **Critical Bug**
```bash
# 1. Fix the bug
git add .
git commit -m "fix: critical bug description"

# 2. Deploy hotfix immediately
npm run hotfix

# 3. Communicate to team
# "Critical bug fixed and deployed via OTA update"
```

### **Major Issue**
```bash
# 1. Fix the issue
git add .
git commit -m "fix: major issue description"

# 2. Create patch release
npm run release:patch

# 3. Communicate to stakeholders
# "Major issue fixed, update available in App Store"
```

## 📝 **Documentation Updates**

When adding new scripts:
1. Update this document
2. Update README.md
3. Update RELEASE_WORKFLOW.md if applicable
4. Communicate changes to team

## 🎉 **Best Practices**

1. **Always test** before releasing
2. **Communicate clearly** about update types
3. **Monitor adoption** after releases
4. **Document changes** in release notes
5. **Use appropriate channels** for different types of updates

---

## Quick Reference

| Script | Purpose | Impact | Communication |
|--------|---------|---------|---------------|
| `npm run hotfix` | Emergency fix | Immediate | "Critical fix deployed" |
| `npm run release:ota` | Regular update | Immediate | "Update available" |
| `npm run release:patch` | Bug fixes | 1-7 days | "Bug fixes released" |
| `npm run release:minor` | New features | 1-7 days | "New features added" |
| `npm run release:major` | Major changes | 1-7 days | "Major update available" |
