# Changelog

All notable changes to Makerly will be documented in this file.

## [0.1.0.0] - 2026-04-11

### Added
- ESLint and Vitest test infrastructure with 31 unit tests covering routing, GitHub import mapping, and admin checks
- Keyboard accessibility: focus-visible styles for all interactive elements
- Screen reader support: aria-live region for notifications
- Prefers-reduced-motion support for users who disable animations
- Google Fonts preloading to reduce flash of unstyled text
- Project dates now use month/year picker instead of full date picker

### Changed
- Standardized heading sizes (H2=32px, H3=24px) across all pages
- Increased nav button height to 44px minimum touch target
- Replaced `transition: all` with explicit transition properties for performance
- Added CLAUDE.md with skill routing rules and health stack config
