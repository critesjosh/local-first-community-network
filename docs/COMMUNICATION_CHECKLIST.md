# Script Communication Checklist

Use this checklist to ensure proper communication around all script usage and releases.

## 📋 **Pre-Release Checklist**

### **Before Any Release**
- [ ] Code reviewed and approved
- [ ] Tests passing (`npm test`)
- [ ] Changes documented
- [ ] Release type determined (OTA vs App Store)
- [ ] Communication plan prepared

### **For OTA Updates**
- [ ] Changes are JavaScript/TypeScript only
- [ ] No native dependencies added
- [ ] Preview testing completed
- [ ] Rollback plan ready
- [ ] Team notified of deployment

### **For App Store Releases**
- [ ] All OTA updates included
- [ ] App store metadata updated
- [ ] Screenshots current
- [ ] Release notes prepared
- [ ] Compliance verified

## 📢 **Communication Templates**

### **OTA Update Announcement**
```
🚀 Update Deployed!
Version: [version]
Changes:
• [change 1]
• [change 2]
• [change 3]

Deployment: Immediate via OTA
Impact: All users will receive update automatically
```

### **App Store Release Announcement**
```
📱 New Version Available!
Version: [version]
Changes:
• [change 1]
• [change 2]
• [change 3]

Deployment: Available in App Store
Review Time: 1-7 days
```

### **Hotfix Communication**
```
🚨 Critical Fix Deployed
Issue: [brief description]
Fix: [solution implemented]
Deployment: Immediate via OTA
Status: All users protected
```

## 🎯 **Audience-Specific Communication**

### **For Developers**
- Technical details
- Script usage
- Testing procedures
- Rollback plans

### **For QA Team**
- Testing requirements
- Preview builds
- Validation steps
- Feedback collection

### **For Stakeholders**
- Business impact
- User benefits
- Timeline expectations
- Success metrics

### **For Users**
- New features
- Bug fixes
- How to get updates
- Support information

## 📊 **Post-Release Monitoring**

### **Metrics to Track**
- [ ] Update adoption rate
- [ ] User feedback
- [ ] Crash reports
- [ ] Performance metrics
- [ ] App store reviews

### **Communication Updates**
- [ ] Adoption rate shared with team
- [ ] User feedback reviewed
- [ ] Issues identified and addressed
- [ ] Success metrics reported

## 🚨 **Emergency Communication**

### **Critical Issues**
1. **Immediate**: Notify team via Slack/Teams
2. **Fix**: Deploy hotfix using `npm run hotfix`
3. **Communication**: Send user notification
4. **Monitoring**: Track fix effectiveness
5. **Follow-up**: Document lessons learned

### **Escalation Process**
1. **Level 1**: Developer fixes and deploys
2. **Level 2**: Team lead involvement
3. **Level 3**: Stakeholder notification
4. **Level 4**: External communication

## 📝 **Documentation Updates**

### **After Each Release**
- [ ] Update release notes
- [ ] Document any issues
- [ ] Update scripts if needed
- [ ] Share lessons learned
- [ ] Update communication templates

### **Monthly Reviews**
- [ ] Review communication effectiveness
- [ ] Update templates as needed
- [ ] Share metrics with team
- [ ] Plan improvements

## 🎉 **Success Criteria**

### **Communication Success**
- [ ] All stakeholders informed
- [ ] Clear expectations set
- [ ] Feedback collected
- [ ] Issues addressed promptly
- [ ] Team alignment maintained

### **Release Success**
- [ ] Smooth deployment
- [ ] High adoption rate
- [ ] Positive user feedback
- [ ] No critical issues
- [ ] Business goals met

---

## Quick Reference

| Script | Communication Required | Audience | Template |
|--------|----------------------|----------|----------|
| `npm run hotfix` | Immediate | All | Hotfix Communication |
| `npm run release:ota` | Pre-release | Team | OTA Update Announcement |
| `npm run release:patch` | Pre-release | All | App Store Release |
| `npm run release:minor` | Pre-release | All | App Store Release |
| `npm run release:major` | Pre-release | All | App Store Release |
