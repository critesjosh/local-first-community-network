# Repository Guidelines

## Project Structure & Module Organization
- `App.tsx` gates onboarding and then hands off to `src/navigation/AppNavigator`.
- `src/components`, `src/screens`, and `src/navigation` split reusable UI, feature flows, and navigation stacks.
- `src/services` manages crypto identity, storage, and BLE access; `src/utils` and `src/types` hold shared helpers and interfaces.
- Tests mirror features under `__tests__`, mocks live in `__mocks__`, assets in `assets/`, and Expo/native config in `android/`, `app.json`, and `eas.json`.

## Build, Test, and Development Commands
- `npm start` launches the Expo bundler; add `--clear` when troubleshooting caches.
- `npm run start:dev-client` opens the same bundler against custom dev clients.
- `npm run android` / `npm run ios` build and install native apps locally; use `npm run web` for the browser preview.
- `npm run prebuild` (or `prebuild:clean`) regenerates native projects after dependency or config changes.
- `npm run build:android|ios` performs local EAS builds for release verification.
- `npm test`, `npm run test:watch`, and `npm run test:coverage` drive the Jest suite.

## Coding Style & Naming Conventions
- TypeScript runs in strict mode; stick to `.ts/.tsx` and Expo’s base settings in `tsconfig.json`.
- Match the existing style: two-space indentation, semicolons, single quotes, and co-located `StyleSheet.create` blocks.
- Components/screens use `PascalCase`; hooks, services, stores, and utilities use `camelCase`. Centralize reusable types in `src/types`.

## Testing Guidelines
- Jest with `@testing-library/react-native` is configured in `jest.config.js`, with shared setup in `__tests__/setup.ts`.
- Mirror the feature folder in `__tests__/featureName/*.test.tsx` and rely on pre-built mocks in `__mocks__/` for native modules.
- Run `npm run test:watch` while building features and confirm `npm run test:coverage` before opening a pull request, especially for crypto and onboarding logic.

## Commit & Pull Request Guidelines
- History favors short, imperative messages without prefixes (e.g., `add prd and plan`). Keep them under ~72 characters and focused on intent.
- PRs should outline the change, link issues, and include screenshots or screen recordings for UI updates plus a brief test plan.
- Re-run the affected Expo target or Jest command after native or dependency edits and document extra steps in the PR body.

## Expo Configuration & Secrets
- App metadata lives in `app.json`, and build profiles are tracked in `eas.json`; keep them in sync with mobile release notes.
- Never commit secrets. Use Expo Secure Store (`expo-secure-store`) or platform secret managers and describe the provisioning steps in your PR when a new key is required.
