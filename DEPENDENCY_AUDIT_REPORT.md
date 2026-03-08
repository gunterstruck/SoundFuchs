# Dependency Audit Report - Zanobot
**Date:** 2026-01-13
**Project:** Zanobot v2.0.0
**Total Dependencies:** 511 packages (2 production, 16 dev)
**Node Modules Size:** 132MB

---

## Executive Summary

✅ **Security Status:** EXCELLENT - 0 vulnerabilities detected
⚠️ **Update Status:** 7 outdated packages (including major version updates)
✅ **Bloat Status:** GOOD - Very lean production dependencies, reasonable dev tooling

---

## 1. Security Vulnerabilities

### ✅ No Critical Issues Found

```
npm audit: 0 vulnerabilities
```

### ⚠️ Deprecation Warnings (Transitive Dependencies)

The following deprecated packages are transitive dependencies (not directly controlled):

1. **sourcemap-codec@1.4.8** (deprecated)
   - Recommended replacement: @jridgewell/sourcemap-codec
   - Impact: Low (transitive dependency)
   - Action: Monitor for upstream package updates

2. **source-map@0.8.0-beta.0** (deprecated)
   - Warning: Beta branch work discontinued
   - Impact: Low (transitive dependency)
   - Action: Will be resolved when parent packages update

**Recommendation:** No immediate action required, but monitor for updates to parent packages.

---

## 2. Outdated Packages

### Critical Updates (Major Version Changes)

#### 🔴 @types/node: 22.19.5 → 25.0.7
- **Type:** Major version update
- **Risk:** Medium - Type definitions may have breaking changes
- **Recommendation:** Review changelog before updating
- **Priority:** Medium

#### 🔴 vite: 6.4.1 → 7.3.1
- **Type:** Major version update (Vite 7)
- **Risk:** Medium-High - Build tool changes may affect build process
- **Package.json specifies:** ^6.0.7
- **Recommendation:** Review Vite 7 migration guide before updating
- **Priority:** High (for features/performance, test thoroughly)

#### 🔴 vite-plugin-pwa: 0.21.2 → 1.2.0
- **Type:** Major version update
- **Risk:** Medium - PWA configuration may need updates
- **Package.json specifies:** ^0.21.1
- **Recommendation:** Review PWA plugin changelog for breaking changes
- **Priority:** Medium

### Minor/Patch Updates (Safe to Update)

#### 🟡 @typescript-eslint/eslint-plugin: 8.52.0 → 8.53.0
- **Type:** Minor update
- **Risk:** Low
- **Recommendation:** Safe to update
- **Priority:** Low

#### 🟡 @typescript-eslint/parser: 8.52.0 → 8.53.0
- **Type:** Minor update
- **Risk:** Low
- **Recommendation:** Safe to update
- **Priority:** Low

#### 🟢 @vitest/ui: 4.0.16 → 4.0.17
- **Type:** Patch update
- **Risk:** Very Low
- **Recommendation:** Safe to update
- **Priority:** Low

#### 🟢 vitest: 4.0.16 → 4.0.17
- **Type:** Patch update
- **Risk:** Very Low
- **Recommendation:** Safe to update
- **Priority:** Low

---

## 3. Dependency Bloat Analysis

### Production Dependencies (Runtime)

| Package | Size | Purpose | Status |
|---------|------|---------|--------|
| **html5-qrcode** | 2.6MB | QR code scanning functionality | ✅ Essential - Used in src/ui/phases/1-Identify.ts |
| **idb** | 80KB | IndexedDB wrapper for data persistence | ✅ Essential - Used in src/data/db.ts |

**Total Production Size:** ~2.7MB
**Assessment:** ✅ **EXCELLENT** - Very lean production bundle

### Development Dependencies

| Package | Size | Purpose | Recommendation |
|---------|------|---------|----------------|
| **typescript** | 23MB | TypeScript compiler | ✅ Keep - Essential |
| **@babel** | 13MB | Transpilation (transitive) | ✅ Keep - Required by tooling |
| **@esbuild** | 9.9MB | Fast bundling | ✅ Keep - Vite dependency |
| **prettier** | 8.3MB | Code formatting | ✅ Keep - Code quality |
| **workbox-build** | 7.1MB | PWA service worker | ✅ Keep - Core feature |
| **eslint** | 4.3MB | Code linting | ✅ Keep - Code quality |
| **@rollup** | 4.2MB | Bundling | ✅ Keep - Vite dependency |
| **@typescript-eslint** | 4.1MB | TS linting rules | ✅ Keep - Essential for TS |
| **@vitest** | 2.7MB | Testing framework | ✅ Keep - Essential for testing |
| **vite** | 2.6MB | Build tool | ✅ Keep - Core build system |
| **@types** | 2.6MB | Type definitions | ✅ Keep - Essential for TS |

**Total Dev Dependencies Size:** ~129MB
**Assessment:** ✅ **GOOD** - Appropriate size for a modern TypeScript PWA project

### Potential Optimization Opportunities

#### 🟢 Low Priority - html5-qrcode Alternatives

The `html5-qrcode` package (2.6MB) is the largest production dependency. Consider alternatives if size becomes critical:

**Alternatives:**
- **@zxing/browser** (~500KB) - Lighter ZXing port
- **qr-scanner** (~100KB) - Minimalist QR scanner
- **jsqr** (~50KB) - Bare-bones QR decoder (requires manual camera handling)

**Analysis:**
- Current: html5-qrcode provides full UI and camera management
- Switching would require significant UI development effort
- Savings: Potentially 2-2.5MB
- **Recommendation:** ✅ **Keep current implementation** - The convenience and features justify the size

#### 🔵 Consider - Selective ESLint Plugin Loading

**Current:** Full ESLint with Prettier integration
**Potential Optimization:** Use `eslint-config-prettier` only (already included)
**Savings:** Minimal (~1-2MB dev dependencies)
**Recommendation:** ⚠️ **Not worth it** - Developer experience is more valuable

---

## 4. Unnecessary Dependencies

### ✅ No Unnecessary Dependencies Detected

All installed dependencies are either:
1. Directly used in source code (production dependencies)
2. Required by development tooling (dev dependencies)
3. Transitive dependencies of the above

**Analysis:**
- Production dependencies: Both actively used in codebase
- Dev dependencies: All support development, testing, or building
- No orphaned or unused packages detected

---

## 5. Recommendations

### Immediate Actions (Priority 1)

1. **Update patch versions (safest updates):**
   ```bash
   npm update @vitest/ui vitest
   ```

2. **Update minor versions (low risk):**
   ```bash
   npm update @typescript-eslint/eslint-plugin @typescript-eslint/parser
   ```

### Short-term Actions (Priority 2)

3. **Test and update TypeScript definitions:**
   ```bash
   npm install --save-dev @types/node@25.0.7
   npm run type-check
   npm run test
   ```

### Medium-term Actions (Priority 3)

4. **Plan Vite 7 migration:**
   - Review Vite 7.0 changelog and migration guide
   - Test in development environment
   - Update vite-plugin-pwa to compatible version
   - Run full test suite
   - **Command (after testing):**
   ```bash
   npm install --save-dev vite@7 vite-plugin-pwa@1
   npm run build
   npm run test
   ```

### Long-term Monitoring

5. **Set up automated dependency monitoring:**
   - Consider: Dependabot, Renovate, or Snyk
   - Enable automated security updates
   - Regular monthly dependency reviews

6. **Track deprecated dependencies:**
   - Monitor `sourcemap-codec` and `source-map` deprecations
   - Update when parent packages release fixes

---

## 6. Updated package.json (Recommended)

### Conservative Update (Patch/Minor only)

```json
{
  "devDependencies": {
    "@types/node": "^22.19.5",
    "@typescript-eslint/eslint-plugin": "^8.53.0",
    "@typescript-eslint/parser": "^8.53.0",
    "@vitest/ui": "^4.0.17",
    "vitest": "^4.0.17"
  }
}
```

### Progressive Update (Include major versions - requires testing)

```json
{
  "devDependencies": {
    "@types/node": "^25.0.7",
    "@typescript-eslint/eslint-plugin": "^8.53.0",
    "@typescript-eslint/parser": "^8.53.0",
    "@vitest/ui": "^4.0.17",
    "vite": "^7.3.1",
    "vite-plugin-pwa": "^1.2.0",
    "vitest": "^4.0.17"
  }
}
```

---

## 7. Risk Assessment Matrix

| Update | Risk Level | Testing Required | Estimated Effort |
|--------|------------|------------------|------------------|
| @vitest/ui, vitest | 🟢 Low | Basic test run | 5 minutes |
| @typescript-eslint/* | 🟢 Low | Lint check | 5 minutes |
| @types/node | 🟡 Medium | Type checking | 15 minutes |
| vite-plugin-pwa | 🟡 Medium | PWA functionality test | 30 minutes |
| vite | 🟠 Medium-High | Full build & test suite | 1-2 hours |

---

## 8. Conclusion

### Overall Health Score: 9/10 🌟

**Strengths:**
- ✅ Zero security vulnerabilities
- ✅ Minimal production dependencies (2.7MB)
- ✅ No unnecessary bloat
- ✅ All dependencies actively used
- ✅ Modern, well-maintained packages

**Areas for Improvement:**
- ⚠️ Several packages are outdated (7 packages)
- ⚠️ Major version updates available requiring testing
- ⚠️ Minor deprecation warnings in transitive dependencies

**Final Recommendation:**
The project has excellent dependency hygiene. Apply patch/minor updates immediately, and plan for major version updates (especially Vite 7) in the next development cycle with proper testing.

---

## Appendix: Commands Reference

```bash
# Check for updates
npm outdated

# Security audit
npm audit

# Update specific packages
npm update <package-name>

# Install specific version
npm install --save-dev <package>@<version>

# Check for unused dependencies (requires depcheck)
npx depcheck

# Analyze bundle size (after build)
npx vite-bundle-visualizer
```
