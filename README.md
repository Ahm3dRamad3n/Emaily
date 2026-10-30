<div align="center">

# Emaily — Frontend

**A form-to-email routing platform.** A public marketing site, an authenticated
dashboard, and an admin panel — built in vanilla HTML, CSS, and JavaScript with
no framework and no build step.

[**Live demo →**](https://emaily-plus.vercel.app/) · [**Backend repository →**](https://github.com/Ahm3dRamad3n/EmailyBackend)

</div>

---

## Overview

Emaily lets a developer connect an email account they already own — Gmail,
Outlook, SendGrid, Resend, or plain SMTP — and route form submissions through
it with a single API key. This repository is the complete client for that
platform:

- a **public site** (landing page, features, pricing, docs, API reference, support, legal pages),
- an **authenticated dashboard** for managing projects, templates, and sending services, and for tracing every submission, and
- a separate **admin panel** for operating the platform.

It is a Multi-Page Application: every route is a real `.html` file rather than
a client-side route. One shared script drives all interactivity across every
page.

> The backend API lives in a separate repository: [EmailyBackend](https://github.com/Ahm3dRamad3n/EmailyBackend).

## Tech stack

| | |
|---|---|
| **Markup / styling** | Semantic HTML5, Tailwind CSS (loaded from the CDN), and a custom design-system stylesheet |
| **Scripting** | Vanilla JavaScript (ES6+), loaded as native ES modules |
| **Fonts** | Sora (display), Inter (body), JetBrains Mono (code) via Google Fonts |
| **Analytics** | Google Analytics, injected dynamically by `app.js` |
| **Build tooling** | None — no bundler, package manager, or transpilation step |
| **Hosting** | Vercel |

Because the scripts are native ES modules, the site **must be served over HTTP**
— it will not work when `index.html` is opened directly from the filesystem.

## Repository structure

```
/
├── index.html                  Public landing page (site root)
├── LICENSE
├── .gitignore
├── css/
│   └── style.css               The entire design system
├── js/
│   ├── env.js                  BASE_URL configuration
│   ├── api.js                  API transport, token storage, token refresh, service modules
│   └── app.js                  Page bootstrapping, rendering, auth guards, and the
│                               global data-action event system
├── assets/
│   └── logo.png
├── app/                        Public pages
│   ├── features.html
│   ├── pricing.html
│   ├── docs.html
│   ├── api-reference.html
│   ├── support.html
│   ├── privacy.html
│   └── terms.html
├── src/                        Authenticated application
│   ├── login.html
│   ├── register.html
│   ├── reset-password.html
│   ├── dashboard.html
│   ├── projects.html
│   ├── templates.html
│   ├── template-editor.html
│   ├── services.html
│   ├── history.html
│   ├── analytics.html
│   ├── billing.html
│   └── account.html
└── admin/                      Admin-only application
    ├── index.html
    ├── analytics.html
    ├── users.html
    ├── projects.html
    ├── templates.html
    ├── services.html
    ├── banned.html
    ├── plans.html
    └── logs.html
```

## Architecture

### Page bootstrapping

Every HTML file declares which page it is through a `data-page` attribute on
`<body>`. On load, `app.js` reads it and runs the matching page logic —
navigation between pages is ordinary multi-page navigation.

### Shared navbar and footer

Pages don't carry hand-written navigation. Each one ships two empty containers:

```html
<header class="glass sticky top-0 z-50" id="navbar-root"></header>
…
<footer id="dynamic-footer" class="mt-auto w-full"></footer>
```

`app.js` mounts the real navbar and footer into them at runtime, which keeps
navigation, auth-aware menu state, and the footer consistent everywhere
without duplicated markup. Authenticated and admin pages additionally mount a
sidebar.

### One global event system

Interactive elements are wired through a single delegated click handler keyed
off a `data-action` attribute, rather than through listeners bound element by
element. That one mechanism covers CRUD actions, tab switching, pause/resume
toggles, copy-to-clipboard, code-snippet language tabs, retries, plan-limit
unlock actions, pagination, and the admin actions. Adding a new interactive
element is usually a matter of adding a `data-action` attribute and a handler
case.

### API layer

- `js/env.js` holds the single `BASE_URL` value.
- `js/api.js` owns request transport, token storage, token refresh, and the
  per-resource service modules the pages call.
- `js/app.js` consumes those services for rendering and interaction.

The frontend has **no mock or demo mode** — it talks to the real backend for
all authenticated data.

## Design system — "Industrial Blueprint"

A deliberately brutalist, engineering-drawing look: dark navy surfaces, a
faint blueprint grid, zero border-radius, dashed structural borders, and hard
offset shadows instead of soft blur. Every theme value lives in the `:root`
block of `css/style.css`, so the whole look can be re-themed from one place.

A few conventions worth knowing before editing styles:

- **Structural borders are dashed; state indicators are solid.** Cards, inputs,
  and tables use dashed borders; focus rings and active tab/nav markers stay
  solid so feedback is never lost in the sketch-line styling.
- **Buttons press into their shadow on click; cards lift away from theirs on
  hover** — one consistent interaction language.
- **The admin panel swaps the accent palette** (rust-red / burnt-orange instead
  of amber) by reassigning a few CSS variables, so it is visually unmistakable
  which app you are in without duplicating any component styles.
- **Scroll performance is deliberate.** The blueprint grid uses
  `position: fixed` rather than `background-attachment: fixed`; the routing
  animation moves with `transform` rather than `left`/`top`; and the decorative
  glow orbs and starfield are intentionally disabled.

## Features

### Public site

- **Landing page** — product positioning, a live routing animation, the
  how-it-works flow, capabilities, integrations, security, pricing preview, and
  cross-links to docs and support.
- **Features** — every platform capability, grouped by purpose.
- **Pricing** — the Free, Pro, and Business plans with their real limits and
  prices, and how quota overruns are handled.
- **Docs** — a quick start (register → connect a service → create a template →
  set an access mode → submit), access-mode reference, template variables,
  programmatic submission, and logs/retries.
- **API reference** — endpoint documentation with method badges, request and
  response tables, and copyable cURL / JavaScript snippets.
- **Support** — complaint and suggestion forms with client-side validation, a
  searchable FAQ, and contact information.
- **Privacy** and **Terms**.

### Authentication

- Registration with email verification, login, and logout.
- Forgot-password flow and a dedicated reset-password page.
- Automatic token refresh, and route protection that sends unauthenticated
  visitors to login.

### Dashboard

- **Overview** (`dashboard.html`) — account summary, plan, and remaining email
  quota.
- **Projects** — create and edit projects, regenerate API keys, switch the
  access mode (FrontendOnly / BackendOnly / Hybrid), manage the domain
  allow-list, pause/resume, and delete. Resources locked by a plan downgrade
  can be unlocked within the current plan's allowance.
- **Services** — connect Gmail or Microsoft through an OAuth popup flow, add
  SendGrid or Resend by API key, or add SMTP with an app password; edit,
  pause/resume, and delete.
- **Templates and the template editor** — a dedicated full-page editor covering
  email details, reCAPTCHA v2 and App Check settings, save-to-history, auto-reply
  chaining, a sending-service selector, and plan-limited attachments. Each
  template has a **test-submission** modal and generates ready-to-paste
  integration snippets in **Browser JavaScript, Node.js, Python, and C#**.
- **History** — per-project submission log with the full status lifecycle,
  payload and rendered-HTML inspection, and one-click retry for eligible
  failures.
- **Analytics** — account-wide and per-project submission volume and success
  rates, drawn as custom inline SVG (no chart library).
- **Billing** — current plan and subscription details, invoices, plan changes
  (free-plan downgrade confirmation; a contact-admin flow for paid plans), and
  banners for resources locked by plan limits.
- **Account** — edit profile, change password, delete account.

### Admin panel

Separately themed, and operating on the whole platform:

- **Overview** and **Analytics** — system-wide users, projects, revenue, and
  delivery success rates.
- **Users** — search, suspend/reactivate, and drill into a user's projects.
- **Projects, Templates, Services** — system-wide browsers with single-record
  detail views.
- **Banned** — review banned identifiers, reduce a ban's level, or remove it.
- **Plans** — create and edit subscription plans and their limits.
- **Logs** — system log browser.

## Authentication and access control

Session tokens are stored in `localStorage` and refreshed automatically. Page
logic redirects unauthenticated visitors away from `src/` pages and
non-admins away from `admin/` pages.

These guards exist for navigation and user experience only. **The frontend
checks are not a security boundary** — all authorization is enforced by the
backend.

## Accessibility and UX

- Inline, accessible form validation (`role="alert"`, `aria-describedby`) on
  the support forms and elsewhere.
- Explicit loading, empty, and error states rather than blank screens.
- Responsive layouts with a real mobile navigation pattern, and collapsible
  sidebars for the docs and API reference on small screens.
- `prefers-reduced-motion` is respected globally.
- Visible focus rings throughout, and disclosure widgets (FAQ accordion, mobile
  menus) keep `aria-expanded` in sync.

## Getting started

1. Clone the repository.
2. Make sure the backend API is running, then open `js/env.js` and set
   `BASE_URL` to its address. The repository defaults to a local development
   URL (`https://localhost:7104/api`) and keeps a production URL as a commented
   line to swap in when deploying.
3. Serve the repository root with any static file server, for example:
   ```bash
   npx serve .
   ```
   or the VS Code Live Server extension.
4. Open the served root for the public site, or `src/login.html` to reach the
   application. There is nothing to install or build.

## Known limitations

- **`BASE_URL` is switched by hand.** The production URL is a commented-out
  line in `js/env.js`, not selected through an environment or build system.
- **Admin protection in the frontend is not security.** It redirects non-admins
  for a clean experience; the backend must (and does) enforce real authorization.
- **Tokens are kept in `localStorage`,** which is readable by any JavaScript
  running on the origin.
- **Secondary data fails quietly.** Some calls fall back to empty values for
  non-essential data, so a page can render empty rather than showing a hard
  error.
- **`close-toc` bug.** In `app.js`, the `close-toc` action falls through into
  `toggle-toc` because it has no terminating `break`/`return`, so on pages that
  use it the close control can re-open the panel it just closed.
- **Stale comments.** Some comments in `js/api.js` point to a `CHANGELOG.txt`
  that is not in the repository.
- **No automated tests or build pipeline.**
- **Chart colors are inline hex values** in `app.js` rather than CSS variables,
  so they do not follow theme changes.

## Author

**Ahmed Ramadan** — built as a personal project to practice production-style
full-stack development.
[Portfolio / contact →](https://ahm3dramad3n.github.io/portfolio/en/contact.html)

## License

Released under the **Emaily Personal & Educational License** — see
[`LICENSE`](./LICENSE) for the authoritative text. In short:

- You are welcome to read, study, and learn from the code, and to use
  snippets for personal, educational, and learning purposes.
- You may **not** use the Emaily name, logos, the "Industrial Blueprint"
  design system, or any original branding assets.
- You may **not** host or deploy a clone of this software and present it as
  your own product, project, or service.
- You may **not** use it for commercial purposes or monetization.

The software is provided "as is", without warranty of any kind.
