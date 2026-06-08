---
version: alpha
name: Arc
description: "A browser-as-identity-statement with a vertically stacked sidebar in a custom gradient-tinted dark surface, user-theming that lets the chrome inherit personal color choices, and a minimal content window that disappears entirely when browsing. The Browser Company's visual language is self-aware and editorial — the marketing site uses a rich warm cream (#FAFAF8) with expressive variable-weight display type (Oh no! Type or Monument Grotesk), hand-drawn details, and genuine personality. In-app, Arc is whatever color its owner makes it: the system UI is purposely recessive, surfacing only when invoked."

colors:
  primary: "#8E5FEB"
  on-primary: "#ffffff"
  primary-hover: "#7A4ED4"
  secondary: "#F0845A"
  ink: "#1A1A1A"
  ink-muted: "#6B6B6B"
  canvas: "#FAFAF8"
  surface-1: "#F0EFE9"
  surface-2: "#E4E2DA"
  border: "#D8D5CC"
  sidebar-bg: "#1C1C1C"
  sidebar-text: "#E8E8E8"
  sidebar-muted: "#888888"
  gradient-start: "#C77DFF"
  gradient-end: "#4CC9F0"

typography:
  display:
    fontFamily: "Monument Grotesk, Neue Haas Grotesk, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 800
    lineHeight: 1.0
    letterSpacing: -0.03em
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0

spacing:
  base: 8px
  scale: [4, 8, 12, 16, 24, 32, 48, 64, 96]

radius:
  sm: 6px
  md: 10px
  lg: 16px
  xl: 24px
  pill: 9999px

shadows:
  card: "0 2px 8px rgba(0,0,0,0.06)"
  elevated: "0 8px 32px rgba(0,0,0,0.12)"
  sidebar: "2px 0 16px rgba(0,0,0,0.2)"

motion:
  duration-fast: 100ms
  duration-base: 220ms
  easing: cubic-bezier(0.16, 1, 0.3, 1)
---

## Rationale

**User-defined color as the core design principle** — Arc delegates color identity to users rather than asserting its own, which is philosophically coherent with their "browser as personal OS" positioning. The product's job is to disappear into your workflow, and a browser that imposes its own chromatic personality would compete with every site you visit.

**Lavender default as a gentle invitation** — When users haven't customized their space, Arc falls back to #8E5FEB — a purple that feels personal and slightly playful rather than corporate. It's differentiated enough from Chrome blue and Safari neutral to be immediately recognizable as Arc without being aggressive.

**Expressive marketing, invisible product** — The deliberate contrast between bold editorial marketing typography (Monument Grotesk at 800 weight) and the system-font-based in-app UI is intentional brand storytelling: Arc is confident about its ideas but recedes when you're actually using it.

**Vertical sidebar as spatial metaphor** — Committing to a full vertical sidebar at a time when most browsers had abandoned the paradigm was a bet that tab management is an organizational problem, not a page-navigation problem. The spatial, persistent sidebar communicates that your tabs are places you inhabit, not a stack you clear.

**Warm cream marketing canvas** — The #FAFAF8 marketing surface is approachable and human rather than startup-white, which matches The Browser Company's editorial voice. It says "this is made by people with taste," which is the brand's core differentiation from utilitarian Chromium forks.

## 1. Visual Theme & Atmosphere
Arc is the browser for people who are bored by browsers. The Browser Company designed it as a personal operating system — the sidebar holds your identity (pinned tabs, spaces, profiles), and the content window is intentionally chrome-free. The marketing language is earnest and slightly irreverent, set in expressive display type with warm paper-toned backgrounds. In use, the app is invisible: it gets out of the way and lets the web be the UI.

## 2. Color System
Arc's in-app color system is user-defined — spaces can be themed to any gradient, turning purple one session and ocean-blue the next. The default shell uses:
- **Sidebar**: #1C1C1C dark surface with user's theme gradient as the active accent
- **Default accent**: #8E5FEB lavender-purple — the "Arc" color when user hasn't customized
- **Marketing canvas**: #FAFAF8 — warm cream, very approachable
- **Gradient vocabulary**: Purple (#C77DFF) to cyan (#4CC9F0) is the signature Arc palette
- **Type**: Dark near-black on cream, white on dark sidebar

## 3. Typography
Marketing uses Monument Grotesk or Neue Haas Grotesk at extreme weights (800) with very tight tracking — editorial, magazine-like. The in-app UI inherits macOS system fonts. The contrast between the expressive marketing voice and the functional app chrome is intentional: Arc the product is your canvas, not theirs.

## 4. Components & Patterns
- **Vertical sidebar**: Pinned tabs as favicons, folder groups, space switcher at bottom
- **Command bar**: Spotlight-style full-screen search (Cmd+T), launches tabs and actions
- **Little Arc**: Mini-window popup for quick browsing without leaving current context
- **Easel**: Split-panel scratch space for notes and media alongside web pages
- **Boosts**: User-customizable CSS/JS for any site — nerd feature surfaced prominently

## 5. Spacing & Layout
Sidebar width: 200–280px adjustable. Tab favicon size: 20px. Minimal title bar. Marketing site uses editorial-magazine columns, wide gutters, and asymmetric layouts. Dense and personality-driven rather than grid-rigid.

## 6. Motion & Interaction
Smooth, spring-based animations throughout. Panel expansion springs open. Tab switching has a subtle vertical slide. The command palette drops in with a quick ease-out. Hover on favicon tabs shows full title in a popout tooltip.

## Accessibility

### Contrast Ratios
- **Primary on background** (#8E5FEB on #FAFAF8): 4.0:1 — passes AA (large text/UI components), fails AAA
- **Text on background** (#1A1A1A on #FAFAF8): 16.7:1 — passes AA, passes AAA
- **Muted on background** (#6B6B6B on #FAFAF8): 5.1:1 — passes AA, fails AAA

### Minimum Requirements
- **Touch target**: 44×44px minimum for all interactive elements
- **Focus indicator**: #8E5FEB outline, 2px, 2px offset
- **Focus contrast**: 4.0:1 against #FAFAF8 background

### Motion
- Respects `prefers-reduced-motion`: yes — all transitions and animations should be suppressed
- All transitions use `@media (prefers-reduced-motion: reduce)` guard

### Notes
- The primary purple #8E5FEB reaches only 4.0:1 on the off-white canvas — it passes AA for large text and UI components (≥3:1) but falls just short of the 4.5:1 AA threshold for normal-weight text; avoid using it as the sole color for body-copy labels.
- Spring animations are central to Arc's identity; ensure all spring-based panel, tab, and command-palette animations are disabled under `prefers-reduced-motion`.
- The off-white canvas #FAFAF8 is very close to white; verify the primary purple still meets sufficient contrast against any darker surface variants (e.g. sidebar tints) before using as text color.
- Muted text #6B6B6B at 5.1:1 comfortably passes AA but not AAA — acceptable for secondary labels and metadata, but not for critical status or error messages.
