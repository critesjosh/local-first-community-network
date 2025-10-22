# Release & Update Workflow

This document outlines our comprehensive versioning and update strategy for the Local Community Network app.

## 🚀 Update Types

### 1. Over-the-Air (OTA) Updates
**Use for:** JavaScript/TypeScript changes, UI updates, bug fixes, feature additions
**Deployment:** Instant to all users
**Version:** No app store submission required

### 2. App Store Updates
**Use for:** Native code changes, new dependencies, major architecture changes
**Deployment:** App store review process (1-7 days)
**Version:** Requires new version number and app store submission

## 📋 Release Workflow

### Quick OTA Updates (Hotfixes)
```bash
# For urgent bug fixes or small improvements
yarn hotfix
```

### Standard OTA Updates
```bash
# For regular feature updates
yarn release:ota
```

### App Store Releases
```bash
# Patch version (1.0.0 → 1.0.1) - Bug fixes
yarn release:patch

# Minor version (1.0.0 → 1.1.0) - New features
yarn release:minor

# Major version (1.0.0 → 2.0.0) - Breaking changes
yarn release:major
```

## 🔄 Development Workflow

### 1. Development Updates
```bash
# Test updates in development
yarn update:development
```

### 2. Preview/Staging Updates
```bash
# Deploy to preview channel for testing
yarn update:preview
```

### 3. Production OTA Updates
```bash
# Deploy to production users
yarn update:production
```

## 📊 Version Management

### Semantic Versioning
- **Patch (x.x.X)**: Bug fixes, small improvements
- **Minor (x.X.x)**: New features, enhancements
- **Major (X.x.x)**: Breaking changes, major rewrites

### Version Bumping
```bash
# Automatically bump version and create git tag
yarn version:patch   # 1.0.0 → 1.0.1
yarn version:minor   # 1.0.0 → 1.1.0
yarn version:major   # 1.0.0 → 2.0.0
```

## 🎯 Update Strategy

### When to Use OTA Updates
- ✅ UI/UX improvements
- ✅ JavaScript bug fixes
- ✅ Feature additions
- ✅ Configuration changes
- ✅ Performance optimizations
- ✅ Content updates

### When to Use App Store Updates
- ❌ New native dependencies
- ❌ Native code changes
- ❌ Permission changes
- ❌ App store metadata changes
- ❌ Breaking API changes
- ❌ New native features

## 🔧 Build Profiles

### Development
- **Purpose**: Local development and testing
- **Build**: `yarn build:ios:development`
- **Updates**: Development channel

### Preview
- **Purpose**: Internal testing and QA
- **Build**: `yarn build:ios:preview`
- **Updates**: Preview channel

### Production
- **Purpose**: App store submission
- **Build**: `yarn build:ios:production`
- **Updates**: Production channel

## 📱 User Experience

### OTA Updates
1. App checks for updates on launch
2. Downloads update in background
3. App reloads automatically with new version
4. Users see changes immediately

### App Store Updates
1. Users receive notification of new version
2. Users update through App Store
3. New version includes all latest OTA updates

## 🚨 Emergency Procedures

### Critical Bug Fix
```bash
# 1. Fix the bug
git add .
git commit -m "fix: critical bug description"

# 2. Deploy hotfix immediately
yarn hotfix

# 3. Monitor and verify fix
```

### Major Issue Requiring App Store Update
```bash
# 1. Fix the issue
git add .
git commit -m "fix: major issue description"

# 2. Create patch release
yarn release:patch

# 3. Monitor build and submission
```

## 📈 Monitoring & Analytics

### OTA Updates
- Monitor update success rates
- Track user adoption of new versions
- Monitor crash rates after updates

### App Store Updates
- Track download and adoption rates
- Monitor app store reviews
- Track performance metrics

## 🔐 Security & Compliance

### OTA Updates
- All updates are signed and verified
- Updates only include JavaScript/TypeScript changes
- No sensitive data in update bundles

### App Store Updates
- Full security review process
- Compliance with app store guidelines
- Regular security audits

## 📝 Best Practices

1. **Test thoroughly** before any release
2. **Use staging/preview** for testing
3. **Monitor metrics** after releases
4. **Communicate changes** to users
5. **Maintain rollback plans**
6. **Document all releases**

## 🎉 Release Checklist

### Before OTA Update
- [ ] Code reviewed and tested
- [ ] Changes documented
- [ ] Preview testing completed
- [ ] Rollback plan ready

### Before App Store Release
- [ ] All OTA updates included
- [ ] App store metadata updated
- [ ] Screenshots and descriptions current
- [ ] Compliance verified
- [ ] Release notes prepared

---

## Quick Reference

| Command | Purpose | Impact |
|---------|---------|---------|
| `yarn hotfix` | Emergency OTA fix | Immediate |
| `yarn release:ota` | Standard OTA update | Immediate |
| `yarn release:patch` | Bug fix release | 1-7 days |
| `yarn release:minor` | Feature release | 1-7 days |
| `yarn release:major` | Major release | 1-7 days |
