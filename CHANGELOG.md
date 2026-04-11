# Changelog

All notable changes to Makerly will be documented in this file.

## [0.1.2.0] - 2026-04-11

### Added
- Headline stats on maker profile: total raised, total valuation, users reached, things made in a 2x2 grid with adaptive layout
- Philosophy quote section on profile (italic, between bio and first make)
- Press / social proof strip ("AS SEEN IN") with clickable source links
- Per-project financial fields: funding raised, valuation, users reached with human-friendly input (type "$1.5M" or "50K")
- Profile-level headline stat overrides (curate totals independent of per-project sums)
- Press links management in Edit Profile (JSONB with url/source per entry)
- Formatting helpers extracted to `src/lib/format.js` with 26 unit tests
- Database migrations for 3 new project columns and 5 new profile columns

### Removed
- Role breakdown chart (solo vs cofounded) from profile sidebar

### Fixed
- Nullish coalescing for profile stat overrides (explicit 0 no longer treated as null)
- Nullish coalescing for project financial fields in create/update/read (`|| 0` → `?? 0`)
- K/M boundary rounding ($999,500 now displays as $1M, not $1000K)
- Locale-pinned number formatting for consistent display across environments
- Philosophy input capped at 200 characters

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
