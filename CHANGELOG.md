# Changelog

All notable changes to Makerly will be documented in this file.

## [0.1.1.0] - 2026-04-11

### Added
- Mobile-first responsive design with hamburger menu and slide-out navigation drawer
- Breakpoints at 768px and 480px for tablet and phone layouts
- MobileMenuButton and MobileDrawer components with Escape key dismissal and scroll lock
- ARIA landmarks on navigation, modals, and interactive cards
- Skip-to-content link and screen-reader-only utility classes
- Keyboard navigation for project cards (Enter/Space to edit)
- Dialog roles and aria-modal on all modals
- 7 new component tests for mobile navigation (38 total)

### Changed
- Extracted 21 design tokens (colors, fonts, radii, surfaces) into centralized `t` object
- Replaced 490+ inline hex values with token references for consistency
- Consolidated 4 separate media query blocks into 2 global breakpoints

### Fixed
- Keyboard event bubbling on project delete button that could trigger simultaneous edit and delete
- Mobile drawer now prevents background scrolling and responds to Escape key

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
