# Changelog

All notable changes to Makerly will be documented in this file.

## [0.1.5.0] - 2026-04-17

### Added
- PostHog analytics instrumented across the viral loop: signup, signin, profile share (per platform), contact form open/submit, project created, update posted, and welcome-email blast events
- UTM tags on welcome email CTAs so email-driven visits and shares are attributable in analytics
- Makers Club Telegram CTA on the landing page

### Changed
- Contact form button on profiles reveals a tracked inline form instead of an email display
- Welcome email share links carry per-button UTM content (cta / share / invite) for funnel attribution

### Fixed
- Bulk Select button visibility (switched from ghost to secondary variant)

## [0.1.4.0] - 2026-04-15

### Added
- Bulk delete for projects: select multiple projects and delete in one action
- OG image card endpoint for shareable profile links (`/api/og-card`)
- Welcome email blast endpoint for existing squad members
- Retro email endpoint for one-time squad notifications

### Changed
- Email provider switched from Resend to Postmark across all 6 endpoints
- All email from addresses now use pareen@makerly.me
- Comprehensive site footer now appears on every page (Dashboard, Auth, Edit Profile, Onboarding, Directory)

### Fixed
- HTML escaping in Cracked Squad application notification emails (XSS prevention)
- Email format validation in contact form (prevents header injection)
- Bulk delete uses Promise.allSettled for graceful partial failure handling
- Removed env var leak from retro-emails error response
- Removed stale .filter(Boolean) on promises in admin toggle

## [0.1.3.0] - 2026-04-12

### Added
- Cracked Squad program: elite landing page at `/cracked-squad` with self-selecting copy, application form, and member showcase with rich profile cards
- Cracked Squad admin management: search, multi-select, and bulk add/remove directly in the Users tab with inline CRACKED badge
- Cracked Squad application review tab in admin panel with accept/reject workflow
- Cracked Squad badge on individual profiles and in maker directory with filter toggle
- Email notification when someone applies to Cracked Squad (via Resend API)
- Recruiter page with project listings and maker profiles
- Private contact form replacing public email display (via `/api/contact-maker`)
- Comprehensive site footer with links to all sections, consistent across all pages

### Changed
- Admin panel Users tab now has search bar, checkboxes, and bulk squad management
- Cracked Squad tab renamed to Applications (member management moved to Users tab)

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
