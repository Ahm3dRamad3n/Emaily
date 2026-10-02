/* ============================================================
   EMAILY — app.js
   Shared across every page. Each HTML file sets
   <body data-page="..."> and this file:
     1. figures out whether the page needs an authenticated
        (or admin) session and redirects if not,
     2. mounts the shared navbar/sidebar into #navbar-root /
        #sidebar-root when present,
     3. runs the init function for that specific page.
   All backend calls go through the services exported from api.js
   ============================================================ */

import {
  AuthService,
  UserService,
  BillingService,
  ProjectService,
  ServiceService,
  IntegrationService,
  TemplateService,
  SubmissionService,
  AnalyticsService,
  AdminService,
  tokenStore,
} from "./api.js";
import { BASE_URL } from "./env.js";

let currentSubscriptionData = null;
/* ============================================================
   Path helpers — the admin/ folder is one level down, so every
   link and asset path has to account for that.
   ============================================================ */
const inAdmin = location.pathname.includes("/admin/");
const path = window.location.pathname;
const isLanding = path === "/" || path === "/index.html" || path === "/index";

const PAGE_URLS = {
  landing: "index.html",
  support: "app/support.html",
  terms: "app/terms.html",
  privacy: "app/privacy.html",
  pricing: "app/pricing.html",
  features: "app/features.html",
  docs: "app/docs.html",
  "api-reference": "app/api-reference.html",
  login: "src/login.html",
  register: "src/register.html",
  dashboard: "src/dashboard.html",
  projects: "src/projects.html",
  templates: "src/templates.html",
  services: "src/services.html",
  "template-editor": "src/template-editor.html",
  history: "src/history.html",
  billing: "src/billing.html",
  account: "src/account.html",
  analytics: "src/analytics.html",
  "admin-dashboard": "admin/index.html",
  "admin-users": "admin/users.html",
  "admin-projects": "admin/projects.html",
  "admin-templates": "admin/templates.html",
  "admin-services": "admin/services.html",
  "admin-logs": "admin/logs.html",
  "admin-banned": "admin/banned.html",
  "admin-plans": "admin/plans.html",
  "admin-analytics": "admin/analytics.html",
};

function urlFor(pageKey, query = "") {
  const path = PAGE_URLS[pageKey];
  if (!path) return "#";
  const resolved = isLanding ? path : "../" + path;
  return resolved + query;
}

function assetPath(name) {
  return (isLanding ? "assets/" : "../assets/") + name;
}

function redirectTo(pageKey, query = "") {
  window.location.href = urlFor(pageKey, query);
}

/* ============================================================
   DOM & format helpers
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(unsafeText) {
  if (unsafeText === null || unsafeText === undefined) return "";

  return String(unsafeText)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function friendlyError(
  err,
  fallback = "Something went wrong. Please try again.",
) {
  return (err && err.message) || fallback;
}

/* ============================================================
   Toasts
   ============================================================ */
function showToast(message, type = "info") {
  const container = $("#toast-container");
  if (!container) return;

  const el = document.createElement("div");
  el.className = `toast is-${type} flex items-center justify-between gap-3`;

  el.innerHTML = `
    <span class="flex-1">${escapeHtml(message)}</span>
    <button type="button" class="close-toast-btn text-current opacity-70 hover:opacity-100 transition shrink-0" aria-label="Close">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </button>
  `;

  container.appendChild(el);

  // دالة مسؤولة عن تأثير الاختفاء ثم حذف العنصر
  const removeToast = () => {
    el.style.opacity = "0";
    el.style.transition = "opacity .25s ease";
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 250);
  };

  // تفعيل زر الإغلاق اليدوي
  const closeBtn = el.querySelector(".close-toast-btn");
  closeBtn.addEventListener("click", () => {
    removeToast();
  });

  // تحديد مدة العرض: 20 ثانية للأخطاء، و 4 ثواني للباقي
  const displayDuration = type === "error" ? 20000 : 4000;

  // الإخفاء التلقائي بعد انتهاء المدة (بشرط ألا يكون المستخدم قد أغلقه يدوياً)
  setTimeout(() => {
    if (el.parentNode) {
      removeToast();
    }
  }, displayDuration);
}

/* ============================================================
   Modal
   ============================================================ */
function openModal({ title, bodyHTML, footerHTML = "", wide = false }) {
  const root = $("#modal-root");
  root.innerHTML = `
    <div class="modal-panel glass glass-panel p-7" style="${wide ? "max-width: 640px;" : ""}" role="dialog" aria-modal="true">
      <div class="flex items-center justify-between mb-6">
        <h3 class="font-display font-semibold text-lg">${escapeHtml(title)}</h3>
        <button class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div>${bodyHTML}</div>
      ${footerHTML ? `<div class="mt-6 flex justify-end gap-3">${footerHTML}</div>` : ""}
    </div>
  `;
  root.classList.remove("hidden");
  root.classList.add("flex");
}

function closeModal() {
  const root = $("#modal-root");
  root.classList.add("hidden");
  root.classList.remove("flex");
  root.innerHTML = "";
}

function setBtnLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> ${escapeHtml(label)}`
    : escapeHtml(label);
}

/* ============================================================
   Clipboard
   ============================================================ */
async function copyToClipboard(text, btnEl) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure contexts / older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    if (btnEl) {
      const original = btnEl.innerHTML;
      btnEl.classList.add("is-copied");
      btnEl.innerHTML = ICONS.copy + " Copied";
      setTimeout(() => {
        btnEl.classList.remove("is-copied");
        btnEl.innerHTML = original;
      }, 1600);
    } else {
      showToast("Copied to clipboard.", "success");
    }
  } catch {
    showToast("Could not copy — copy it manually.", "error");
  }
}

/* ============================================================
   Icons (compact inline SVGs used in nav/sidebar)
   ============================================================ */
const ICONS = {
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  folder:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  services:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/></svg>',
  clock:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  card: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  users:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  ban: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41L13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  arrowLeft:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  logout:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  trash:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  chart:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  pencil:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  code: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  eye: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
};

/* ============================================================
   Layout: navbar + sidebar
   ============================================================ */
function getPublicNavbarHTML() {
  return `
      <div
        class="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between"
      >
        <a href="${urlFor("dashboard")}" class="flex items-center gap-3">
          <img
            src="${assetPath("logo.png")}"
            alt="Emaily"
            class="h-9 w-9 object-contain shimmer-text drop-shadow-[0_0_12px_rgba(251,191,36,0.55)]"
          />
          <span
            class="font-display font-bold text-lg tracking-tight shimmer-text"
            >Emaily</span
          >
        </a>

        <nav class="hidden md:!flex items-center gap-8" aria-label="Primary">
          <a href="${urlFor("landing", "#features")}" class="nav-link">Features</a>
          <a href="${urlFor("landing", "#how-it-works")}" class="nav-link">How it works</a>
          <a href="${urlFor("landing", "#security")}" class="nav-link">Security</a>
          <a href="${urlFor("docs")}" class="nav-link">Docs</a>
          <a href="${urlFor("pricing")}" class="nav-link">Pricing</a>
        </nav>

        <div class="flex items-center gap-3">
          <a
            href="${urlFor("login")}"
            class="btn btn-ghost btn-sm hidden sm:inline-flex"
            >Sign in</a
          >
          <a href="${urlFor("register")}" class="btn btn-aurora btn-sm"
            >Get your API key</a
          >
          <button
            id="mobile-menu-toggle"
            data-action="toggle-toc"
            data-target="mobile-menu"
            type="button"
            class="btn btn-icon btn-ghost md:hidden"
            aria-label="Open navigation menu"
            aria-expanded="false"
            aria-controls="mobile-menu"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        data-action="close-toc"
        data-target="mobile-menu-toggle"
        class="hidden md:hidden border-t"
        style="border-color: var(--glass-border)"
      >
        <nav class="flex flex-col gap-1 p-4" aria-label="Mobile">
          <a href="${urlFor("landing", "#features")}" class="nav-link py-2">Features</a>
          <a href="${urlFor("landing", "#how-it-works")}" class="nav-link py-2"
            >How it works</a
          >
          <a href="${urlFor("landing", "#security")}" class="nav-link py-2">Security</a>
          <a href="${urlFor("docs")}" class="nav-link py-2">Docs</a>
          <a href="${urlFor("pricing")}" class="nav-link py-2">Pricing</a>
          <a href="${urlFor("login")}" class="nav-link py-2">Sign in</a>
        </nav>
      </div>`;
}

function getDashboardNavbarHTML(user) {
  // فحص هل المستخدم قام بإغلاق الشريط في هذه الجلسة أم لا
  const isBetaBannerHidden =
    sessionStorage.getItem("hideBetaBanner") === "true";
  // لا تنسي ازاله case "close-beta-banner": اذا ازلت هذا الكود

  return `
    <!-- ================= START BETA BANNER (BRUTALIST BLUEPRINT THEME) ================= -->
    <!-- يمكنك حذف هذا الجزء بالكامل لاحقاً عند انتهاء مرحلة التطوير -->
    ${
      !isBetaBannerHidden
        ? `
    <div id="beta-banner" class="relative z-50 flex items-center justify-center gap-3 px-4 py-2.5 transition-all duration-300" style="background-color: var(--bg-void); border-bottom: 1px dashed var(--warning);">
      
      <!-- أيقونة برمجية/هندسية (Code/Terminal) -->
      <svg class="hidden sm:block w-4 h-4 shrink-0" style="color: var(--warning);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
      
      <!-- النص والروابط بخط الـ Mono ليتناسب مع الطابع الهندسي -->
      <p class="text-xs sm:text-sm font-medium pr-8 sm:pr-0 flex items-center flex-wrap justify-center gap-1.5" style="color: var(--text-primary); font-family: var(--font-mono);">
        <span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-none" style="background-color: var(--warning); color: var(--text-on-aurora);">[ BETA ]</span>
        <span style="color: var(--text-secondary);">System in active development. Found an anomaly or have a suggestion?</span>
        <a href="/support" class="inline-flex items-center transition-colors hover:opacity-80 underline decoration-1 underline-offset-4" style="color: var(--warning); text-decoration-color: var(--warning);">
          Report to engineering <span class="ml-1 text-lg leading-none">&rarr;</span>
        </a>
      </p>

      <!-- زر الإغلاق بحواف حادة -->
      <button type="button" class="absolute right-3 sm:right-4 p-1 rounded-none transition-all hover:opacity-70" style="color: var(--text-tertiary);" data-action="close-beta-banner" aria-label="Dismiss">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
    `
        : ""
    }
    <!-- ================= END BETA BANNER ================= -->

    <div class="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between" style="border-bottom: 1px dashed var(--glass-border);">
      <div class="flex items-center gap-4">
        <a href="${urlFor(inAdmin ? "admin-dashboard" : "dashboard")}" class="flex items-center gap-3">
          <img src="${assetPath("logo.png")}" alt="Emaily" class="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]" />
          <span class="font-display font-bold text-lg tracking-tight shimmer-text">Emaily</span>
          ${inAdmin ? '<span class="admin-tag">ADMIN</span>' : ""}
        </a>
        ${
          (user?.remainingQuota || 0) > 0
            ? `<span class="badge-pill inline-flex" title="Resets on the 1st of next month"><span class="dot bg-green-500"></span>Remaining: ${user.remainingQuota.toLocaleString()}</span>`
            : `<span class="badge-pill inline-flex border-red-500/50 bg-red-500/10 text-red-400" title="Quota exhausted! Now using overage."><span class="dot bg-red-500 animate-pulse"></span>Overage: ${(user?.overageEmails || 0).toLocaleString()}</span>`
        }
      </div>
      <div class="flex items-center gap-3">
        ${!inAdmin && isAdminRole(user) ? `<a href="${urlFor("admin-dashboard")}" class="btn btn-ghost btn-sm">Admin panel</a>` : ""}
        <span class="hidden sm:!inline text-sm text-secondary font-mono">${escapeHtml(user.email)}</span>
        <button class="btn btn-icon btn-ghost" data-action="logout" title="Log out" aria-label="Log out">${ICONS.logout}</button>
      </div>
    </div>
  `;
}

function renderNavbar(user) {
  const navbarRoot = $("#navbar-root");
  if (!navbarRoot) return;

  if (user) {
    navbarRoot.innerHTML = getDashboardNavbarHTML(user);
  } else {
    navbarRoot.innerHTML = getPublicNavbarHTML();
  }
}

function sidebarInnerHTML(activePage) {
  const links = inAdmin
    ? [
        ["admin-dashboard", "Overview", ICONS.grid],
        ["admin-analytics", "Analytics", ICONS.chart],
        ["admin-users", "Users", ICONS.users],
        ["admin-projects", "Projects", ICONS.folder],
        ["admin-templates", "Templates", ICONS.file],
        ["admin-services", "Services", ICONS.card],
        ["admin-banned", "Banned", ICONS.ban],
        ["admin-plans", "Plans", ICONS.tag],
        ["admin-logs", "Logs", ICONS.clock],
      ]
    : [
        ["dashboard", "Overview", ICONS.grid],
        ["projects", "Projects", ICONS.folder],
        ["templates", "Templates", ICONS.file],
        ["services", "Services", ICONS.services],
        ["history", "History", ICONS.clock],
        ["analytics", "Analytics", ICONS.chart],
        ["billing", "Billing", ICONS.card],
        ["account", "Account", ICONS.user],
      ];

  return `
    ${links
      .map(
        ([key, label, icon]) => `
      <a href="${urlFor(key)}" class="sidebar-link ${activePage === key ? "is-active" : ""}">
        <span class="sidebar-icon">${icon}</span> ${label}
      </a>
    `,
      )
      .join("")}
    <div class="my-2 h-px" style="background: var(--glass-border)"></div>
    ${inAdmin ? `<a href="${urlFor("dashboard")}" class="sidebar-link"><span class="sidebar-icon">${ICONS.arrowLeft}</span> Back to app</a>` : ""}
    <button class="sidebar-link" data-action="logout"><span class="sidebar-icon">${ICONS.logout}</span> Log out</button>
  `;
}

/* ============================================================
   Footer
   ============================================================ */

function getPublicFooterHTML() {
  return `
    <!-- خط علوي شفاف يفصل الفوتر عن محتوى الصفحة بسلاسة -->
    <div class="border-t border-white/10 pt-16 pb-8 mt-20">
      
      <!-- حاوية تضبط المحتوى في المنتصف وتمنعه من التمدد للأطراف -->
      <div class="max-w-7xl mx-auto px-6">
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          
          <!-- Brand & Description -->
          <div class="space-y-4 md:col-span-1">
            <div class="flex items-center gap-2">
              <img src="${assetPath("logo.png")}" alt="Emaily" class="h-6 w-6 object-contain" />
              <span class="font-display font-semibold text-lg text-white">Emaily</span>
            </div>
            <p class="text-tertiary text-sm leading-relaxed">
              Email API & routing for developers. Build, test, and deliver your transactional emails with confidence.
            </p>
          </div>
          
          <!-- Links: Product -->
          <div>
            <h4 class="font-display font-semibold mb-4 text-white">Product</h4>
            <ul class="space-y-2 text-sm text-secondary">
              <li><a href="${urlFor("features")}" class="hover:text-aurora transition">Features</a></li>
              <li><a href="${urlFor("pricing")}" class="hover:text-aurora transition">Pricing</a></li>
            </ul>
          </div>
          
          <!-- Links: Resources -->
          <div>
            <h4 class="font-display font-semibold mb-4 text-white">Resources</h4>
            <ul class="space-y-2 text-sm text-secondary">
              <li><a href="${urlFor("docs")}" class="hover:text-aurora transition">Documentation</a></li>
              <li><a href="${urlFor("api-reference")}" class="hover:text-aurora transition">API Reference</a></li>
            </ul>
          </div>
          
          <!-- Links: Legal -->
          <div>
            <h4 class="font-display font-semibold mb-4 text-white">Legal</h4>
            <ul class="space-y-2 text-sm text-secondary">
              <li><a href="${urlFor("privacy")}" class="hover:text-aurora transition">Privacy Policy</a></li>
              <li><a href="${urlFor("terms")}" class="hover:text-aurora transition">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        
        <!-- Copyright & Portfolio Credit -->
        <div class="pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p class="text-tertiary text-xs text-center md:text-left">
            © 2026 Emaily. All rights reserved.
          </p>
          <p class="text-tertiary text-xs text-center md:text-right">
            Designed and Developed by 
            <a href="https://ahm3dramad3n.github.io/portfolio/en/" target="_blank" rel="noopener noreferrer" class="text-secondary hover:text-aurora font-semibold transition">
              Ahmed Ramadan
            </a>
          </p>
        </div>
        
      </div>
    </div>
  `;
}

function getDashboardFooterHTML() {
  return `
    <div class="border-t border-white/5 py-4 px-6 mt-8 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
      
      <!-- Logo & Copyright -->
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <img src="${assetPath("logo.png")}" alt="Emaily" class="h-5 w-5 object-contain opacity-80" />
          <span class="font-display font-semibold text-sm text-secondary">Emaily</span>
        </div>
        <p class="text-tertiary text-xs hidden sm:block">
          © 2026 Emaily. Email API & routing for developers.
        </p>
      </div>

      <!-- Quick Links & Portfolio -->
      <div class="flex items-center gap-3 text-xs text-tertiary">
        <a href="${urlFor("support")}" class="hover:text-white transition">Support</a>
        <span>&middot;</span>
        <a href="${urlFor("docs")}" class="hover:text-white transition">Docs</a>
        <span>&middot;</span>
        <span>Made by 
          <a href="https://ahm3dramad3n.github.io/portfolio/en/" target="_blank" rel="noopener noreferrer" class="text-secondary hover:text-aurora font-semibold transition">
            Ahmed Ramadan
          </a>
        </span>
      </div>
      
    </div>
  `;
}

function renderFooter(isPublicPage) {
  const footerContainer = document.getElementById("dynamic-footer");
  if (!footerContainer) return;

  if (isPublicPage) {
    footerContainer.innerHTML = getPublicFooterHTML();
  } else {
    footerContainer.innerHTML = getDashboardFooterHTML();
  }
}

/* ============================================================
   App shell & auth helpers
   ============================================================ */

function isAdminRole(user) {
  return String(user?.roles || "").toLowerCase() === "admin";
}

function currentPath() {
  return location.pathname + location.search;
}

async function mountAppShell(activePage) {
  let user;
  try {
    user = await UserService.getMe();
    currentSubscriptionData = await BillingService.getSubscription().catch(
      () => null,
    );
  } catch {
    redirectTo("login", "?redirect=" + encodeURIComponent(currentPath()));
    return null;
  }

  if (inAdmin && !isAdminRole(user)) {
    showToast("Admin access required.", "error");
    redirectTo("dashboard", "?redirect=" + encodeURIComponent(currentPath()));
    return null;
  }

  const sideRoot = $("#sidebar-root");
  if (sideRoot) sideRoot.innerHTML = sidebarInnerHTML(activePage);
  if (inAdmin) $("#app-shell")?.classList.add("admin-shell");

  return user;
}

async function redirectIfAuthed() {
  if (!tokenStore.getAccessToken()) return;
  try {
    await UserService.getMe();
    const redirect = new URLSearchParams(location.search).get("redirect");
    window.location.href = redirect || urlFor("dashboard");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function handleLogout() {
  try {
    await AuthService.logout();
  } catch {
    /* clear locally regardless */
  }
  showToast("Signed out.", "info");
  redirectTo("landing");
}

/* ============================================================
   PAGE: index.html (landing page)
    ============================================================ */
function initLandingPage() {
  return;
}

/* ============================================================
    PAGE: docs.html
    ============================================================ */
function initDocsPage() {
  return;
}

/* ============================================================
    PAGE: api-reference.html
    ============================================================ */
function initApiReferencePage() {
  return;
}

/* ============================================================
    PAGE: features.html
    ============================================================ */
function initFeaturesPage() {
  return;
}

/* ============================================================
    PAGE: pricing.html
    ============================================================ */
function initPricingPage() {
  return;
}

/* ============================================================
    PAGE: terms.html
    ============================================================ */
function initTermsPage() {
  return;
}

/* ============================================================
    PAGE: privacy.html
    ============================================================ */
function initPrivacyPage() {
  return;
}

/* ============================================================
    PAGE: support.html
    ============================================================ */
function initSupportPage() {
  wireForm("complaint", [
    ["c-name", "Full name", { required: true }],
    ["c-email", "Email address", { required: true, email: true }],
    ["c-project", "Project ID", { noSpaces: true }],
    ["c-category", "Complaint category", { required: true }],
    ["c-details", "Complaint details", { required: true, min: 20 }],
  ]);
  wireForm("suggestion", [
    ["s-name", "Name", { required: true }],
    ["s-email", "Email", { required: true, email: true }],
    ["s-type", "Suggestion type", { required: true }],
    ["s-details", "Suggestion details", { required: true, min: 20 }],
  ]);
}

function wireForm(name, rules) {
  var form = document.getElementById(name + "-form");
  var success = document.getElementById(name + "-success");
  if (!form || !success) return;

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validate(rules)) return;
    let payload = new FormData();
    if (name === "complaint") {
      payload.append("Name", $("#c-name").value.trim());
      payload.append("Email", $("#c-email").value.trim());

      let projectId = $("#c-project").value.trim();
      if (projectId) {
        payload.append("Complaint.ProjectId", projectId);
      }

      payload.append("Complaint.Category", $("#c-category").value.trim());
      payload.append("Complaint.Details", $("#c-details").value.trim());

      let file = $("#c-attach").files[0];
      if (file) {
        payload.append("Complaint.Attachment", file);
      }
    } else if (name === "suggestion") {
      payload.append("Name", $("#s-name").value.trim());
      payload.append("Email", $("#s-email").value.trim());
      payload.append("Suggestion.Type", $("#s-type").value.trim());
      payload.append("Suggestion.Details", $("#s-details").value.trim());
      let expectedImpact = $("#s-impact").value.trim();
      if (expectedImpact) {
        payload.append("Suggestion.ExpectedImpact", expectedImpact);
      }
    } else {
      showToast("Unknown form type: " + name, "error");
      return;
    }
    try {
      await SubmissionService.supportSubmit(payload);
      form.classList.add("hidden");
      success.classList.remove("hidden");
      success.focus();
    } catch (err) {
      showToast(
        friendlyError(err, "Failed to submit. Please try again."),
        "error",
      );
    }
  });
  form.addEventListener("input", function (e) {
    if (e.target && e.target.id) setError(e.target.id, "");
  });
  form.addEventListener("reset", function () {
    rules.forEach(function (r) {
      setError(r[0], "");
    });
  });
  document
    .querySelector('[data-reset-form="' + name + '"]')
    .addEventListener("click", function () {
      form.reset();
      success.classList.add("hidden");
      form.classList.remove("hidden");
      var first = form.querySelector("input, select, textarea");
      if (first) first.focus();
    });
}

function isValidEmail(v) {
  var at = v.indexOf("@");
  var dot = v.lastIndexOf(".");
  return at > 0 && dot > at + 1 && dot < v.length - 1 && !/\s/.test(v);
}

function setError(id, message) {
  var input = document.getElementById(id);
  var err = document.querySelector('[data-error-for="' + id + '"]');
  if (!input || !err) return;
  if (message) {
    err.textContent = message;
    err.classList.remove("hidden");
    input.setAttribute("aria-invalid", "true");
  } else {
    err.textContent = "";
    err.classList.add("hidden");
    input.removeAttribute("aria-invalid");
  }
}

function validate(rules) {
  var firstInvalid = null;
  rules.forEach(function (r) {
    var id = r[0],
      label = r[1],
      opt = r[2];
    var el = document.getElementById(id);
    var v = (el.value || "").trim();
    var msg = "";
    if (opt.required && !v) msg = label + " is required.";
    else if (v && opt.email && !isValidEmail(v))
      msg = "Enter a valid email address.";
    else if (v && opt.min && v.length < opt.min)
      msg = label + " needs at least " + opt.min + " characters.";
    else if (v && opt.noSpaces && /\s/.test(v))
      msg = label + " shouldn't contain spaces.";
    setError(id, msg);
    if (msg && !firstInvalid) firstInvalid = el;
  });
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

/* ============================================================
   PAGE: login.html
   ============================================================ */
async function initLoginPage() {
  await redirectIfAuthed();

  $("#form-login").innerHTML = `
  <div>
              <label class="field-label" for="login-email">Email</label>
              <input
                class="input-glass"
                type="email"
                id="login-email"
                name="email"
                placeholder="you&#64;example.com"
                required
              />
            </div>
            <div>
              <label class="field-label" for="login-password">Password</label>
                      <div class="relative">

              <input
                class="input-glass"
                type="password"
                id="login-password"
                name="password"
                placeholder="••••••••"
                required
              />
              <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>
            </div>
                        </div>

            <p class="field-error hidden" data-error-for="login"></p>
            <button type="submit" class="btn btn-aurora w-full justify-center">
              Sign in
            </button>
            <button
              type="button"
              class="text-xs text-tertiary hover:text-secondary transition-colors block mx-auto"
              data-action="forgot-password"
            >
              Forgot your password?
            </button>
            `;
}

async function handleLogin(form) {
  const btn = $('button[type="submit"]', form);
  const errorEl = $('[data-error-for="login"]');
  errorEl.classList.add("hidden");
  setBtnLoading(btn, true, "Signing in…");
  try {
    await AuthService.login({
      email: $("#login-email").value.trim(),
      password: $("#login-password").value,
    });
    const redirect = new URLSearchParams(location.search).get("redirect");
    window.location.href = redirect || urlFor("dashboard");
  } catch (err) {
    errorEl.textContent = friendlyError(
      err,
      "Could not sign in with those details.",
    );
    errorEl.classList.remove("hidden");
    setBtnLoading(btn, false, "Sign in");
  }
}

/* ============================================================
   PAGE: register.html
   ============================================================ */
async function initRegisterPage() {
  await redirectIfAuthed();

  const token = new URLSearchParams(window.location.search).get("token");
  const hasToken = Boolean(token);

  $("#form-register").innerHTML = `
  ${
    hasToken
      ? `
        <div>
          <label class="field-label" for="register-name">Name</label>
          <input
            class="input-glass"
            type="text"
            id="register-name"
            name="name"
            placeholder="Sara Ahmed"
            required
          />
        </div>

        <div>
          <label class="field-label" for="register-password">Password</label>

          <div class="relative">
            <input
              class="input-glass pr-10"
              type="password"
              id="register-password"
              name="password"
              placeholder="At least 8 characters"
              required
              minlength="8"
            />

            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition"
              data-action="toggle-password"
              title="Toggle password visibility"
            >
              ${ICONS.eye}
            </button>
          </div>

          <div id="password-strength" class="mt-2 text-xs text-tertiary"></div>
        </div>
      `
      : `
        <div>
          <label class="field-label" for="register-email">Email</label>
          <input
            class="input-glass"
            type="email"
            id="register-email"
            name="email"
            placeholder="you&#64;example.com"
            required
          />
        </div>
      `
  }

  <p class="field-error hidden" data-error-for="register"></p>

  <button type="submit" class="btn btn-aurora w-full justify-center">
    ${hasToken ? "Create account" : "Verify email"}
  </button>
`;
}

function validatePasswordStrength(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function handleRegister(form) {
  const btn = $('button[type="submit"]', form);
  const errorEl = $('[data-error-for="register"]');

  errorEl.classList.add("hidden");
  setBtnLoading(btn, true, "Processing…");

  try {
    const token = new URLSearchParams(window.location.search).get("token");

    // No token → send verification email
    if (!token) {
      const email = $("#register-email").value.trim();

      await AuthService.verifyEmail(email);

      showToast("Verification email sent. Check your inbox.", "success");
      return;
    }

    // Token exists → complete registration
    const fullName = $("#register-name").value.trim();
    const password = $("#register-password").value;

    if (!validatePasswordStrength(password)) {
      throw new Error(
        "Password must be at least 8 characters and contain uppercase, lowercase, a number, and a special character.",
      );
    }

    await AuthService.register({
      token,
      fullName,
      password,
    });

    showToast("Account created. Sign in to continue.", "success");
    redirectTo("login");
  } catch (err) {
    errorEl.textContent = friendlyError(
      err,
      "Could not complete the registration.",
    );
    errorEl.classList.remove("hidden");
  } finally {
    setBtnLoading(
      btn,
      false,
      new URLSearchParams(window.location.search).get("token")
        ? "Create account"
        : "Send verification email",
    );
  }
}

function handleForgotPassword() {
  openModal({
    title: "Reset your password",
    bodyHTML: `
      <p class="text-secondary text-sm mb-4">We'll send a reset link to your email.</p>
      <label class="field-label" for="forgot-email">Email</label>
      <input class="input-glass" id="forgot-email" type="email" placeholder="you&#64;example.com" required />
    `,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-aurora" data-action="submit-forgot-password">Send link</button>
    `,
  });
}

async function submitForgotPassword() {
  const email = $("#forgot-email").value.trim();
  if (!email) return;
  try {
    await AuthService.forgotPassword(email);
    showToast("If that email exists, a reset link is on its way.", "success");
    closeModal();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   PAGE: reset-password.html
   ============================================================ */
async function initResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    const errorEl = $('[data-error-for="reset-password"]');
    errorEl.textContent =
      "Security token is missing or invalid. Please request a new link.";
    errorEl.classList.remove("hidden");

    // إيقاف الزر لأن الرابط غير صالح
    const btn = $('button[type="submit"]', $("#form-reset-password"));
    if (btn) btn.disabled = true;
  }

  $("#form-reset-password").innerHTML = `
             <div>
              <label class="field-label" for="reset-password"
                >New Password</label
              >
                                    <div class="relative">

              <input
                class="input-glass pr-10"
                type="password"
                id="reset-password"
                name="password"
                placeholder="••••••••"
                required
                minlength="8"
              />
                                          <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>

            </div>
                        </div>

            <div>
              <label class="field-label" for="reset-password-confirm"
                >Confirm Password</label
              >
                      <div class="relative">

              <input
                class="input-glass pr-10"
                type="password"
                id="reset-password-confirm"
                name="confirmPassword"
                placeholder="••••••••"
                required
                minlength="8"
              />
                            <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>

            </div>             </div>

            <p
              class="field-error hidden text-danger text-sm"
              data-error-for="reset-password"
            ></p>
            <button type="submit" class="btn btn-aurora w-full justify-center">
              Update Password
            </button>
  `;
}

async function handleResetPassword(form) {
  const btn = $('button[type="submit"]', form);
  const errorEl = $('[data-error-for="reset-password"]');
  errorEl.classList.add("hidden");

  const token = new URLSearchParams(window.location.search).get("token");
  const password = $("#reset-password").value;
  const confirmPassword = $("#reset-password-confirm").value;

  if (!token) {
    errorEl.textContent = "Security token is missing.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (password !== confirmPassword) {
    errorEl.textContent = "Passwords do not match. Please try again.";
    errorEl.classList.remove("hidden");
    return;
  }

  if (!validatePasswordStrength(password)) {
    errorEl.textContent =
      "Password must be at least 8 characters and contain uppercase, lowercase, a number, and a special character.";
    errorEl.classList.remove("hidden");
    return;
  }

  setBtnLoading(btn, true, "Updating…");

  try {
    await AuthService.resetPassword({
      token: token,
      newPassword: password,
    });

    btn.textContent = "Password Updated!";
    btn.style.backgroundColor = "var(--success)";
    btn.style.color = "#000";

    setTimeout(() => {
      window.location.href = urlFor("login") || "login.html";
    }, 1500);
  } catch (err) {
    errorEl.textContent = friendlyError(
      err,
      "Failed to update password. The link might be expired (15-minute limit).",
    );
    errorEl.classList.remove("hidden");
    setBtnLoading(btn, false, "Update Password");
  }
}

/* ============================================================
   PAGE: dashboard.html
   ============================================================ */
async function initDashboardPage(user) {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const [projects, subscription] = await Promise.all([
      ProjectService.list().catch(() => []),
      BillingService.getSubscription().catch(() => null),
    ]);
    const planName = subscription?.planName || "No active plan";
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Welcome back${user.name ? ", " + escapeHtml(user.name) : ""}.</h1>
      <p class="text-secondary mb-8 text-sm">Here's what's happening across your Emaily account.</p>
      <div class="grid sm:grid-cols-3 gap-5 mb-10">
        <div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">Active projects</p><p class="font-display text-3xl font-bold">${projects.length}</p></div>
        <div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">Current plan</p><p class="font-display text-3xl font-bold">${escapeHtml(planName)}</p></div>
        ${
          (user?.remainingQuota || 0) > 0
            ? `<div class="glass glass-card p-6">
       <p class="text-tertiary text-xs uppercase tracking-wide mb-2">Remaining quota</p>
       <p class="font-display text-3xl font-bold">${escapeHtml(user.remainingQuota)}</p>
     </div>`
            : `<div class="glass glass-card p-6 border-red-500/30 bg-red-500/5 relative overflow-hidden">
       <div class="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wider">Exhausted</div>
       <p class="text-red-400 text-xs uppercase tracking-wide mb-2">Overage Emails</p>
       <p class="font-display text-3xl font-bold text-red-500">+${escapeHtml(user?.overageEmails || 0)}</p>
     </div>`
        }
      </div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display font-semibold text-lg">Recent projects</h2>
        <a href="${urlFor("projects")}" class="btn btn-ghost btn-sm">View all</a>
      </div>
      ${projects.length ? `<div class="grid sm:grid-cols-2 gap-4">${projects.slice(0, 4).map(projectCard).join("")}</div>` : emptyState("No projects yet", "Create your first project to get a public API key.", "Create project", () => redirectTo("projects"))}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

/* ============================================================
   UI Components
   ============================================================ */
function renderSkeleton() {
  return `<div class="space-y-4"><div class="skeleton h-8 w-1/3"></div><div class="skeleton h-32 w-full"></div><div class="skeleton h-32 w-full"></div></div>`;
}

function errorPanel(err) {
  return `<div class="glass glass-panel p-8 text-center"><p class="text-secondary">${escapeHtml(friendlyError(err, "Could not load this page."))}</p></div>`;
}

function emptyState(title, body, actionLabel, onClick) {
  const id = "empty-cta-" + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const b = document.getElementById(id);
    if (b && onClick) b.addEventListener("click", onClick);
  }, 0);
  return `
    <div class="glass glass-panel p-10 text-center">
      <p class="font-display font-semibold mb-2">${escapeHtml(title)}</p>
      <p class="text-secondary text-sm mb-6">${escapeHtml(body)}</p>
      ${actionLabel ? `<button id="${id}" class="btn btn-aurora btn-sm">${escapeHtml(actionLabel)}</button>` : ""}
    </div>
  `;
}

function toggleSwitchHTML({ isOn, action, id, dataExtra = "" }) {
  return `
    <button type="button" class="toggle-switch ${isOn ? "is-on" : ""}" data-action="${action}" data-id="${id}" data-active="${isOn}" ${dataExtra}
      role="switch" aria-checked="${isOn}" aria-label="${isOn ? "Pause" : "Resume"}" title="${isOn ? "Active — click to pause" : "Paused — click to resume"}">
      <span class="toggle-knob"></span>
    </button>
  `;
}

function renderUnlockBanner(type, availableCount) {
  const bannerId = `unlock-banner-${type}`;
  const countId = `unlock-count-${type}`;

  const isVisible = availableCount > 0;

  return `
    <div id="${bannerId}" class="${isVisible ? "flex" : "hidden"} items-center justify-between mb-8 p-3 border-2 border-[var(--warning)] bg-[var(--warning-bg)] shadow-[4px_4px_0px_var(--warning)] transition-all duration-300">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-[var(--warning)]" viewBox="0 0 256 256" fill="currentColor">
          <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-40a8,8,0,0,1-8,8,16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40A8,8,0,0,1,144,176ZM112,84a12,12,0,1,1,12,12A12,12,0,0,1,112,84Z"></path>
        </svg>
        <span class="text-[var(--text-primary)] font-bold uppercase tracking-widest text-sm" style="font-family: var(--font-display);">
          Available ${type} Unlocks
        </span>
      </div>
      <div class="bg-[var(--warning)] text-[var(--text-on-aurora)] px-3 py-1 font-bold text-sm" style="font-family: var(--font-mono);">
        <span id="${countId}">${availableCount}</span> Remaining
      </div>
    </div>
  `;
}

function decreaseUnlockCount(type) {
  const banner = document.getElementById(`unlock-banner-${type}`);
  const countSpan = document.getElementById(`unlock-count-${type}`);

  if (!banner || !countSpan) return;

  const currentCount = parseInt(countSpan.textContent, 10) || 0;
  const newCount = currentCount - 1;

  if (newCount <= 0) {
    banner.classList.remove("flex");
    banner.classList.add("hidden");
  } else {
    banner.classList.remove("hidden");
    banner.classList.add("flex");
    countSpan.textContent = newCount;
  }
}

function renderUnlockBadge(id) {
  return `
    <button type="button" class="unlock-badge-btn" data-action="unlock-card" data-id="${escapeHtml(id)}">
      
      <!-- أيقونة القفل المغلق -->
      <svg class="unlock-icon-closed" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">
        <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"></path>
      </svg>
      
      <!-- أيقونة القفل المفتوح -->
      <svg class="unlock-icon-open" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor">
        <path d="M208,80H96V56a32,32,0,0,1,32-32c15.37,0,29.2,11,32.16,25.59a8,8,0,0,0,15.68-3.18C171.32,24.15,151.2,8,128,8A48.05,48.05,0,0,0,80,56V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80Zm0,128H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"></path>
      </svg>
      
      <!-- النص التفاعلي -->
      <span class="unlock-text">Unlock</span>
    </button>
  `;
}
/* ============================================================
    Card rendering
   ============================================================ */
async function renderCard(scope, dto, operation = "create") {
  if (!dto) return;
  const cont = $("#card-container");
  if (!cont) {
    if (scope === "service") {
      const services = await ServiceService.list().catch(() => []);
      $("#services-list").innerHTML = servicesListHTML(services);
    } else if (scope === "integration") {
      const integrations = await IntegrationService.list(dto.projectId).catch(
        () => [],
      );
      $("#integrations-list").innerHTML = integrationsListHTML(integrations);
    } else if (scope === "linkedService") {
      const linkedServices = await ProjectService.getLinkedServices(
        dto.projectId,
      ).catch(() => []);
      $("#linkedServices-list").innerHTML = linkedServicesListHTML(
        linkedServices,
        dto.projectId,
      );
    } else {
      // scope => project or template
      console.assert(false, `Unknown scope: ${scope}`);
    }
    return;
  }

  const cardRenderers = {
    project: typeof projectCard !== "undefined" ? projectCard : null,
    service: typeof serviceCard !== "undefined" ? serviceCard : null,
    template: typeof templateCard !== "undefined" ? templateCard : null,
    integration:
      typeof integrationCard !== "undefined" ? integrationCard : null,
    linkedService:
      typeof linkedServiceCard !== "undefined" ? linkedServiceCard : null,
  };

  const renderFunc = cardRenderers[scope];

  if (!renderFunc && operation !== "delete") {
    console.error(`No render function found for scope: ${scope}`);
    return;
  }

  const cardHTML = operation !== "delete" ? renderFunc(dto) : "";

  if (operation === "create") {
    cont.insertAdjacentHTML("afterbegin", cardHTML);
  } else if (operation === "update") {
    const card = cont.querySelector(`[data-card-id="${dto.id}"]`);
    if (card) {
      card.outerHTML = cardHTML;
    }
  } else if (operation === "delete") {
    const card = cont.querySelector(`[data-card-id="${dto.id}"]`);
    if (card) {
      card.remove();
    }
  }
}

function projectCard(p) {
  const isOn = p.isActive !== false;
  return `
    <div class="glass glass-card p-6 with-unlock-badge" data-card-id="${p.id}">
      ${p.isLocked ? renderUnlockBadge(p.id) : ""}
      <div class="flex items-start justify-between mb-3 gap-3">
        <a href="${urlFor("projects", "?id=" + p.id)}" class="font-display font-semibold">${escapeHtml(p.name)}</a>
        ${toggleSwitchHTML({ isOn, action: "toggle-project-status", id: p.id })}
      </div>
      <p class="text-tertiary text-xs font-mono mb-4">${p.restrictedDomains?.length ? escapeHtml(p.restrictedDomains.join(", ")) : "No domain restriction"}</p>
      <div class="flex items-center justify-between">
        <p class="text-tertiary text-xs">Created ${formatDate(p.createdAt)}</p>
        <a href="${urlFor("projects", "?id=" + p.id)}" class="btn btn-ghost btn-sm">Open</a>
      </div>
    </div>
  `;
}

function templateCard(t) {
  const isOn = t.isActive !== false;
  return `
  <div class="glass glass-card p-5 flex items-center justify-between gap-3 with-unlock-badge" data-card-id="${t.id}">
  ${t.isLocked ? renderUnlockBadge(t.id) : ""}    
  <div class="min-w-0">
        <p class="font-semibold text-sm">${escapeHtml(t.name)}</p>
        <p class="text-tertiary text-xs mt-1 truncate">${escapeHtml(t.subject || "")}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        
        ${toggleSwitchHTML({ isOn, action: "toggle-template-status", id: t.id, dataExtra: `data-project-id="${t.projectId}"` })}
        
        <button class="btn btn-icon btn-ghost" data-action="open-snippet-modal" data-template="${encodeURIComponent(JSON.stringify(t))}" aria-label="Integration code" title="Integration code">${ICONS.code}</button>
        
        <a class="btn btn-icon btn-ghost" href="${urlFor("template-editor", `?project=${t.projectId}&template=${t.id}`)}" aria-label="Edit template" title="Edit">${ICONS.pencil}</a>
        <button class="btn btn-icon btn-danger" data-action="delete-template" data-id="${t.id}" aria-label="Delete template" title="Delete">${ICONS.trash}</button>
      </div>
    </div>
  `;
}

function serviceCard(s) {
  const isOn = s.isActive !== false;

  let displayProvider = s.providerType;
  if (s.providerType === "ApiKey")
    displayProvider = s.serviceApiKey?.providerName;
  else if (s.providerType === "OAuth")
    displayProvider = s.serviceOauth?.oauthProvider;

  return `
    <div class="glass glass-card p-6 with-unlock-badge" data-card-id="${s.id}">
      ${s.isLocked ? renderUnlockBadge(s.id) : ""}
      <div class="flex items-start justify-between mb-3 gap-3">
        <div>
          <h3 class="font-display font-semibold">${escapeHtml(s.fromName || "Untitled")}</h3>
          <p class="text-tertiary text-xs font-mono">${escapeHtml(s.fromEmail)}</p>
        </div>
        <span class="status-pill is-neutral text-[10px]">${escapeHtml(displayProvider)}</span>
      </div>
      <div class="flex items-center justify-between mt-5">
        <div class="toggle-row">
          <span class="text-xs text-secondary">${s.isActive ? "Active" : "Paused"}</span>
          ${toggleSwitchHTML({ isOn, action: "toggle-service", id: s.id })}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-icon btn-ghost" data-action="edit-service" data-id="${s.id}" data-service='${escapeHtml(JSON.stringify(s))}'>${ICONS.pencil}</button>
          <button class="btn btn-icon btn-danger" data-action="delete-service" data-id="${s.id}">${ICONS.trash}</button>
        </div>
      </div>
    </div>
  `;
}

function integrationCard(i) {
  let configDisplay = "";
  try {
    const cfg =
      typeof i.configJson === "string"
        ? JSON.parse(i.configJson)
        : i.configJson || {};

    if (
      i.integrationType === "TelegramBot" ||
      i.integrationType === "TELEGRAMBOT"
    ) {
      configDisplay = cfg.chatId || "—";
    } else if (
      i.integrationType === "GoogleSheets" ||
      i.integrationType === "GOOGLESHEETS"
    ) {
      configDisplay = cfg.sheetUrl || "—";
    } else if (
      i.integrationType === "AiSummary" ||
      i.integrationType === "AISUMMARY"
    ) {
      configDisplay = "AI Auto-summarization active";
    } else {
      configDisplay = JSON.stringify(cfg);
    }
  } catch (e) {
    configDisplay = i.configJson || "—";
  }

  return `
  <div class="glass glass-card p-4 sm:p-5 flex items-center justify-between gap-4" data-card-id="${i.id}">
    
    <!-- الجزء الأيسر: نوع التكامل والبيانات -->
    <!-- استخدام min-w-0 و flex-1 يسمح للنص بعمل truncate وعدم تجاوز الحاوية -->
    <div class="min-w-0 flex-1">
      <p class="font-semibold text-sm">${escapeHtml(i.integrationType)}</p>
      <p class="text-tertiary text-xs font-mono mt-1 truncate" title="${escapeHtml(configDisplay)}">
        ${escapeHtml(configDisplay)}
      </p>
    </div>
    
    <!-- الجزء الأيمن: الـ Toggle وأزرار التحكم -->
    <!-- استخدام shrink-0 يمنع الأزرار من الانضغاط لو النص طويل -->
    <div class="flex items-center gap-2 shrink-0">
      
      ${toggleSwitchHTML({
        isOn: i.isActive,
        action: "toggle-integration",
        id: i.id,
        dataExtra: `data-project-id="${i.projectId}"`,
      })}
      
      <button class="btn btn-icon btn-ghost" data-action="edit-integration" data-id="${i.id}" data-project-id="${i.projectId}" data-integration='${escapeHtml(JSON.stringify(i))}'>
        ${ICONS.pencil}
      </button>
      
      <button class="btn btn-icon btn-danger" data-action="delete-integration" data-id="${i.id}" data-project-id="${i.projectId}" aria-label="Remove integration">
        ${ICONS.trash}
      </button>
      
    </div>
    
  </div>`;
}

function linkedServiceCard(ls) {
  return `
  <div class="glass glass-card p-5 flex items-center justify-between gap-3" data-card-id="${ls.id}">
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="status-pill is-neutral">${escapeHtml(ls.providerType)}</span>
                <p class="font-semibold text-sm truncate">${escapeHtml(ls.fromName || "Untitled")}</p>
              </div>
              <p class="text-tertiary text-xs font-mono truncate">${escapeHtml(ls.fromEmail)}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button class="btn btn-ghost btn-sm text-danger border-glass-border hover:bg-danger/10" data-action="unlink-service" data-service-id="${ls.id}" data-project-id="${ls.projectId}">Unlink</button>
            </div>
          </div>
          `;
}

/* ============================================================
   PAGE: projects.html (list + detail via ?id=)
   ============================================================ */
async function initProjectsPage() {
  const id = new URLSearchParams(location.search).get("id");
  if (id)
    await renderProjectDetail(
      id,
      new URLSearchParams(location.search).get("tab") || "keys",
    );
  else await renderProjectsList();
}

async function renderProjectsList() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const projects = await ProjectService.list();
    const unlockedCount = projects.filter((p) => !p.isLocked).length;
    const lockedCount = projects.length - unlockedCount;
    const planRemaining = Math.max(
      0,
      currentSubscriptionData.maxProjects - unlockedCount,
    );
    const availableProjectsCount = Math.min(planRemaining, lockedCount);

    content.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div><h1 class="font-display text-2xl font-bold">Projects</h1><p class="text-secondary text-sm">Each project has its own API keys, templates, and services.</p></div>
        <button class="btn btn-aurora btn-sm" data-action="open-project-modal">+ New project</button>
      </div>
      ${renderUnlockBanner("projects", availableProjectsCount)}
      <div id="projects-list">${projectsListHTML(projects)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function projectsListHTML(projects) {
  return `
        ${projects.length ? `<div id="card-container" class="grid sm:grid-cols-2 gap-4">${projects.map(projectCard).join("")}</div>` : emptyState("No projects yet", "Create your first project to get a public API key.", "Create project", () => $('[data-action="open-project-modal"]')?.click())}

  `;
}

function openProjectModal() {
  openModal({
    title: "New project",
    bodyHTML: `
      <div class="space-y-4">
        <div><label class="field-label" for="project-name">Project name</label><input class="input-glass" id="project-name" placeholder="Marketing site" required /></div>
        <div><label class="field-label" for="project-domains">Allowed domains (comma-separated, optional)</label><input class="input-glass" id="project-domains" placeholder="example.com, app.example.com" /></div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-project">Create project</button>`,
  });
}

async function submitProject() {
  const name = $("#project-name").value.trim();
  const domainsRaw = $("#project-domains").value.trim();
  if (!name) return showToast("Give the project a name.", "error");
  try {
    const project = await ProjectService.create({
      name,
      restrictedDomains: domainsRaw,
    });
    showToast("Project created.", "success");
    closeModal();
    renderCard("project", project, "create");
  } catch (err) {
    showToast(
      friendlyError(err, "Could not create project — check your plan limits."),
      "error",
    );
  }
}

async function deleteProjectAndRedirect(id) {
  const isConfirmed = await confirm(
    'Are you sure you want to delete this project?\n<strong style="color: var(--warning);">Warning:</strong> This will also delete all templates, attachments, integrations and history associated with it.',
  );
  if (!isConfirmed) return;
  try {
    await ProjectService.remove(id);
    showToast("Project deleted.", "success");
    redirectTo("projects");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function toggleProjectStatus(id, currentlyActive, btnEl) {
  const next = !currentlyActive;
  btnEl.classList.add("is-busy");
  try {
    await ProjectService.setStatus(id, next);
    btnEl.classList.toggle("is-on", next);
    btnEl.dataset.active = String(next);
    const label = btnEl.closest(".toggle-row")?.querySelector("span");
    if (label) label.textContent = next ? "Active" : "Paused";
    showToast(next ? "Project resumed." : "Project paused.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.classList.remove("is-busy");
  }
}

const PROJECT_TABS = [
  ["keys", "Keys"],
  ["services", "Services"],
  ["integrations", "Integrations"],
  ["settings", "Settings"],
];

async function renderProjectDetail(id, tab) {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const project = await ProjectService.getById(id);
    const integrations = await IntegrationService.list(id);
    const linkedServices = await ProjectService.getLinkedServices(id);

    const isOn = project.isActive !== false;
    content.innerHTML = `
      <a href="${urlFor("projects")}" class="btn btn-ghost btn-sm mb-5">← All projects</a>
      <div class="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 class="font-display text-2xl font-bold">${escapeHtml(project.name)}</h1>
          <p class="text-tertiary text-xs font-mono mt-1">${project.restrictedDomains || "No domain restriction"}</p>
        </div>
        <div class="toggle-row shrink-0">
          <span class="text-xs text-secondary">${isOn ? "Active" : "Paused"}</span>
          ${toggleSwitchHTML({ isOn, action: "toggle-project-status", id: project.id })}
        </div>
      </div>
      <div class="flex gap-1 mb-6 border-b" style="border-color: var(--glass-border)">
        ${PROJECT_TABS.map(([key, label]) => `<button id="project-tab-${key}" class="tab-btn" data-action="set-project-tab" data-project-id="${project.id}" data-project="${escapeHtml(JSON.stringify(project))}" data-linked-services="${escapeHtml(JSON.stringify(linkedServices))}" data-integrations="${escapeHtml(JSON.stringify(integrations))}" data-tab="${key}">${label}</button>`).join("")}
      </div>
      <div id="project-tab-panel"></div>
    `;

    let panel = "";
    if (tab === "keys") panel = renderKeysTab(project);
    else if (tab === "settings") panel = renderSettingsTab(project);
    else if (tab === "services")
      panel = renderServicesTab(project.id, linkedServices);
    else if (tab === "integrations")
      panel = renderIntegrationsTab(project.id, integrations);
    $("#project-tab-panel").innerHTML = panel;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function updateProjectTabData(
  projectId,
  datasetKey,
  Data,
  operation = "create",
) {
  const tabButtons = document.querySelectorAll(
    `button[data-action="set-project-tab"][data-project-id="${projectId}"]`,
  );
  if (tabButtons.length === 0) return;

  let currentData;
  try {
    const rawData = tabButtons[0].dataset[datasetKey];
    currentData = rawData ? JSON.parse(rawData) : null;
  } catch (e) {
    currentData = null;
  }

  const isArray = Array.isArray(currentData);

  if (operation === "create") {
    if (isArray) {
      currentData.push(Data);
    } else if (currentData === null) {
      currentData = [Data];
    } else {
      currentData = Data; /*Not needed*/
    }
  } else if (operation === "update") {
    if (isArray) {
      currentData = currentData.map((item) =>
        item.id === Data.id ? Data : item,
      );
    } else if (currentData) {
      currentData = { ...currentData, ...Data };
    }
  } else if (operation === "delete") {
    if (isArray) {
      currentData = currentData.filter((item) => item.id !== Data.id);
    } else {
      currentData = null; /*Not needed*/
    }
  } else if (operation === "toggle") {
    if (isArray) {
      currentData = currentData.map((item) =>
        item.id === Data.id ? { ...item, isActive: Data.isActive } : item,
      );
    } else if (currentData) {
      currentData.isActive = Data.isActive; /*Not needed*/
    }
  } else if (operation === "accessMode") {
    if (currentData) {
      currentData.projectAccessMode = Data.accessMode;
    }
  }

  const jsonString = currentData ? JSON.stringify(currentData) : "";

  tabButtons.forEach((btn) => {
    if (jsonString) {
      btn.dataset[datasetKey] = jsonString;
    } else {
      delete btn.dataset[datasetKey]; // إزالة المفتاح إذا لم يعد هناك بيانات
    }
  });
}

function setActiveProjectTab(tabKey) {
  const tabButtons = document.querySelectorAll(
    `button[data-action="set-project-tab"]`,
  );
  tabButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tabKey);
  });
}

function renderKeysTab(project) {
  setActiveProjectTab("keys");
  return `
    <div class="glass glass-card p-6">
      <h3 class="font-display font-semibold mb-4">API keys</h3>
      <div class="space-y-4">
        <div>
          <p class="text-tertiary text-xs mb-1">Public key — used in <code class="font-mono">/api/submit/{key}</code></p>
          <div class="key-row">
            <p class="api-key-chip flex-1" id="keys-public">${escapeHtml(project.publicApiKey || "—")}</p>
            <button type="button" class="copy-btn" data-action="copy-text" data-copy="${escapeHtml(project.publicApiKey || "")}">${ICONS.copy} Copy</button>
          </div>
        </div>
        <div>
          <p class="text-tertiary text-xs mb-1">Private key — server-to-server calls. Keep this out of client-side code.</p>
          <div class="key-row">
            <p class="api-key-chip flex-1" id="keys-private" data-value="${escapeHtml(project.privateApiKey || "")}" data-revealed="false">${"•".repeat(Math.max(12, (project.privateApiKey || "").length))}</p>
            <button type="button" class="copy-btn" data-action="toggle-reveal-key">${ICONS.eye} Show</button>
            <button type="button" class="copy-btn" data-action="copy-text" data-copy="${escapeHtml(project.privateApiKey || "")}">${ICONS.copy} Copy</button>
          </div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm mt-5" data-action="regenerate-keys" data-id="${project.id}">Regenerate keys</button>
    </div>
  `;
}

async function regenerateKeys(projectId) {
  const isConfirmed = await confirm(
    "Regenerate API keys? Anything using the old keys will stop working immediately.",
  );
  if (!isConfirmed) return;

  try {
    const project = await ProjectService.regenerateKeys(projectId);
    showToast("Keys regenerated.", "success");
    console.log(project);
    $("#project-tab-panel").innerHTML = renderKeysTab(project.data);
    updateProjectTabData(projectId, "project", project.data, "update");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

function renderSettingsTab(project) {
  setActiveProjectTab("settings");
  return `
    <div class="glass glass-card p-6 mb-6">
      <h3 class="font-display font-semibold mb-4">Project settings</h3>
      <form id="form-project-settings" data-id="${project.id}" class="space-y-4">
        <div>
          <label class="field-label" for="settings-name">Name</label>
          <input class="input-glass" id="settings-name" value="${escapeHtml(project.name)}" />
        </div>
        <div>
          <label class="field-label" for="settings-domains">Allowed domains</label>
          <input class="input-glass" id="settings-domains" value="${escapeHtml(project.restrictedDomains)}" />
        </div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>

    <div class="glass glass-card p-6 mb-6">
      <h3 class="font-display font-semibold mb-1">API Access Mode</h3>
      <p class="text-tertiary text-xs mb-5">Define how this project accepts incoming requests. Selection is auto-saved.</p>

      <div class="space-y-3">

        <!-- Client-side -->
        <label class="relative flex items-start gap-4 p-4 border border-dashed border-glass-border-strong hover:bg-glass-surface-hover transition-all cursor-pointer group has-[:checked]:border-solid has-[:checked]:border-[var(--text-primary)] has-[:checked]:bg-[var(--glass-surface-strong)]">
          <input 
            type="radio" 
            id="accessMode-0"
            name="accessMode" 
            value="FrontendOnly" 
            data-project-id="${project.id}" 
            ${project.projectAccessMode === "FrontendOnly" ? "checked" : ""} 
            class="peer sr-only" 
          />
          <!-- Custom Brutalist Radio Box -->
          <div class="mt-0.5 w-4 h-4 flex-shrink-0 border border-glass-border-strong bg-[var(--bg-void)] peer-checked:border-[var(--aurora-purple)] peer-checked:bg-[var(--aurora-purple)] flex items-center justify-center transition-colors">
            <div class="w-2 h-2 bg-[var(--bg-void)] hidden peer-checked:block"></div>
          </div>
          <div>
            <p class="text-sm font-semibold mb-0.5 group-hover:text-primary transition-colors peer-checked:text-[var(--aurora-purple)]">Client-side</p>
            <p class="text-tertiary text-xs leading-relaxed">
              For browser clients. Enforces AppCheck & reCAPTCHA. 
              <span style="color: var(--danger)" class="font-semibold">Rejects</span> any requests containing a Private Key or custom <code class="font-mono text-[10px] text-secondary">toEmail</code> overrides.
            </p>
          </div>
        </label>

        <!-- Server-side -->
        <label class="relative flex items-start gap-4 p-4 border border-dashed border-glass-border-strong hover:bg-glass-surface-hover transition-all cursor-pointer group has-[:checked]:border-solid has-[:checked]:border-[var(--text-primary)] has-[:checked]:bg-[var(--glass-surface-strong)]">
          <input 
            type="radio" 
            id="accessMode-1"
            name="accessMode" 
            value="BackendOnly" 
            data-project-id="${project.id}" 
            ${project.projectAccessMode === "BackendOnly" ? "checked" : ""} 
            class="peer sr-only" 
          />
          <!-- Custom Brutalist Radio Box -->
          <div class="mt-0.5 w-4 h-4 flex-shrink-0 border border-glass-border-strong bg-[var(--bg-void)] peer-checked:border-[var(--aurora-purple)] peer-checked:bg-[var(--aurora-purple)] flex items-center justify-center transition-colors">
            <div class="w-2 h-2 bg-[var(--bg-void)] hidden peer-checked:block"></div>
          </div>
          <div>
            <p class="text-sm font-semibold mb-0.5 group-hover:text-primary transition-colors peer-checked:text-[var(--aurora-purple)]">Server-side</p>
            <p class="text-tertiary text-xs leading-relaxed">
              For server-to-server integration. Bypasses AppCheck & reCAPTCHA entirely. 
              <span style="color: var(--success)" class="font-semibold">Requires</span> the project's Private Key to be sent in the request header.
            </p>
          </div>
        </label>

        <!-- Universal -->
        <label class="relative flex items-start gap-4 p-4 border border-dashed border-glass-border-strong hover:bg-glass-surface-hover transition-all cursor-pointer group has-[:checked]:border-solid has-[:checked]:border-[var(--text-primary)] has-[:checked]:bg-[var(--glass-surface-strong)]">
          <input 
            type="radio" 
            id="accessMode-2"
            name="accessMode" 
            value="Hybrid" 
            data-project-id="${project.id}" 
            ${project.projectAccessMode === "Hybrid" ? "checked" : ""} 
            class="peer sr-only" 
          />
          <!-- Custom Brutalist Radio Box -->
          <div class="mt-0.5 w-4 h-4 flex-shrink-0 border border-glass-border-strong bg-[var(--bg-void)] peer-checked:border-[var(--aurora-purple)] peer-checked:bg-[var(--aurora-purple)] flex items-center justify-center transition-colors">
            <div class="w-2 h-2 bg-[var(--bg-void)] hidden peer-checked:block"></div>
          </div>
          <div>
            <p class="text-sm font-semibold mb-0.5 group-hover:text-primary transition-colors peer-checked:text-[var(--aurora-purple)]">Universal</p>
            <p class="text-tertiary text-xs leading-relaxed">
              Accepts both browser and server requests, applying security rules dynamically based on the payload.
            </p>
          </div>
        </label>
      </div>

      <!-- Architectural Advice Notice -->
      <div class="mt-6 p-4 flex items-start gap-3" style="background-color: var(--warning-bg); border: 1px solid var(--warning);">
        <svg class="w-5 h-5 shrink-0 mt-0.5" style="color: var(--warning);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
        </svg>
        <div>
          <p class="text-[10px] font-bold font-mono tracking-wider mb-2 uppercase" style="color: var(--bg-void); background-color: var(--warning); display: inline-block; padding: 2px 6px;">Architectural Advice</p>
          <p class="text-tertiary text-[12px] leading-relaxed">
            For optimal operational security, it is highly recommended to create dedicated projects for Frontend and Backend use cases. Avoid using the <strong>Hybrid</strong> mode unless absolutely necessary.
          </p>
        </div>
      </div>
    </div>

    <div class="glass glass-card p-6" style="border-color: rgba(248,113,113,0.25)">
      <h3 class="font-display font-semibold mb-2" style="color: var(--danger)">Danger zone</h3>
      <p class="text-secondary text-sm mb-4">Deleting a project is permanent — it disappears from your dashboard immediately and stops accepting submissions.</p>
      <button class="btn btn-danger btn-sm" data-action="delete-project" data-id="${project.id}">Delete project</button>
    </div>
  `;
}

async function saveProjectSettings(projectId) {
  const domainsRaw = $("#settings-domains").value.trim();
  try {
    const project = await ProjectService.update(projectId, {
      name: $("#settings-name").value.trim(),
      restrictedDomains: domainsRaw,
    });
    showToast("Project updated.", "success");
    $("#settings-name").value = escapeHtml(project.name);
    $("#settings-domains").value = escapeHtml(project.restrictedDomains);
    updateProjectTabData(projectId, "project", project, "update");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function updateProjectAccessMode(id, newValue, radioEl) {
  radioEl.classList.add("is-busy");
  try {
    await ProjectService.changeAccessMode(id, { accessMode: newValue });
    showToast("Access mode updated.", "success");
    updateProjectTabData(id, "project", { accessMode: newValue }, "accessMode");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    radioEl.classList.remove("is-busy");
  }
}

function renderServicesTab(projectId, linkedServices) {
  setActiveProjectTab("services");
  return `
    <div class="flex justify-between items-center mb-6">
      <p class="text-sm text-secondary">Services linked to this project.</p>
      <button class="btn btn-aurora btn-sm" data-action="open-link-service-modal" data-project-id="${projectId}">+ Link Service</button>
    </div>
    <div id="linkedServices-list">${linkedServicesListHTML(linkedServices, projectId)}</div>
  `;
}

function linkedServicesListHTML(linkedServices, projectId) {
  return `
  ${
    linkedServices.length
      ? `<div class="space-y-3" id="card-container">${linkedServices
          .map((s) => `${linkedServiceCard({ ...s, projectId })}`)
          .join("")}</div>`
      : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No services linked</p><p class="text-secondary text-sm">Link a service so Emaily can deliver mail for this project.</p></div>`
  }
  `;
}

async function openLinkServiceModal(projectId) {
  try {
    // نجلب كل الخدمات
    const allServices = await ServiceService.list();
    // نجلب الخدمات المربوطة حالياً لنستثنيها من القائمة
    const linkedServices = await ProjectService.getLinkedServices(projectId);
    const linkedIds = linkedServices.map((s) => s.id);

    const availableServices = allServices.filter(
      (s) => !linkedIds.includes(s.id) && s.isActive,
    );

    openModal({
      title: "Link a Service",
      bodyHTML: `
        <p class="text-secondary text-sm mb-4">Select an active service to attach to this project.</p>
        <div class="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
          ${
            availableServices.length > 0
              ? availableServices
                  .map(
                    (s) => `
            <label class="flex items-center justify-between p-3 border border-glass-border hover:bg-glass-surface-hover cursor-pointer rounded transition-colors">
              <div>
                <p class="text-sm font-semibold">${escapeHtml(s.fromName)}</p>
                <p class="text-xs text-tertiary">${escapeHtml(s.fromEmail)} &middot; ${s.providerType}</p>
              </div>
              <input type="radio" name="serviceToLink" value="${s.id}" data-service="${escapeHtml(JSON.stringify(s))}" class="accent-aurora-purple w-4 h-4" />
            </label>
          `,
                  )
                  .join("")
              : `<p class="text-xs text-tertiary text-center p-4">No available services found. Go to Services to add one.</p>`
          }
        </div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-link-service" data-project-id="${projectId}">Link to Project</button>`,
    });
  } catch (err) {
    showToast("Error loading services.", "error");
  }
}

async function submitLinkService(projectId) {
  const selectedRadio = document.querySelector(
    'input[name="serviceToLink"]:checked',
  );
  if (!selectedRadio)
    return showToast("Please select a service to link.", "error");

  const service = JSON.parse(selectedRadio.dataset.service);
  try {
    await ProjectService.linkService(projectId, service.id);
    showToast("Service linked successfully.", "success");
    closeModal();
    renderCard("linkedService", { ...service, projectId }, "create");
    updateProjectTabData(
      projectId,
      "linkedServices",
      {
        id: service.id,
        providerType: service.providerType,
        fromName: service.fromName,
        fromEmail: service.fromEmail,
        isActive: service.isActive,
      },
      "create",
    );
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function unlinkService(projectId, serviceId) {
  const isConfirmed = await confirm(
    "Unlink this service? The project will no longer use it to send emails.",
  );
  if (!isConfirmed) return;
  try {
    await ProjectService.unlinkService(projectId, serviceId); // API: DELETE /api/projects/{projectId}/services/{serviceId}
    showToast("Service unlinked.", "success");
    updateProjectTabData(
      projectId,
      "linkedServices",
      { id: serviceId },
      "delete",
    );
    renderCard("linkedService", { id: serviceId, projectId }, "delete");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

function renderIntegrationsTab(projectId, integrations) {
  setActiveProjectTab("integrations");
  return `
    <div class="flex justify-end mb-4">
      <button class="btn btn-aurora btn-sm" data-action="open-integration-modal" data-project-id="${projectId}">+ Add integration</button>
    </div>
              <div id="integrations-list">${integrationsListHTML(integrations)}</div>
  `;
}

function integrationsListHTML(integrations) {
  return `
  ${
    integrations.length
      ? `<div class="space-y-3" id="card-container">
            ${integrations.map((i) => `${integrationCard(i)}`).join("")}
          </div>`
      : `<div class="glass glass-panel p-10 text-center">
            <p class="font-display font-semibold mb-2">No integrations yet</p>
            <p class="text-secondary text-sm">Connect Telegram Bot or Google Sheets to get notified of new submissions.</p>
          </div>`
  }
  `;
}

function openIntegrationModal(projectId) {
  openModal({
    title: "Add integration",
    bodyHTML: `
      <div class="space-y-4">
        <!-- Type Selection -->
        <div>
          <label class="field-label">Type</label>
          <select class="input-glass" id="int-type" onchange="
            const val = this.value;
            
            // 1. التحكم في إظهار وإخفاء حقل الإدخال
            document.getElementById('config-group').style.display = (val === 'AiSummary') ? 'none' : 'block';
            
            // 2. التحكم في إظهار دليل الخطوات المناسب
            document.getElementById('guide-telegram').style.display = (val === 'TelegramBot') ? 'block' : 'none';
            document.getElementById('guide-sheets').style.display = (val === 'GoogleSheets') ? 'block' : 'none';
            document.getElementById('guide-ai').style.display = (val === 'AiSummary') ? 'block' : 'none';
            
            // 3. تغيير اسم الحقل (Label) والـ Placeholder ديناميكياً
            const label = document.getElementById('config-label');
            const input = document.getElementById('int-config');
            if(val === 'TelegramBot') {
              label.innerText = 'Chat ID';
              input.placeholder = 'e.g. 123456789';
            } else if (val === 'GoogleSheets') {
              label.innerText = 'Google Sheet URL';
              input.placeholder = 'https://docs.google.com/spreadsheets/d/...';
            }
          ">
            <option value="TelegramBot">Telegram bot</option>
            <option value="GoogleSheets">Google Sheets</option>
            <option value="AiSummary">AI Summary</option>
          </select>
        </div>

        <!-- Guides Container -->
        <div>
          <!-- Telegram Guide -->
          <div id="guide-telegram" class="glass glass-card p-3 space-y-2 text-sm">
            <p class="font-display font-semibold text-secondary">How to set up Telegram:</p>
            <ol class="list-decimal list-inside text-tertiary space-y-1">
              <li>Start a chat with our bot <a href="https://t.me/EmailyDashboardBot" target="_blank" class="text-aurora hover:underline">@EmailyDashboardBot</a></li>
              <li>Copy the <strong>Chat ID</strong> from the welcome message.</li>
              <li>Paste it in the field below.</li>
            </ol>
          </div>

          <!-- Google Sheets Guide -->
          <div id="guide-sheets" class="glass glass-card p-3 space-y-2 text-sm" style="display: none;">
            <p class="font-display font-semibold text-secondary">How to set up Google Sheets:</p>
            <ol class="list-decimal list-inside text-tertiary space-y-1">
              <li>Create a new Google Sheet.</li>
              <li>Click <strong>Share</strong> and add <span class="font-mono text-xs bg-black/30 px-1 py-0.5 rounded text-aurora select-all">emaily-sheets@emaily-api.iam.gserviceaccount.com</span> as an <strong>Editor</strong>.</li>
              <li>Copy the full Sheet URL and paste it below.</li>
            </ol>
          </div>

          <!-- AI Summary Guide -->
          <div id="guide-ai" class="glass glass-card p-3 space-y-2 text-sm" style="display: none;">
            <p class="font-display font-semibold text-secondary">How to set up AI Summary:</p>
            <p class="text-tertiary">No configuration needed! Just click <strong>Add integration</strong> and the AI will automatically start summarizing this project.</p>
          </div>
        </div>

        <!-- Configuration Input Field -->
        <div id="config-group">
          <label class="field-label" id="config-label">Chat ID</label>
          <input class="input-glass" id="int-config" placeholder="e.g. 123456789" />
        </div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-integration" data-project-id="${projectId}">Add integration</button>`,
  });
}

async function submitIntegration(projectId) {
  try {
    const integration = await IntegrationService.create(projectId, {
      integrationType: $("#int-type").value,
      configJson:
        $("#int-type").value === "TelegramBot"
          ? { chatId: $("#int-config").value.trim() }
          : $("#int-type").value === "GoogleSheets"
            ? { sheetUrl: $("#int-config").value.trim() }
            : {},
    });
    showToast("Integration added.", "success");
    closeModal();
    renderCard("integration", integration, "create");
    updateProjectTabData(projectId, "integrations", integration, "create");
  } catch (err) {
    showToast(
      friendlyError(err, "Could not add integration — check your plan."),
      "error",
    );
  }
}

function openEditIntegrationModal(
  integrationId,
  projectId,
  integrationJsonStr,
) {
  let integration = {};
  try {
    integration = JSON.parse(integrationJsonStr);
  } catch (e) {
    showToast("Error reading integration data.", "error");
    return;
  }

  const type = integration.integrationType || "";
  let configVal = "";
  let cfg = {};

  try {
    cfg =
      typeof integration.configJson === "string"
        ? JSON.parse(integration.configJson)
        : integration.configJson || {};
  } catch (e) {}

  if (type.toUpperCase() === "TELEGRAMBOT") {
    configVal = cfg.chatId || "";
  } else if (type.toUpperCase() === "GOOGLESHEETS") {
    configVal = cfg.sheetUrl || "";
  }

  const isAiSummary = type.toUpperCase() === "AISUMMARY";

  openModal({
    title: "Edit integration",
    bodyHTML: `
      <div class="space-y-4">
        <div>
          <label class="field-label">Type</label>
          <select class="input-glass opacity-70 cursor-not-allowed" id="int-type" disabled title="Integration type cannot be changed. Delete and create a new one instead.">
            <option value="TelegramBot" ${type.toUpperCase() === "TELEGRAMBOT" ? "selected" : ""}>Telegram bot</option>
            <option value="GoogleSheets" ${type.toUpperCase() === "GOOGLESHEETS" ? "selected" : ""}>Google Sheets</option>
            <option value="AiSummary" ${isAiSummary ? "selected" : ""}>AI Summary</option>
          </select>
        </div>
        
        <!-- حقل التعديل (يختفي إذا كان النوع AI Summary) -->
        <div id="config-group" style="display: ${isAiSummary ? "none" : "block"}">
          <label class="field-label" id="config-label">
            ${type.toUpperCase() === "TELEGRAMBOT" ? "Chat ID" : "Google Sheet URL"}
          </label>
          <input class="input-glass" id="int-config" value="${escapeHtml(configVal)}" placeholder="Update your config here..." />
        </div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button>
                 <button class="btn btn-aurora" data-action="submit-edit-integration" data-id="${integration.id}" data-project-id="${projectId}">Save changes</button>`,
  });
}

async function submitEditIntegration(integrationId, projectId, btnEl) {
  const typeEl = document.getElementById("int-type");
  const configEl = document.getElementById("int-config");

  if (!typeEl || !configEl) return;

  const type = typeEl.value;
  const configValue = configEl.value.trim();

  if (type !== "AiSummary" && !configValue) {
    showToast("Please enter a valid Chat ID or Sheet URL.", "warning");
    configEl.focus();
    return;
  }

  let configJson = {};
  if (type === "TelegramBot") {
    configJson = { chatId: configValue };
  } else if (type === "GoogleSheets") {
    configJson = { sheetUrl: configValue };
  } else if (type === "AiSummary") {
    configJson = {};
  }

  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = "Saving...";

  try {
    const integration = await IntegrationService.update(integrationId, {
      configJson,
    });

    showToast("Integration updated successfully.", "success");
    closeModal();
    renderCard("integration", integration, "update");
    updateProjectTabData(projectId, "integrations", integration, "update");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = originalText;
  }
}

async function deleteIntegration(intId, projectId) {
  const isConfirmed = await confirm(
    "Remove this integration? This cannot be undone.",
  );
  if (!isConfirmed) return;

  try {
    await IntegrationService.remove(intId);
    showToast("Integration removed.", "success");
    renderCard("integration", { id: intId, projectId }, "delete");
    updateProjectTabData(projectId, "integrations", { id: intId }, "delete");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function toggleIntegrationStatus(integrationId, currentlyActive, btnEl) {
  const next = !currentlyActive;
  btnEl.classList.add("is-busy");
  try {
    await IntegrationService.setStatus(integrationId, next);
    btnEl.classList.toggle("is-on", next);
    btnEl.dataset.active = String(next);
    showToast(next ? "Integration resumed." : "Integration paused.", "success");
    updateProjectTabData(
      btnEl.dataset.projectId,
      "integrations",
      { id: integrationId, isActive: next },
      "toggle",
    );
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.classList.remove("is-busy");
  }
}

/* ============================================================
   PAGE: services.html
   ============================================================ */
async function initServicesPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const services = await ServiceService.list();
    const unlockedCount = services.filter((p) => !p.isLocked).length;
    const lockedCount = services.length - unlockedCount;
    const planRemaining = Math.max(
      0,
      currentSubscriptionData.maxServices - unlockedCount,
    );
    const availableServicesCount = Math.min(planRemaining, lockedCount);

    content.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="font-display text-2xl font-bold">Services</h1>
          <p class="text-secondary text-sm">Manage your email providers here, then link them to any project.</p>
        </div>
        <button class="btn btn-aurora btn-sm" data-action="open-service-modal">+ Add Service</button>
      </div>
      ${renderUnlockBanner("services", availableServicesCount)}
      <div id="services-list">${servicesListHTML(services)}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function servicesListHTML(services) {
  return `
  ${
    services.length
      ? `<div class="grid sm:grid-cols-2 gap-4" id="card-container">${services.map(serviceCard).join("")}</div>`
      : emptyState(
          "No services yet",
          "Add an SMTP, API, or OAuth service to start sending emails.",
          "Add service",
          () => $('[data-action="open-service-modal"]')?.click(),
        )
  }
  `;
}

async function toggleServiceStatus(id, currentStatus, btnEl) {
  const next = !currentStatus;
  btnEl.classList.add("is-busy");
  try {
    await ServiceService.setStatus(id, next);
    btnEl.classList.toggle("is-on", next);
    btnEl.dataset.active = String(next);
    showToast(next ? "Service resumed." : "Service paused.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.classList.remove("is-busy");
  }
}

async function deleteService(id) {
  const isConfirmed = await confirm(
    "Are you sure you want to delete this service? This might affect projects that are using it.",
  );
  if (!isConfirmed) return;

  try {
    await ServiceService.remove(id);
    showToast("Service deleted.", "success");
    renderCard("service", { id }, "delete");
  } catch (err) {
    showToast(friendlyError(err, "Could not delete service."), "error");
  }
}

function openServiceModal(service = null) {
  if (service) return renderProviderForm(service.providerType, service);

  openModal({
    title: "Add a sending service",
    wide: true,
    bodyHTML: `
      <div class="grid sm:grid-cols-3 gap-3">
        <button type="button" class="glass glass-card p-4 text-left" data-action="pick-provider" data-type="AppPassword">
          <p class="font-semibold text-sm mb-1">SMTP / App Password</p>
          <p class="text-tertiary text-xs">Custom Host & Port</p>
        </button>
        <button type="button" class="glass glass-card p-4 text-left" data-action="pick-provider" data-type="ApiKey">
          <p class="font-semibold text-sm mb-1">API Key</p>
          <p class="text-tertiary text-xs">SendGrid, Resend</p>
        </button>
        <button type="button" class="glass glass-card p-4 text-left" data-action="pick-provider" data-type="OAuth">
          <p class="font-semibold text-sm mb-1">OAuth</p>
          <p class="text-tertiary text-xs">Google, Microsoft</p>
        </button>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button>`,
  });
}

const PROVIDER_LIMITS = {
  Google: "500 emails / day",
  Microsoft: "10,000 emails / day",
  SendGrid: "100 emails / day (Free)",
  Resend: "100 emails / day (Free)",
  AppPassword: "Varies by SMTP Host",
};

async function renderProviderForm(type, service = null) {
  const s = service || {};
  let bodyHTML = "";

  const limitsData = escapeHtml(
    decodeURIComponent(JSON.stringify(PROVIDER_LIMITS)),
  );

  const renderLimitBadge = (initialLimit) => `
    <div class="flex justify-end mb-4 -mt-2">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-glass-panel border border-white/10 text-xs text-tertiary shadow-sm">
        <svg class="w-3.5 h-3.5 text-aurora" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Provider Limit: <strong class="text-secondary font-mono" id="provider-limit-value">${initialLimit}</strong>
      </span>
    </div>
  `;

  if (type === "AppPassword") {
    bodyHTML = `
      ${renderLimitBadge(PROVIDER_LIMITS["AppPassword"])}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">From Name</label><input class="input-glass" id="svc-from-name" value="${escapeHtml(s.fromName || "")}" required/></div>
          <div><label class="field-label">From Email</label><input class="input-glass" type="email" id="svc-from-email" value="${escapeHtml(s.fromEmail || "")}" required/></div>
        </div>
        <div><label class="field-label">SMTP Host</label><input class="input-glass" id="svc-host" value="${escapeHtml(s.serviceAppPassword?.smtpHost || "")}" required/></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Port</label><input class="input-glass" type="number" id="svc-port" value="${s.serviceAppPassword?.smtpPort || 587}" required/></div>
          <div><label class="field-label">Username</label><input class="input-glass" id="svc-username" value="${escapeHtml(s.serviceAppPassword?.username || "")}" required/></div>
        </div>
        <div><label class="field-label">Password</label>
          <div class="relative">
            <input class="input-glass pr-10" type="password" id="svc-password" value="${escapeHtml(s.serviceAppPassword?.password || "")}" required}/>
            <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>
          </div>
        </div>
      </div>
    `;
  } else if (type === "ApiKey") {
    const currentProvider = s.serviceApiKey?.providerName || "SendGrid";

    bodyHTML = `
      ${renderLimitBadge(PROVIDER_LIMITS[currentProvider] || "")}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">From Name</label><input class="input-glass" id="svc-from-name" value="${escapeHtml(s.fromName || "")}" required/></div>
          <div><label class="field-label">From Email</label><input class="input-glass" type="email" id="svc-from-email" value="${escapeHtml(s.fromEmail || "")}" required/></div>
        </div>
        <div>
          <label class="field-label">Provider</label>
          <select class="input-glass" id="svc-api-provider" data-limits="${limitsData}" onchange="document.getElementById('provider-limit-value').innerText = JSON.parse(this.dataset.limits)[this.value] || 'Unknown'" ${s.id ? "disabled" : ""}>
            <option value="SendGrid" ${currentProvider === "SendGrid" ? "selected" : ""}>SendGrid</option>
            <option value="Resend" ${currentProvider === "Resend" ? "selected" : ""}>Resend</option>
          </select>
        </div>
        <div><label class="field-label">Secret API Key</label>
        <div class="relative">
            <input class="input-glass pr-10 font-mono" type="password" id="svc-api-key" value="${escapeHtml(s.serviceApiKey?.secretApiKey || "")}" required/>
            <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>
          </div>
        </div>
      </div>
    `;
  } else if (type === "OAuth") {
    const currentProvider = s.serviceOauth?.oauthProvider || "Google";

    bodyHTML = `
      ${renderLimitBadge(PROVIDER_LIMITS[currentProvider] || "")}
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">From Name</label><input class="input-glass" id="svc-from-name" value="${escapeHtml(s.fromName || "")}" required/></div>
          <div><label class="field-label">From Email</label><input class="input-glass" type="email" id="svc-from-email" value="${escapeHtml(s.fromEmail || "")}" required/></div>
        </div>
        <div>
          <label class="field-label">OAuth Provider</label>
          <select class="input-glass" id="svc-oauth-provider" data-limits="${limitsData}" onchange="document.getElementById('provider-limit-value').innerText = JSON.parse(this.dataset.limits)[this.value] || 'Unknown'" ${s.id ? "disabled" : ""}>
            <option value="Google" ${currentProvider === "Google" ? "selected" : ""}>Google</option>
            <option value="Microsoft" ${currentProvider === "Microsoft" ? "selected" : ""}>Microsoft</option>
          </select>
        </div>
        <div class="glass glass-card p-4 flex items-center justify-between border border-dashed border-glass-border-strong">
          ${
            s.id && s.serviceOauth?.isOAuthConnected
              ? `
            <div>
              <p 
              style="color: var(--success)"
              class="text-sm font-semibold mb-1" id="oauth-status">Account Connected</p>
              <p class="text-xs text-tertiary">Popup will open to authorize access.</p>
            </div>
            <button type="button" 
            style="display: none"
            class="btn btn-aurora btn-sm"
            id="trigger-oauth-btn"
            data-action="trigger-oauth-flow">
            Connected ✔
            </button>
          `
              : `
            <div>
              <p class="text-sm font-semibold mb-1" id="oauth-status">${s.id ? "Reauthorization Required" : "Authorization Required"}</p>
              <p class="text-xs text-tertiary">Popup will open to authorize access.</p>
            </div>
            <button type="button" 
            id="trigger-oauth-btn"
            class="btn btn-aurora btn-sm"
            data-action="trigger-oauth-flow">
            ${s.id ? "Reauthorize" : "Authorize"}
            </button>
          `
          }
        </div>
        <input type="hidden" id="svc-oauth-token" value="${s.serviceOauth?.accessToken || ""}" />
        <input type="hidden" id="svc-oauth-refresh" value="${s.serviceOauth?.refreshToken || ""}" />
      </div>
    `;
  }

  openModal({
    title: service ? `Edit Service` : `Add ${type} Service`,
    wide: true,
    bodyHTML: bodyHTML,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="save-service" data-id="${s.id || ""}" data-type="${type}">Save Service</button>`,
  });
}

async function saveService(id, type) {
  let payload = {
    providerType: type,
    fromName: $("#svc-from-name").value.trim(),
    fromEmail: $("#svc-from-email").value.trim(),
    isActive: true,
  };

  if (type === "AppPassword") {
    payload.serviceAppPassword = {
      smtpHost: $("#svc-host").value.trim(),
      smtpPort: parseInt($("#svc-port").value),
      username: $("#svc-username").value.trim(),
      password: $("#svc-password").value, // If empty, backend should handle ignoring it on update
    };
  } else if (type === "ApiKey") {
    payload.serviceApiKey = {
      providerName: $("#svc-api-provider").value,
      secretApiKey: $("#svc-api-key").value,
    };
  } else if (type === "OAuth") {
    const token = $("#svc-oauth-token").value;
    if (!token && !id)
      return showToast("You must authorize the account first.", "error");

    payload.serviceOauth = {
      oauthProvider: $("#svc-oauth-provider").value,
      accessToken: token,
      refreshToken: $("#svc-oauth-refresh").value,
      tokenExpiry: new Date(Date.now() + 3600 * 1000).toISOString(), // Example expiry
    };
  }

  try {
    let saved;
    if (id) {
      saved = await ServiceService.update(id, payload);
      showToast("Service updated successfully.", "success");
      closeModal();
      renderCard("service", saved, "update");
    } else {
      saved = await ServiceService.create(payload);
      showToast("Service created successfully.", "success");
      closeModal();
      renderCard("service", saved, "create");
    }
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

function triggerOAuthFlow() {
  const provider = $("#svc-oauth-provider").value; // "Google" or "Microsoft"

  const userToken = tokenStore.getAccessToken();

  const backendAuthUrl = `${BASE_URL}/oauth/authorize?provider=${provider}&access_token=${userToken}`;

  const popup = window.open(
    backendAuthUrl,
    "OAuthLogin",
    "width=500,height=600",
  );

  const oauthListener = (event) => {
    if (event.data && event.data.type === "oauth_success") {
      $("#svc-oauth-token").value = event.data.accessToken;
      $("#svc-oauth-refresh").value = event.data.refreshToken;

      const statusEl = $("#oauth-status");
      statusEl.textContent = "Authorized Successfully!";
      statusEl.style.color = "var(--success)";
      $("#svc-oauth-provider").disabled = true;

      $("#trigger-oauth-btn").style.display = "none";
      showToast("OAuth authorization successful.", "success");

      window.removeEventListener("message", oauthListener);
      popup.close();
    }
  };

  window.addEventListener("message", oauthListener, false);
}

/* ============================================================
   Project picker (shared by templates.html / history.html)
   ============================================================ */
async function renderProjectPicker(selectedId) {
  const projects = await ProjectService.list().catch(() => []);
  const remembered =
    selectedId ||
    localStorage.getItem(
      `emaily_last_project-${currentSubscriptionData.userId}`,
    ) ||
    projects[0]?.id ||
    "";

  if (remembered)
    localStorage.setItem(
      `emaily_last_project-${currentSubscriptionData.userId}`,
      remembered,
    );
  return {
    projects,
    selectedId: remembered,
    html: `
      <div class="mb-6 flex items-center gap-3">
        <label class="field-label mb-0" for="project-picker">Project</label>
        <select class="input-glass max-w-xs" id="project-picker">
          ${projects.map((p) => `<option value="${p.id}" ${p.id === remembered ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </div>
    `,
  };
}

/* ============================================================
   PAGE: templates.html
   ============================================================ */
async function initTemplatesPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  const requestedId = new URLSearchParams(location.search).get("project");

  const {
    projects,
    selectedId,
    html: pickerHTML,
  } = await renderProjectPicker(requestedId);

  if (!projects.length) {
    content.innerHTML = emptyState(
      "No projects yet",
      "Create a project first, then come back to add templates.",
      "Create project",
      () => redirectTo("projects"),
    );
    return;
  }

  const templates = await TemplateService.list(selectedId).catch(() => []);
  const unlockedCount = templates.filter((p) => !p.isLocked).length;
  const lockedCount = templates.length - unlockedCount;
  const planRemaining = Math.max(
    0,
    currentSubscriptionData.maxTemplates - unlockedCount,
  );
  const availableTemplatesCount = Math.min(planRemaining, lockedCount);

  content.innerHTML = `
    <div class="flex items-center justify-between mb-2"><h1 class="font-display text-2xl font-bold">Templates</h1><a href="${urlFor("template-editor", "?project=" + selectedId)}" class="btn btn-aurora btn-sm">+ New template</a></div>
    ${pickerHTML}
    ${renderUnlockBanner("templates", availableTemplatesCount)}
    <div id="templates-list">${templatesListHTML(templates)}</div>
  `;
}

function templatesListHTML(templates) {
  return templates.length
    ? `<div class="space-y-3" id="card-container">${templates
        .map((t) => `${templateCard(t)}`)
        .join("")}</div>`
    : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No templates yet</p><p class="text-secondary text-sm">Create an HTML template that submissions can render into.</p></div>`;
}

async function toggleTemplateStatus(id, currentlyActive, btnEl) {
  const next = !currentlyActive;
  btnEl.classList.add("is-busy");
  try {
    await TemplateService.setStatus(id, next);
    btnEl.classList.toggle("is-on", next);
    btnEl.dataset.active = String(next);
    showToast(next ? "Template resumed." : "Template paused.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.classList.remove("is-busy");
  }
}

async function deleteTemplate(templateId) {
  const isConfirmed = await confirm(
    "Delete this template? This action cannot be undone.",
  );
  if (!isConfirmed) return;
  try {
    await TemplateService.remove(templateId);
    showToast("Template deleted.", "success");
    renderCard("template", { id: templateId }, "delete");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

function buildSnippets(template, project) {
  const submitUrl = `${BASE_URL}/submit/${project?.publicApiKey || "YOUR_PUBLIC_KEY"}`;

  const varRegex = /\{\{\s*([^}]+)\s*\}\}/g;
  const combinedText = template.subject + " " + template.contentHtml;

  const matches = [...combinedText.matchAll(varRegex)].map((m) => m[1].trim());
  const uniqueVars = [...new Set(matches)];

  const fieldsObj = {};
  if (uniqueVars.length === 0) {
    fieldsObj["name"] = "Sara";
    fieldsObj["message"] = "Hello!";
  } else {
    uniqueVars.forEach((v, index) => {
      fieldsObj[v] = `value-${index + 1}`;
    });
  }

  const jsFields = JSON.stringify(fieldsObj, null, 4).replace(/\n/g, "\n    ");
  const pyFields = JSON.stringify(fieldsObj, null, 8)
    .replace(/\n/g, "\n        ")
    .trim();
  const csharpFieldsProps = Object.keys(fieldsObj)
    .map((key) => `${key} = "${fieldsObj[key]}"`)
    .join(",\n            ");

  // ==========================================
  // 1. Client-Side Snippets
  // ==========================================
  let clientExtraProps = "";
  if (template.enableRecaptchaV2) {
    clientExtraProps += `\n    recaptchaToken: "YOUR_RECAPTCHA_TOKEN",`;
  }
  if (template.enableAppCheck) {
    clientExtraProps += `\n    appCheckToken: "YOUR_APPCHECK_TOKEN",`;
  }

  const clientHtmlJs = `fetch("${submitUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    templateId: "${template.id}",${clientExtraProps}
    fields: ${jsFields.trim()}
  })
})
  .then((res) => res.json())
  .then((data) => console.log(data));`;

  // ==========================================
  // 2. Server-Side Snippets
  // ==========================================
  const privateKey = "YOUR_PRIVATE_KEY";

  const serverNodeJs = `const fetch = require('node-fetch');

fetch("${submitUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    privateKey: "${privateKey}",
    templateId: "${template.id}",
    recipientName: "John Doe",
    recipientEmail: "client@example.com",
    fields: ${jsFields.trim()}
  })
})
  .then((res) => res.json())
  .then((data) => console.log(data));`;

  const serverPython = `import requests

response = requests.post(
    "${submitUrl}",
    json={
        "privateKey": "${privateKey}",
        "templateId": "${template.id}",
        "recipientName": "John Doe",
        "recipientEmail": "client@example.com",
        "fields": ${pyFields}
    },
)
print(response.json())`;

  const serverCSharp = `using System.Net.Http.Json;

using var client = new HttpClient();

var payload = new
{
    privateKey = "${privateKey}",
    templateId = "${template.id}",
    recipientName = "John Doe",
    recipientEmail = "client@example.com",
    fields = new 
    { 
        ${csharpFieldsProps}
    }
};

var response = await client.PostAsJsonAsync("${submitUrl}", payload);
var result = await response.Content.ReadFromJsonAsync<object>();`;

  return { clientHtmlJs, serverNodeJs, serverPython, serverCSharp };
}

async function openCodeSnippetModal(t) {
  const projectId = t.projectId;
  const project = await ProjectService.getById(projectId).catch(() => null);
  const template = await TemplateService.getById(t.id).catch(() => null);
  if (!project || !template) {
    showToast("Could not load project or template data.", "error");
    return;
  }
  const snippets = buildSnippets(template, project);

  const langs = [
    ["clientHtmlJs", "Client (Browser)"],
    ["serverNodeJs", "Server (Node.js)"],
    ["serverPython", "Server (Python)"],
    ["serverCSharp", "Server (C#)"],
  ];

  const escapeHtml = (unsafe) => {
    return (unsafe || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  openModal({
    title: `Integrate "${template.name}"`,
    wide: true,
    bodyHTML: `
      <p class="text-secondary text-sm mb-4">Choose your environment. <strong>Client-side</strong> uses your Public Key, while <strong>Server-side</strong> requires your Private Key to be passed securely in the body.</p>
      <div class="snippet-tabs">
        ${langs.map(([key, label], i) => `<button type="button" class="snippet-tab ${i === 0 ? "is-active" : ""}" data-action="switch-snippet-tab" data-lang="${key}">${label}</button>`).join("")}
      </div>
      ${langs
        .map(
          ([key], i) => `
        <div data-snippet-panel="${key}" class="${i === 0 ? "" : "hidden"}">
          <pre class="code-block" style="white-space: pre-wrap;">${escapeHtml(snippets[key])}</pre>
          <button type="button" class="copy-btn mt-2" data-action="copy-text" data-copy="${escapeHtml(snippets[key])}">${typeof ICONS !== "undefined" && ICONS.copy ? ICONS.copy : ""} Copy snippet</button>
        </div>
      `,
        )
        .join("")}
    `,
    footerHTML: `
    <button class="btn btn-ghost" data-action="close-modal">Close</button>
    <button class="btn btn-aurora btn-sm" data-action="test-now" data-template="${encodeURIComponent(JSON.stringify(template))}" data-project="${encodeURIComponent(JSON.stringify(project))}">
    🚀 TEST NOW
    </button>
    `,
  });
}

function openTestModal(template, project) {
  const varRegex = /\{\{\s*([^}]+)\s*\}\}/g;
  const combinedText =
    (template.subject || "") +
    " " +
    (template.contentHtml || template.htmlBody || "");
  const matches = [...combinedText.matchAll(varRegex)].map((m) => m[1].trim());
  const uniqueVars = [...new Set(matches)];

  const fieldsObj = {};
  if (uniqueVars.length === 0) {
    fieldsObj["name"] = "Sara";
    fieldsObj["message"] = "Hello!";
  } else {
    uniqueVars.forEach((v, index) => {
      fieldsObj[v] = `test-value-${index + 1}`;
    });
  }

  const payload = {
    templateId: template.id,
    fields: fieldsObj,
  };

  if (template.enableRecaptchaV2) payload.recaptchaToken = "TEST_TOKEN";
  if (template.enableAppCheck) payload.appCheckToken = "TEST_TOKEN";

  const payloadStr = JSON.stringify(payload, null, 2);

  const bodyHTML = `
    <div class="space-y-4">
      <div>
        <label class="field-label">API Endpoint (POST)</label>
        <input class="input-glass font-mono text-xs text-tertiary" value="${submitUrl}" readonly />
      </div>
      <div>
        <label class="field-label">Request Payload (JSON) - You can edit this</label>
        <textarea id="test-request-payload" class="input-glass font-mono text-xs" rows="8">${escapeHtml(payloadStr)}</textarea>
      </div>
      
      <div id="test-response-container" class="hidden space-y-2 mt-4">
        <label class="field-label">API Response</label>
        <div class="p-3 bg-[#0b1120] border border-[var(--glass-border)] rounded">
          <div id="test-response-status" class="text-xs mb-2 font-bold"></div>
          <pre id="test-response-body" class="text-xs font-mono text-tertiary overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto"></pre>
        </div>
      </div>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
    <button class="btn btn-aurora" id="btn-send-test">🚀 Send Request</button>
  `;

  openModal({
    title: "Test API Integration",
    bodyHTML: bodyHTML,
    footerHTML: footerHTML,
    wide: true,
  });

  document
    .getElementById("btn-send-test")
    .addEventListener("click", async (e) => {
      const btn = e.target;
      const originalText = btn.innerHTML;
      const payloadText = document.getElementById("test-request-payload").value;
      const responseContainer = document.getElementById(
        "test-response-container",
      );
      const responseStatus = document.getElementById("test-response-status");
      const responseBody = document.getElementById("test-response-body");

      // تصفير الأخطاء وتغيير حالة الزر
      btn.innerHTML = "Sending...";
      btn.disabled = true;
      responseContainer.classList.add("hidden");

      try {
        // التحقق من صحة الـ JSON
        const reqBody = JSON.parse(payloadText);

        // إرسال الطلب الفعلي
        const res = await SubmissionService.submit(
          project?.publicApiKey,
          reqBody,
        );

        // عرض الرد
        responseContainer.classList.remove("hidden");
        responseStatus.textContent = `Status: ${res.status} ${res.statusText}`;
        responseStatus.style.color = res.ok
          ? "var(--success)"
          : "var(--danger)";

        responseBody.textContent =
          typeof res === "object" ? JSON.stringify(res, null, 2) : res;
      } catch (error) {
        responseContainer.classList.remove("hidden");
        responseStatus.textContent = "Error Detected";
        responseStatus.style.color = "var(--danger)";
        responseBody.textContent = error.message;
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
}

/* ============================================================
   PAGE: template-editor.html
   ============================================================ */

const TEMPLATE_TABS = [
  ["email", "Email details"],
  ["settings", "Settings"],
  ["service", "Sending service"],
  ["attachments", "Attachments"],
];

async function initTemplateEditorPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  const params = new URLSearchParams(location.search);
  const projectId = params.get("project");
  const templateId = params.get("template");
  // جلب التبويب الحالي من الرابط، والافتراضي هو email
  const currentTab = params.get("tab") || "email";

  if (!projectId) {
    content.innerHTML = errorPanel({ message: "No project specified." });
    return;
  }

  try {
    const [project, services, templates, subscription, plans] =
      await Promise.all([
        ProjectService.getById(projectId),
        ProjectService.getLinkedServices(projectId).catch(() => []),
        TemplateService.list(projectId).catch(() => []),
        BillingService.getSubscription().catch(() => null),
        BillingService.getPlans().catch(() => []),
      ]);

    const template = templateId
      ? templates.find((t) => t.id === templateId)
      : null;
    const plan = plans.find((p) => p.name === subscription?.planName) ||
      plans[0] || { maxAttachmentsPerTemplate: 0 };
    const otherTemplates = templates.filter((t) => t.id !== templateId);

    content.innerHTML = await templateEditorHTML({
      project,
      services,
      template,
      otherTemplates,
      maxAttachments: plan.maxAttachmentsPerTemplate || 0,
      currentTab,
    });
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function templateEditorHTML({
  project,
  services,
  template,
  otherTemplates,
  maxAttachments,
  currentTab,
}) {
  const t = template ? (await TemplateService.getById(template.id)) || {} : {};

  const isOn = t.isActive !== false;

  const issuers = [
    { name: "Firebase (Symmetric)", value: "Firebase" },
    { name: "Auth0", value: "https://auth0.com" },
    { name: "AWS Cognito", value: "https://cognito-idp.amazonaws.com" },
    { name: "Supabase", value: "https://supabase.co" },
    { name: "Azure AD", value: "https://sts.windows.net" },
    { name: "Okta", value: "https://okta.com" },
    { name: "Clerk", value: "https://clerk.dev" },
    { name: "Keycloak", value: "https://keycloak.org" },
    { name: "Kinde", value: "https://kinde.com" },
    { name: "Custom App (Internal)", value: "CustomApp" },
  ];

  return `
    <a href="${urlFor("templates", "?project=" + project.id)}" class="btn btn-ghost btn-sm mb-5">← Templates</a>
    <div class="flex items-start justify-between mb-6 gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold" id="template-title">${escapeHtml(t.name || "New template")}</h1>
        <p class="text-tertiary text-xs font-mono mt-1">${escapeHtml(project.name)}</p>
      </div>
      <div class="toggle-row shrink-0 ${isOn ? "" : "hidden"}" id="template-status-row">
          <span class="text-xs text-secondary" id="template-status-text">${isOn ? "Active" : "Paused"}</span>
          ${toggleSwitchHTML({ isOn, action: "toggle-template-status", id: t.id })}
        </div>
    </div>

    <div class="flex gap-1 mb-6 border-b overflow-x-auto" style="border-color: var(--glass-border)">
      ${TEMPLATE_TABS.map(([key, label]) => `<button type="button" class="tab-btn ${currentTab === key ? "is-active" : ""}" data-action="set-template-tab" data-tab="${key}">${label}</button>`).join("")}
    </div>

    <form id="form-template-editor" data-project-id="${project.id}" data-template-id="${t.id || ""}" class="max-w-3xl space-y-6">

      <!-- القسم الأول: تفاصيل الإيميل -->
      <div id="tab-email" class="editor-section ${currentTab === "email" ? "block" : "hidden"}">
          <div class="glass glass-card p-6">
            <h3 class="font-display font-semibold mb-4 text-lg">Email details</h3>
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div><label class="field-label">Name</label><input class="input-glass" id="tpl-name" value="${escapeHtml(t.name || "")}" placeholder="contact-form" required /></div>
              <div><label class="field-label">Subject</label><input class="input-glass" id="tpl-subject" value="${escapeHtml(t.subject || "")}" placeholder="New message from {{name}}" /></div>
            </div>
            <div class="mb-4"><label class="field-label">HTML body</label><textarea class="input-glass font-mono" style="min-height:220px" id="tpl-html" placeholder="<h1>New submission</h1>">${escapeHtml(t.contentHtml || "")}</textarea></div>
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div><label class="field-label">To Name</label><input class="input-glass" id="tpl-to-name" value="${escapeHtml(t.toName || "")}" placeholder="optional" /></div>
              <div><label class="field-label">To Email</label><input class="input-glass" id="tpl-to" value="${escapeHtml(t.toEmail || "")}" placeholder="you&#64;example.com" /></div>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div><label class="field-label">Reply-To</label><input class="input-glass" id="tpl-reply-to" value="${escapeHtml(t.replyTo || "")}" placeholder="optional" /></div>
              <div><label class="field-label">CC</label><input class="input-glass" id="tpl-cc" value="${escapeHtml(t.cc || "")}" placeholder="optional, comma-separated" /></div>
            </div>
            <div class="w-full">
              <label class="field-label">BCC</label><input class="input-glass" id="tpl-bcc" value="${escapeHtml(t.bcc || "")}" placeholder="optional, comma-separated" />
            </div>
          </div>
      </div>

      <!-- القسم الثاني: الإعدادات والحماية -->
      <div id="tab-settings" class="editor-section ${currentTab === "settings" ? "block" : "hidden"}">
          <div class="glass glass-card p-6">
            <h3 class="font-display font-semibold mb-6 text-lg">Settings & Security</h3>
            
            <div class="space-y-6">
                <!-- Don't Save to history -->
                <div class="border-b border-white/10 pb-5">
                    <label class="flex items-center gap-2 text-sm font-medium mb-3""><input type="checkbox" class="checkbox-glass" id="tpl-donot-save-history" ${t.doSaveInHistory !== false ? "" : "checked"}/>
                     Don't save private data
                     </label>
                                         <div class="pl-6">

                    <label class="field-label">All template parameter values won't be saved in History.
The resend option for the template will be disabled.</label></div>
                </div>

                <!-- Auto-reply -->
                <div class="border-b border-white/10 pb-5">
                    <label class="flex items-center gap-2 text-sm font-medium mb-3"><input type="checkbox" class="checkbox-glass" id="tpl-auto-reply" ${t.enableAutoReply ? "checked" : ""} onchange="document.getElementById('tpl-auto-reply-target').disabled = !this.checked;" /> Send auto-reply</label>
                    <div class="pl-6">
                        <label class="field-label">Auto-reply template</label>
                        <select class="input-glass disabled:opacity-50 disabled:cursor-not-allowed transition" id="tpl-auto-reply-target" ${t.enableAutoReply ? "" : "disabled"}>
                          <option value="">— choose a template —</option>
                          ${otherTemplates.map((ot) => `<option value="${ot.id}" ${t.autoReplyTemplateId === ot.id ? "selected" : ""}>${escapeHtml(ot.name)}</option>`).join("")}
                        </select>
                    </div>
                </div>

                <!-- reCAPTCHA v2 -->
                <div class="border-b border-white/10 pb-5">
                    <label class="flex items-center gap-2 text-sm font-medium mb-3"><input type="checkbox" class="checkbox-glass" id="tpl-recaptcha" ${t.enableRecaptchaV2 ? "checked" : ""} onchange="document.getElementById('tpl-recaptcha-secret-key').disabled = !this.checked;" /> reCAPTCHA v2</label>
                    <div class="pl-6">
                        <label class="field-label">reCAPTCHA Secret Key</label>
                        <input class="input-glass font-mono disabled:opacity-50 disabled:cursor-not-allowed transition" id="tpl-recaptcha-secret-key" value="${escapeHtml(t.recaptchaSecretKey || "")}" placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxx" ${t.enableRecaptchaV2 ? "" : "disabled"} />
                    </div>
                </div>

                <!-- App Check -->
                <div class="pb-2">
                    <label class="flex items-center gap-2 text-sm font-medium mb-3"><input type="checkbox" class="checkbox-glass" id="tpl-appcheck" ${t.enableAppCheck ? "checked" : ""} onchange="document.getElementById('tpl-appcheck-secret').disabled = !this.checked; document.getElementById('tpl-appcheck-issuer').disabled = !this.checked;" /> App Check</label>
                    <div class="pl-6 grid grid-cols-2 gap-4">
                        <div>
                            <label class="field-label">App Check Secret Key</label>
                            <input class="input-glass font-mono disabled:opacity-50 disabled:cursor-not-allowed transition" id="tpl-appcheck-secret" value="${escapeHtml(t.appCheckSecret || "")}" placeholder="Your Symmetric HS256 Secret" ${t.enableAppCheck ? "" : "disabled"} />
                        </div>
                        <div>
                            <label class="field-label">Expected Issuer (Optional)</label>
                            <select class="input-glass disabled:opacity-50 disabled:cursor-not-allowed transition" id="tpl-appcheck-issuer" ${t.enableAppCheck ? "" : "disabled"}>
                                <option value="">— Any Issuer —</option>
                                ${issuers.map((iss) => `<option value="${iss.value}" ${t.appCheckIssuer === iss.value ? "selected" : ""}>${iss.name}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      </div>

      <!-- القسم الثالث: السيرفر المُرسل -->
      <div id="tab-service" class="editor-section ${currentTab === "service" ? "block" : "hidden"}">
          <div class="glass glass-card p-6">
            <h3 class="font-display font-semibold mb-2 text-lg">Sending service</h3>
            
            <div class="glass glass-panel p-4 mb-4 flex items-start gap-3">
                <p class="text-secondary text-sm">If you don't select a specific service here, the system will automatically use <strong>any available active service</strong> in this project at runtime to deliver your emails.</p>
            </div>

            ${
              services.length
                ? `
              <select class="input-glass" id="tpl-service">
                <option value="">— Auto (Use any available active service) —</option>
                ${services.map((s) => `<option value="${s.id}" ${t.serviceId === s.id ? "selected" : ""}>${escapeHtml(s.fromName || s.provider)} · ${escapeHtml(s.provider)}</option>`).join("")}
              </select>
            `
                : `<p class="text-tertiary text-sm">No services connected yet. <a href="${urlFor("projects", "?id=" + project.id + "&tab=services")}" class="text-gradient-aurora font-semibold">Add one</a> first.</p>`
            }
          </div>
      </div>

      <!-- القسم الرابع: المرفقات -->
      <div id="tab-attachments" class="editor-section ${currentTab === "attachments" ? "block" : "hidden"}">
          ${
            t.id
              ? attachmentsSectionHTML(t, maxAttachments)
              : `<div class="glass glass-card p-6">
                <h3 class="font-display font-semibold mb-1 text-lg">Attachments</h3>
                <p class="text-tertiary text-sm">Save this template first, then come back to attach files (${maxAttachments} max on your plan).</p>
              </div>`
          }
      </div>

      <div class="flex gap-3 pb-4 pt-2">
        <button type="submit" data-max-attachments="${maxAttachments}" class="btn btn-aurora" id="template-editor-btn">${t.id ? "Update template" : "Create template"}</button>
        <a href="${urlFor("templates", "?project=" + project.id)}" class="btn btn-ghost">Cancel</a>
      </div>
    </form>
  `;
}

function attachmentsSectionHTML(template, maxAttachments) {
  const atts = template?.attachments || [];
  const atLimit = atts.length >= maxAttachments;
  return `
    <div class="glass glass-card p-6">
      <h3 class="font-display font-semibold mb-1 text-lg">Attachments</h3>
      <p class="text-tertiary text-xs mb-4">${maxAttachments} attachment${maxAttachments === 1 ? "" : "s"} max on your plan · ${atts.length} of ${maxAttachments} used</p>
      ${
        atts.length
          ? `<div class="space-y-2 mb-4">${atts
              .map(
                (a) => `
        <div class="glass glass-card p-3 flex items-center justify-between">
          <div class="min-w-0 flex items-center gap-3">
              <a href="${escapeHtml(a.fileUrl)}" target="_blank" class="text-sm font-mono truncate text-blue-400 hover:text-blue-300 hover:underline transition">
                  ${escapeHtml(a.fileName)}
              </a>
              <span class="text-xs text-tertiary shrink-0">(${a.fileSizeInBytes || 0} Bytes)</span>
          </div>
          <button type="button" class="btn btn-icon btn-danger shrink-0" data-action="remove-attachment" data-attachment-id="${a.id}" data-max-attachments="${maxAttachments}" aria-label="Remove attachment">${ICONS.trash || "X"}</button>
        </div>
      `,
              )
              .join("")}</div>`
          : ""
      }
      ${
        maxAttachments === 0
          ? `<p class="text-tertiary text-sm">Attachments aren't available on the Free plan. <a href="${urlFor("billing")}" class="text-gradient-aurora font-semibold">Upgrade</a> to add files.</p>`
          : atLimit
            ? `<p class="text-tertiary text-sm">You've used all ${maxAttachments} attachment slots on this plan.</p>`
            : `<input type="file" id="attachment-input" class="hidden" /><button type="button" class="btn btn-ghost btn-sm" data-action="pick-attachment" data-max-attachments="${maxAttachments}">+ Add attachment</button>`
      }
    </div>
  `;
}

async function submitTemplateEditor(projectId, templateId, maxAttachments) {
  const name = $("#tpl-name").value.trim();
  if (!name) return showToast("Give the template a name.", "error");
  const toEmail = $("#tpl-to").value.trim();
  if (!toEmail)
    return showToast("Give the template a recipient email.", "error");
  const subject = $("#tpl-subject").value.trim();
  if (!subject) return showToast("Give the template a subject.", "error");
  const html = $("#tpl-html").value.trim();
  if (!html) return showToast("Give the template an HTML body.", "error");

  const autoReply = $("#tpl-auto-reply").checked;
  const recaptcha = $("#tpl-recaptcha").checked;
  const appCheck = $("#tpl-appcheck").checked;

  const payload = {
    name,
    toEmail,
    subject,
    contentHtml: html,
    toName: $("#tpl-to-name").value.trim(),
    replyTo: $("#tpl-reply-to").value.trim() || null,
    cc: $("#tpl-cc").value.trim() || null,
    bcc: $("#tpl-bcc").value.trim() || null,

    enableRecaptchaV2: recaptcha,
    recaptchaSecretKey: recaptcha
      ? $("#tpl-recaptcha-secret-key").value.trim()
      : null,

    enableAppCheck: appCheck,
    issuer: appCheck ? $("#tpl-appcheck-issuer").value.trim() : null,
    appCheckSecret: appCheck ? $("#tpl-appcheck-secret").value.trim() : null,

    doSaveInHistory: !$("#tpl-donot-save-history").checked,

    enableAutoReply: autoReply,
    autoReplyTemplateId: autoReply
      ? $("#tpl-auto-reply-target")?.value || null
      : null,

    serviceId: $("#tpl-service")?.value || null,
  };

  try {
    let saved;
    if (templateId) {
      saved = await TemplateService.update(templateId, payload);
      showToast("Template updated.", "success");
    } else {
      saved = await TemplateService.create(projectId, payload);
      showToast("Template created.", "success");
      const url = new URL(location.href);
      url.searchParams.set("template", saved.id);
      history.replaceState(null, "", url.toString());
      $("#template-title").textContent = `${saved.name}`;
      $("#template-status-row").classList.remove("hidden");
      $("#template-editor-btn").textContent = "Update template";
      $("#form-template-editor").dataset.templateId = saved.id;
      $("#tab-attachments").innerHTML = attachmentsSectionHTML(
        saved,
        maxAttachments,
      );
    }
  } catch (err) {
    showToast(
      friendlyError(err, "Could not save template — check your plan limits."),
      "error",
    );
  }
}

async function uploadAttachment(file, maxAttachments) {
  const templateId = $("#form-template-editor")?.dataset.templateId;
  if (!templateId || !file) return;

  const fd = new FormData();
  fd.append("file", file);

  try {
    await TemplateService.addAttachment(templateId, fd);
    showToast("Attachment added.", "success");
    const template = await TemplateService.getById(templateId);
    $("#tab-attachments").innerHTML = attachmentsSectionHTML(
      template,
      maxAttachments,
    );
  } catch (err) {
    showToast(
      friendlyError(err, "Could not add attachment — check your plan limits."),
      "error",
    );
  }
}

async function removeAttachment(attachmentId, maxAttachments) {
  const templateId = $("#form-template-editor")?.dataset.templateId;
  const isConfirmed = await confirm("Remove this attachment?");
  if (!isConfirmed) return;

  try {
    await TemplateService.removeAttachment(templateId, attachmentId);
    showToast("Attachment removed.", "success");
    const template = await TemplateService.getById(templateId);
    $("#tab-attachments").innerHTML = attachmentsSectionHTML(
      template,
      maxAttachments,
    );
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   PAGE: history.html
   ============================================================ */
async function initHistoryPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  const requestedId = new URLSearchParams(location.search).get("project");
  const {
    projects,
    selectedId,
    html: pickerHTML,
  } = await renderProjectPicker(requestedId);

  if (!projects.length) {
    content.innerHTML = emptyState(
      "No projects yet",
      "Create a project first to see submission history.",
      "Create project",
      () => redirectTo("projects"),
    );
    return;
  }

  content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-2">History</h1>${pickerHTML}<div id="history-list">${await historyListHTML(1, selectedId)}</div>`;
}

function statusPillClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "sent" || s === "resent") return "is-success";
  if (s === "failed") return "is-danger";
  if (s === "quotaExceeded") return "is-danger";
  if (s === "pending") return "is-warning";
  if (s === "discarded") return "is-warning";
  return "is-neutral";
}

async function historyListHTML(page, projectId) {
  const res = await SubmissionService.listByProject(projectId, page).catch(
    () => ({ items: [] }),
  );
  const items = res.items || [];

  if (!items.length)
    return `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No submissions yet</p><p class="text-secondary text-sm">Submissions will appear here as soon as your form starts posting.</p></div>`;

  const hideRetry = (s) => {
    return ["sent", "resent", "pending"].includes(
      (s.status || "").toLowerCase(),
    );
  };

  return `
    <div class="space-y-2">${items
      .map(
        (s) => `
      <div class="glass glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <!-- الجزء الأيسر: الحالة والمستلم -->
        <div class="flex items-center gap-3">
          <span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || "Unknown")}</span>
          <span class="text-sm font-semibold">${escapeHtml(s.recipientEmail || "—")}</span>
        </div>
        
        <!-- الجزء الأيمن: التاريخ والأزرار (View & Retry) -->
        <div class="flex items-center gap-3">
    <span class="text-tertiary text-xs font-mono whitespace-nowrap">${formatDate(s.receivedAt)}</span>
    
    <!-- استخدمنا min-w-[140px] عشان نحجز مكان الزرارين دايماً، فالشكل ميتغيرش من صف للتاني -->
    <div class="flex items-center gap-2 min-w-[140px]">
      
      <!-- زر View: لو hideRetry بـ true هياخد w-full، لو بـ false هياخد flex-1 (نص المساحة) -->
      <button class="btn btn-ghost btn-sm px-3 ${hideRetry(s) ? "w-full" : "flex-1"}" data-action="view-submission" data-id="${s.id}" data-project-id="${projectId}">
        View
      </button>
      
      <!-- زر Retry: يظهر فقط إذا كانت الحالة خطأ أو غير موجودة في المصفوفة -->
      ${
        !hideRetry(s)
          ? `
        <button class="btn btn-aurora btn-sm px-3 flex-1" data-action="retry-submission" data-id="${s.id}" data-project-id="${projectId}">
          Retry
        </button>
      `
          : ""
      }
      
    </div>
  </div>
      </div>`,
      )
      .join("")}</div>
      
    ${paginationHTML(res.currentPage, res.totalPages, "history", `data-projectId="${projectId}"`)}
  `;
}

async function viewSubmission(id, projectId) {
  try {
    const s = await SubmissionService.getById(id);

    // محاولة تحويل الـ JSON Payload لشكل منسق
    let formattedPayload = s.payloadJson || "";
    try {
      if (s.payloadJson) {
        formattedPayload = JSON.stringify(JSON.parse(s.payloadJson), null, 2);
      }
    } catch (e) {
      // لو فشل التحويل، نعرضه زي ما هو
    }

    // تجهيز حقل تاريخ الإرسال
    const sentDateHtml = s.sentAt
      ? `<div class="flex justify-between"><span class="text-tertiary">Sent Date</span><span>${formatDate(s.sentAt)}</span></div>`
      : `<div class="flex justify-between"><span class="text-tertiary">Sent Date</span><span class="text-secondary">—</span></div>`;

    // 💡 شرط ظهور زر الإرسال: الحالة ليست (sent, resent, pending)
    const statusLower = (s.status || "").toLowerCase();
    const shouldShowRetry = !["sent", "resent", "pending"].includes(
      statusLower,
    );

    openModal({
      title: "Submission details",
      wide: true,
      bodyHTML: `
        <!-- استخدمنا نظام الـ Columns (Masonry) بدلاً من Grid -->
        <div class="columns-1 lg:columns-2 gap-4 lg:gap-6 text-sm">
          
          <!-- 1. Basic Info -->
          <div class="glass glass-panel p-4 space-y-3 w-full inline-block break-inside-avoid mb-4 lg:mb-6">
              <div class="flex justify-between items-start gap-2">
                  <span class="text-tertiary whitespace-nowrap mt-0.5">Status</span>
                  <span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || "—")}</span>
              </div>
              <div class="flex justify-between items-start gap-2">
                  <span class="text-tertiary whitespace-nowrap">Submission ID</span>
                  <span class="font-mono text-xs text-secondary text-right break-all">${escapeHtml(s.id || "—")}</span>
              </div>
              <div class="flex justify-between items-start gap-2">
                  <span class="text-tertiary whitespace-nowrap">Template ID</span>
                  <span class="font-mono text-xs text-secondary text-right break-all">${escapeHtml(s.templateId || "—")}</span>
              </div>
              <div class="flex justify-between items-start gap-2 border-t border-white/10 pt-3">
                  <span class="text-tertiary whitespace-nowrap">Recipient</span>
                  <span class="font-mono text-aurora text-right break-all">${escapeHtml(s.recipientEmail || "—")}</span>
              </div>
              <div class="flex justify-between items-start gap-2">
                  <span class="text-tertiary whitespace-nowrap">Subject</span>
                  <span class="text-right truncate" title="${escapeHtml(s.subject || "")}">${escapeHtml(s.subject || "—")}</span>
              </div>
          </div>

          <!-- 2. Dates -->
          <div class="glass glass-panel p-4 space-y-3 w-full inline-block break-inside-avoid mb-4 lg:mb-6">
              <div class="flex justify-between"><span class="text-tertiary">Received Date</span><span>${formatDate(s.receivedAt)}</span></div>
              ${sentDateHtml}
          </div>

          <!-- 3. Error Message -->
          ${
            s.errorMessage
              ? `
          <div class="bg-red-500/10 border border-red-500/30 p-4 rounded-xl w-full inline-block break-inside-avoid mb-4 lg:mb-6">
              <p class="text-red-400 mb-2 font-semibold">Error Message</p>
              <div class="font-mono text-xs text-red-200" style="max-height: 150px; overflow-y: auto; white-space: pre-wrap;">${escapeHtml(s.errorMessage)}</div>
          </div>`
              : ""
          }
            
          <!-- 4. AI Summary -->
          ${
            s.aiSummary
              ? `
          <div class="glass glass-panel p-4 w-full inline-block break-inside-avoid mb-4 lg:mb-6">
              <p class="text-tertiary mb-2 font-semibold">AI Summary</p>
              <p class="text-secondary leading-relaxed">${escapeHtml(s.aiSummary)}</p>
          </div>`
              : ""
          }

          <!-- 5. Payload JSON -->
          ${
            formattedPayload
              ? `
          <div class="w-full inline-block break-inside-avoid mb-4 lg:mb-6">
              <p class="text-tertiary mb-2 pl-1 font-semibold">Variables (JSON Payload)</p>
              <pre class="code-block font-mono text-xs w-full" style="max-height: 350px; overflow-y: auto;">${escapeHtml(formattedPayload)}</pre>
          </div>`
              : ""
          }

          <!-- 6. Raw HTML Body -->
          ${
            s.rawHtmlBody
              ? `
          <div class="w-full inline-block break-inside-avoid mb-4 lg:mb-6">
              <p class="text-tertiary mb-2 pl-1 font-semibold">Raw HTML Body</p>
              <pre class="code-block font-mono text-xs w-full" style="max-height: 350px; overflow-y: auto; white-space: pre-wrap;">${escapeHtml(s.rawHtmlBody)}</pre>
          </div>`
              : ""
          }
          
        </div>
      `,
      footerHTML: shouldShowRetry
        ? `<button class="btn btn-aurora" data-action="retry-submission" data-id="${s.id}" data-project-id="${projectId}">Retry send</button>`
        : "",
    });
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function retrySubmission(id, projectId) {
  try {
    await SubmissionService.retry(id);
    showToast("Retry queued.", "success");
    closeModal();
    const page = getCurrentPage();
    $("#history-list").innerHTML = await historyListHTML(page, projectId);
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   Chart primitives — plain SVG/CSS, no chart library
   ============================================================ */
function svgVolumeChart(volumeByDay, { height = 160 } = {}) {
  const days = volumeByDay || [];
  const max = Math.max(1, ...days.map((d) => d.sent + d.failed + d.pending));
  const barW = 18;
  const gap = 10;
  const width = Math.max(200, days.length * (barW + gap) + gap);
  const chartH = height - 22;
  const labelEvery = Math.max(1, Math.ceil(days.length / 7));

  const bars = days
    .map((d, i) => {
      const x = gap + i * (barW + gap);
      const sentH = (d.sent / max) * chartH;
      const failedH = (d.failed / max) * chartH;
      const pendingH = (d.pending / max) * chartH;
      let y = chartH;
      let segs = "";
      y -= sentH;
      segs += `<rect class="chart-bar" x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${sentH.toFixed(1)}" style="fill:#34d399" rx="2"><title>${d.date}: ${d.sent} sent</title></rect>`;
      y -= failedH;
      if (failedH > 0.3)
        segs += `<rect class="chart-bar" x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${failedH.toFixed(1)}" style="fill:#f87171" rx="2"><title>${d.date}: ${d.failed} failed</title></rect>`;
      y -= pendingH;
      if (pendingH > 0.3)
        segs += `<rect class="chart-bar" x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${pendingH.toFixed(1)}" style="fill:#fbbf24" rx="2"><title>${d.date}: ${d.pending} pending</title></rect>`;
      if (i % labelEvery === 0) {
        segs += `<text x="${x + barW / 2}" y="${height - 4}" font-size="9" style="fill:#64748b" text-anchor="middle">${escapeHtml(d.date.slice(5))}</text>`;
      }
      return segs;
    })
    .join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

function progressBarRow(label, value, max, colorHex) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return `
    <div class="mb-3">
      <div class="flex justify-between text-xs mb-1"><span class="text-secondary">${escapeHtml(label)}</span><span class="text-tertiary font-mono">$${value}</span></div>
      <div style="background: var(--glass-surface-strong); border-radius: 999px; height: 8px; overflow: hidden;">
        <div style="width:${pct}%; height:100%; background:${colorHex}; border-radius:999px;"></div>
      </div>
    </div>
  `;
}

function chartLegendHTML() {
  return `
    <div class="chart-legend">
      <span><span class="dot" style="background:#34d399"></span>Sent</span>
      <span><span class="dot" style="background:#f87171"></span>Failed</span>
      <span><span class="dot" style="background:#fbbf24"></span>Pending</span>
    </div>
  `;
}

/* ============================================================
   PAGE: analytics.html — user-facing, all projects or one
   ============================================================ */
async function initAnalyticsPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  const projectId = new URLSearchParams(location.search).get("project");
  try {
    if (projectId) await renderProjectAnalytics(projectId);
    else await renderOverviewAnalytics();
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function renderOverviewAnalytics() {
  const content = $("#page-content");
  const [overview, projects] = await Promise.all([
    AnalyticsService.getOverview(),
    ProjectService.list().catch(() => []),
  ]);

  content.innerHTML = `
    <div class="flex items-center justify-between mb-2 gap-3">
      <h1 class="font-display text-2xl font-bold">Analytics</h1>
      ${projects.length ? `<select class="input-glass max-w-xs" id="analytics-project-picker"><option value="">All projects</option>${projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}</select>` : ""}
    </div>
    <p class="text-secondary text-sm mb-8">Volume and delivery health across every project.</p>

    <div class="grid sm:grid-cols-4 gap-4 mb-8">
      <div class="glass glass-card stat-tile"><p class="stat-label">Total submissions</p><p class="stat-value">${overview.total}</p></div>
      <div class="glass glass-card stat-tile"><p class="stat-label">Sent</p><p class="stat-value" style="color: var(--success)">${overview.totalSent}</p></div>
      <div class="glass glass-card stat-tile"><p class="stat-label">Failed</p><p class="stat-value" style="color: var(--danger)">${overview.totalFailed}</p></div>
      <div class="glass glass-card stat-tile"><p class="stat-label">Success rate</p><p class="stat-value">${overview.successRate}%</p></div>
    </div>

    <div class="glass glass-card chart-card mb-8">
      <div class="flex items-center justify-between mb-4"><h2 class="font-display font-semibold text-sm">Last 14 days</h2>${chartLegendHTML()}</div>
      ${svgVolumeChart(overview.volumeByDay)}
    </div>

    <h2 class="font-display font-semibold text-lg mb-4">By project</h2>
    ${
      overview.byProject.length
        ? `<div class="space-y-3">${overview.byProject
            .map(
              (p) => `
      <div class="glass glass-card p-5 flex items-center justify-between flex-wrap gap-2">
        <div><p class="font-semibold text-sm">${escapeHtml(p.projectName)}</p><p class="text-tertiary text-xs mt-1">${p.total} submissions</p></div>
        <div class="flex items-center gap-4 text-sm">
          <span style="color: var(--success)">${p.sent} sent</span>
          <span style="color: var(--danger)">${p.failed} failed</span>
          <span class="text-tertiary">${p.successRate}%</span>
          <a href="${urlFor("analytics", "?project=" + p.projectId)}" class="btn btn-ghost btn-sm">View</a>
        </div>
      </div>
    `,
            )
            .join("")}</div>`
        : `<p class="text-tertiary text-sm">No submissions yet.</p>`
    }
  `;
}

async function renderProjectAnalytics(projectId) {
  const content = $("#page-content");
  const [data, projects] = await Promise.all([
    AnalyticsService.getProject(projectId),
    ProjectService.list().catch(() => []),
  ]);

  content.innerHTML = `
    <a href="${urlFor("analytics")}" class="btn btn-ghost btn-sm mb-5">← All projects</a>
    <div class="flex items-center justify-between mb-2 gap-3">
      <h1 class="font-display text-2xl font-bold">${escapeHtml(data.projectName)}</h1>
      ${projects.length ? `<select class="input-glass max-w-xs" id="analytics-project-picker">${projects.map((p) => `<option value="${p.id}" ${p.id === projectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}</select>` : ""}
    </div>
    <p class="text-secondary text-sm mb-8">Volume and delivery health for this project.</p>

    <div class="grid sm:grid-cols-4 gap-4 mb-8">
      <div class="glass glass-card stat-tile"><p class="stat-label">Total submissions</p><p class="stat-value">${data.total}</p></div>
      <div class="glass glass-card stat-tile"><p class="stat-label">Sent</p><p class="stat-value" style="color: var(--success)">${data.totalSent}</p></div>
      <div class="glass glass-card stat-tile"><p class="stat-label">Failed</p><p class="stat-value" style="color: var(--danger)">${data.totalFailed}</p></div>
      <div class="glass glass-card stat-tile"><p class="stat-label">Success rate</p><p class="stat-value">${data.successRate}%</p></div>
    </div>

    <div class="glass glass-card chart-card mb-8">
      <div class="flex items-center justify-between mb-4"><h2 class="font-display font-semibold text-sm">Last 14 days</h2>${chartLegendHTML()}</div>
      ${svgVolumeChart(data.volumeByDay)}
    </div>

    <h2 class="font-display font-semibold text-lg mb-4">By template</h2>
    ${
      data.byTemplate.length
        ? `<div class="space-y-3">${data.byTemplate
            .map(
              (t) => `
      <div class="glass glass-card p-5 flex items-center justify-between flex-wrap gap-2">
        <div><p class="font-semibold text-sm">${escapeHtml(t.templateName)}</p><p class="text-tertiary text-xs mt-1">${t.total} submissions</p></div>
        <div class="flex items-center gap-4 text-sm">
          <span style="color: var(--success)">${t.sent} sent</span>
          <span style="color: var(--danger)">${t.failed} failed</span>
          <span class="text-tertiary">${t.successRate}%</span>
        </div>
      </div>
    `,
            )
            .join("")}</div>`
        : `<p class="text-tertiary text-sm">No templates with submissions yet.</p>`
    }
  `;
}

/* ============================================================
   PAGE: billing.html
   ============================================================ */
async function initBillingPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const [plans, subscription, invoices] = await Promise.all([
      BillingService.getPlans().catch(() => []),
      BillingService.getSubscription().catch(() => null),
      BillingService.getInvoices().catch(() => []),
    ]);

    currentSubscriptionData = subscription;
    const currentPlanPrice = plans.find(
      (p) => subscription?.planId === p.id,
    ).monthlyPrice;

    content.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="font-display text-2xl font-bold mb-1">Billing</h1>
          <p class="text-secondary text-sm">Manage your plan and download past invoices.</p>
        </div>
${subscription ? `<button class="btn btn-aurora btn-sm" data-action="view-subscription-details">View Details</button>` : ""}      </div>

      <div class="grid sm:grid-cols-3 gap-5 mb-10">
        ${plans
          .map(
            (p) => `
          <div class="glass glass-card p-6" ${subscription?.planId === p.id ? `style="border-color: var(--aurora-cyan)"` : ""}>
            <p class="font-display font-semibold mb-1">${escapeHtml(p.name)}</p>
            <p class="text-2xl font-display font-bold mb-4">$${escapeHtml(p.monthlyPrice)}<span class="text-xs text-tertiary font-body">/mo</span></p>
<ul class="space-y-3 mb-6">
  <!-- Numeric Limits -->
  <li class="flex items-center gap-2.5 text-sm text-secondary">
    <svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <span><strong class="text-white font-mono">${p.maxProjects}</strong> projects</span>
  </li>
  <li class="flex items-center gap-2.5 text-sm text-secondary">
    <svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <span><strong class="text-white font-mono">${p.maxServices}</strong> services</span>
  </li>
  <li class="flex items-center gap-2.5 text-sm text-secondary">
    <svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <span><strong class="text-white font-mono">${p.maxTemplates}</strong> templates</span>
  </li>
  <li class="flex items-center gap-2.5 text-sm text-secondary">
    <svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <span><strong class="text-white font-mono">${p.maxAttachmentsPerTemplate}</strong> attachments / template</span>
  </li>
  
  <!-- Highlighted Limit (Emails) -->
  <li class="flex items-center gap-2.5 text-sm text-secondary">
    <svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
    <span><strong class="text-aurora font-mono">${p.maxEmailsPerMonth.toLocaleString()}</strong> emails / month</span>
  </li>

  <!-- Divider -->
  <li class="border-t border-white/10 my-3"></li>

  <!-- Boolean Features (Dynamic check/cross) -->
  <li class="flex items-center gap-2.5 text-sm ${p.canUseAI ? "text-secondary" : "text-tertiary opacity-50"}">
    ${
      p.canUseAI
        ? `<svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
        : `<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`
    }
    <span class="${!p.canUseAI ? "line-through" : ""}">AI Auto-summarization</span>
  </li>
  <li class="flex items-center gap-2.5 text-sm ${p.canUseGoogleSheets ? "text-secondary" : "text-tertiary opacity-50"}">
    ${
      p.canUseGoogleSheets
        ? `<svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
        : `<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`
    }
    <span class="${!p.canUseGoogleSheets ? "line-through" : ""}">Google Sheets integration</span>
  </li>
  <li class="flex items-center gap-2.5 text-sm ${p.canUseTelegramBot ? "text-secondary" : "text-tertiary opacity-50"}">
    ${
      p.canUseTelegramBot
        ? `<svg class="w-4 h-4 text-aurora shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
        : `<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`
    }
    <span class="${!p.canUseTelegramBot ? "line-through" : ""}">Telegram bot integration</span>
  </li>
</ul>
<button class="btn ${subscription?.planId === p.id && p.name === "Free" ? "btn-ghost" : "btn-aurora"} btn-sm w-full justify-center" data-action="subscribe-plan" data-id="${p.id}" data-name="${escapeHtml(p.name)}" ${subscription?.planId === p.id && p.name === "Free" ? "disabled" : ""}>${subscription?.planId === p.id ? (p.name === "Free" ? "Auto-renews" : "Renew") : p.monthlyPrice > currentPlanPrice ? `Upgrade to ${escapeHtml(p.name)}` : `Downgrade to ${escapeHtml(p.name)}`}</button>          </div>`,
          )
          .join("")}
      </div>

      <h2 class="font-display font-semibold text-lg mb-4">Invoices</h2>
      ${invoices.length ? `<div class="space-y-2">${invoices.map((inv) => `<div class="glass glass-card p-4 flex items-center justify-between"><span class="text-sm">${formatDate(inv.invoiceDate)}</span><a class="btn btn-ghost btn-sm" href="${inv.invoicePdfUrl}" target="_blank" rel="noopener">Download PDF</a></div>`).join("")}</div>` : `<p class="text-tertiary text-sm">No invoices yet.</p>`}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function openContactAdminModal(planName) {
  const subject = `Emaily Plan Upgrade Request - ${planName}`;
  const message = `Hello,

I would like to request an upgrade/change for my Emaily account to the "${planName}" plan. 
Please let me know the available payment methods and the next steps to activate it.

Thank you!`;

  const contactLink = `https://ahm3dramad3n.github.io/portfolio/en/contact.html?subject=${encodeURIComponent(subject)}&message=${encodeURIComponent(message)}`;

  const bodyHTML = `
    <div class="space-y-4 text-sm text-secondary">
      <p>Subscription changes are currently managed by the system administrator.</p>
      <p>To proceed, please contact the admin. You can copy the suggested message below:</p>
      
      <div class="glass glass-card p-4 rounded space-y-5 mt-4">
        
        <!-- قسم الـ Subject -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-tertiary text-xs">Suggested Subject:</span>
            <button type="button" class="copy-btn btn btn-ghost btn-sm px-2 py-1 h-auto text-xs flex items-center gap-1" data-action="copy-text" data-copy="${escapeHtml(subject)}">
              ${ICONS.copy} Copy
            </button>
          </div>
          <code class="font-mono text-aurora-cyan block">${escapeHtml(subject)}</code>
        </div>
        
        <hr class="border-white/10" />

        <!-- قسم الـ Message -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-tertiary text-xs">Suggested Message:</span>
            <button type="button" class="copy-btn btn btn-ghost btn-sm px-2 py-1 h-auto text-xs flex items-center gap-1" data-action="copy-text" data-copy="${escapeHtml(message)}">
              ${ICONS.copy} Copy
            </button>
          </div>
          <code class="font-mono text-white block whitespace-pre-wrap">${escapeHtml(message)}</code>
        </div>
        
      </div>
    </div>
  `;

  openModal({
    title: "Change Subscription Plan",
    bodyHTML: bodyHTML,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <a class="btn btn-aurora" href="${contactLink}" target="_blank" rel="noopener">Contact Admin</a>
    `,
  });
}

function openFreePlanDowngradeModal(planId, planName) {
  const bodyHTML = `
    <div class="space-y-4 text-sm text-secondary">
      <p>Are you sure you want to downgrade to the <strong class="text-white">${escapeHtml(planName)}</strong> plan?</p>
      <div class="glass glass-card p-4 rounded border-warning/50 bg-warning/10 space-y-2">
        <p class="text-warning font-medium">⚠️ Important Note:</p>
        <p>You will lose your remaining email quota and active benefits for the rest of this billing cycle immediately upon downgrading.</p>
      </div>
    </div>
  `;

  openModal({
    title: "Confirm Downgrade",
    bodyHTML: bodyHTML,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <!-- التعديل هنا: استخدمنا data-action بدلاً من onclick -->
      <button class="btn btn-danger" data-action="confirm-downgrade" data-id="${planId}">Confirm Downgrade</button>
    `,
  });
}

function openSubscriptionDetailsModal() {
  if (!currentSubscriptionData) return;

  const sub = currentSubscriptionData;

  const bodyHTML = `
    <div class="space-y-4">
      <div class="flex justify-between border-b border-white/10 pb-3">
        <span class="text-tertiary">Current Plan</span>
        <span class="font-semibold" style="color: var(--aurora-cyan)">${escapeHtml(sub.planName)}</span>
      </div>
      <div class="flex justify-between border-b border-white/10 pb-3">
        <span class="text-tertiary">Status</span>
        <span class="status-pill ${sub.status === "Active" ? "is-success" : "is-warning"}">${escapeHtml(sub.status)}</span>
      </div>
      <div class="flex justify-between border-b border-white/10 pb-3">
        <span class="text-tertiary">Billing Period</span>
        <span class="text-sm font-mono">${formatDate(sub.startDate)} - ${formatDate(sub.endDate)}</span>
      </div>
      
      <h4 class="font-display font-semibold text-sm mt-6 mb-3 text-secondary">Usage Metrics</h4>
      
      <div class="space-y-3 glass p-4 rounded-lg">
        <div class="flex justify-between text-sm">
          <span class="text-secondary">Projects</span>
          <span class="font-mono">${sub.usedProjects} / ${sub.maxProjects}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-secondary">Templates</span>
          <span class="font-mono">${sub.usedTemplates} / ${sub.maxTemplates}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-secondary">Connected Services</span>
          <span class="font-mono">${sub.usedServices} / ${sub.maxServices}</span>
        </div>
        <div class="flex justify-between text-sm pt-2 border-t border-white/10 mt-2">
          <span class="text-secondary">Remaining Emails</span>
          <span class="font-mono text-aurora-green">${sub.remainingEmails.toLocaleString()}</span>
        </div>
        ${
          sub.overageEmails > 0
            ? `
        <div class="flex justify-between text-sm">
          <span class="text-secondary">Overage Emails</span>
          <span class="font-mono" style="color: var(--danger)">${sub.overageEmails.toLocaleString()}</span>
        </div>`
            : ""
        }
      </div>
    </div>
  `;

  // استدعاء دالة الـ Modal الجلوبال الخاصة بك
  openModal({
    title: "Subscription Details",
    bodyHTML: bodyHTML,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
    wide: false,
  });
}

async function subscribeToPlan(planId) {
  try {
    await BillingService.subscribe(planId);
    showToast("Subscription updated.", "success");
    await initBillingPage();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   PAGE: account.html
   ============================================================ */
async function initAccountPage(user) {
  $("#page-content").innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">Account</h1>
    <p class="text-secondary text-sm mb-8">Update your profile details.</p>
    <div class="glass glass-card p-6 max-w-md mb-6">
      <form id="form-account" class="space-y-4">
        <div><label class="field-label" for="account-name">Name</label><input class="input-glass" id="account-name" value="${escapeHtml(user.fullName || "")}" /></div>
        <div><label class="field-label" for="account-notify-email">Notification email</label><input class="input-glass" id="account-notify-email" value="${escapeHtml(user.devNotificationEmail || user.email || "")}" /></div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
    <div class="glass glass-card p-6 max-w-md mb-6">
      <h3 class="font-display font-semibold mb-4">Change password</h3>
      <form id="form-change-password" class="space-y-4">
          <div><label class="field-label" for="pwd-current">Current password</label>
                  <div class="relative">

            <input class="input-glass pr-10" type="password" id="pwd-current" required />
            <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>
          </div>
                    </div>

          <div><label class="field-label" for="pwd-new">New password</label>
                  <div class="relative">

            <input class="input-glass pr-10" type="password" id="pwd-new" minlength="8" required />
            <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>
          </div>           </div>

          <div><label class="field-label" for="pwd-confirm">Confirm new password</label>
                  <div class="relative">

            <input class="input-glass pr-10" type="password" id="pwd-confirm" minlength="8" required />
            <button type="button" class="absolute inset-y-0 right-0 flex items-center pr-3 text-tertiary hover:text-white transition" data-action="toggle-password" title="Toggle password visibility">${ICONS.eye}</button>
                  </div>

            </div>
         <p class="field-error hidden" data-error-for="change-password"></p>
        <button type="submit" class="btn btn-aurora btn-sm">Update password</button>
      </form>
    </div>
    <div class="glass glass-card p-6 max-w-md" style="border-color: rgba(248,113,113,0.25)">
      <h3 class="font-display font-semibold mb-2" style="color: var(--danger)">Danger zone</h3>
      <p class="text-secondary text-sm mb-4">Deleting your account is permanent. Your projects, templates, services, and submission history stay in place for records but become permanently inaccessible, and you'll be signed out immediately.</p>
      <button class="btn btn-danger btn-sm" data-action="delete-account">Delete my account</button>
    </div>
  `;
}

async function saveAccount() {
  try {
    await UserService.updateMe({
      fullName: $("#account-name").value.trim(),
      devNotificationEmail: $("#account-notify-email").value.trim(),
    });
    showToast("Profile updated.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function changePassword(form) {
  const errorEl = $('[data-error-for="change-password"]');
  errorEl.classList.add("hidden");
  const current = $("#pwd-current").value;
  const next = $("#pwd-new").value;
  const confirmVal = $("#pwd-confirm").value;
  if (next !== confirmVal) {
    errorEl.textContent = "New password and confirmation do not match.";
    errorEl.classList.remove("hidden");
    return;
  }
  const btn = $('button[type="submit"]', form);
  setBtnLoading(btn, true, "Updating…");
  try {
    await UserService.changePassword(current, next);
    showToast("Password updated.", "success");
    form.reset();
  } catch (err) {
    errorEl.textContent = friendlyError(err, "Could not update password.");
    errorEl.classList.remove("hidden");
  } finally {
    setBtnLoading(btn, false, "Update password");
  }
}

async function deleteAccount() {
  const isConfirmed = await confirm(
    "Delete your account? This cannot be undone and you will be signed out immediately.",
  );
  if (!isConfirmed) return;

  const areYouSure = await confirm(
    "Are you absolutely sure? This is permanent.",
  );
  if (!areYouSure) return;

  try {
    await UserService.deleteMe();
    tokenStore.clear();
    showToast("Account deleted.", "info");
    redirectTo("landing");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
    Search functions for admin pages
   ============================================================ */
async function searchDbUsers(page = 1) {
  const term = $("#db-search").value.trim();

  if (!term) {
    return loadAdminUsers();
  }

  try {
    const user = await AdminService.searchUsers(term, page);
    renderUsersTable(user);
  } catch (err) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">User not found.</p>`;
  }
}

async function searchDbProjects(page = 1) {
  const term = $("#db-search").value.trim();

  if (!term) {
    return loadAdminProjects();
  }

  try {
    const project = await AdminService.searchProjects(term, page);
    renderProjectsTable(project);
  } catch (err) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">Project not found.</p>`;
  }
}

async function searchDbTemplates(page = 1) {
  const term = $("#db-search").value.trim();

  if (!term) {
    return loadAdminTemplates();
  }

  try {
    const template = await AdminService.searchTemplates(term, page);
    renderTemplatesTable(template);
  } catch (err) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">Template not found.</p>`;
  }
}

async function searchDbServices(page = 1) {
  const term = $("#db-search").value.trim();

  if (!term) {
    return loadAdminServices();
  }

  try {
    const service = await AdminService.searchServices(term, page);
    renderServicesTable(service);
  } catch (err) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">Service not found.</p>`;
  }
}

async function searchDbBanned(page = 1) {
  const term = $("#db-search").value.trim();

  if (!term) {
    return loadAdminBanned();
  }

  try {
    const banned = await AdminService.searchBanned(term, page);
    renderBannedTable(banned);
  } catch (err) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">Banned user not found.</p>`;
  }
}

async function searchDbLogs(page = 1) {
  const term = $("#db-search").value.trim();

  if (!term) {
    return loadAdminLogs();
  }

  try {
    const log = await AdminService.searchLogs(term, page);
    renderLogsTable(log);
  } catch (err) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">Log not found.</p>`;
  }
}

/* ============================================================
    HTML snippets for admin pages
   ============================================================ */
function browseSearchBarHTML(scope, placeholder = "Search...") {
  return `
    <input class="input-glass max-w-xs" id="db-search" data-scope="${scope}" placeholder="${placeholder}" />
  `;
}

/* ============================================================
    Shared browse control
    ============================================================ */
function browseControlHTML(count, scope) {
  return `
    <div class="glass glass-card p-5 mb-6 flex items-end gap-4 flex-wrap">
      <div><p class="text-tertiary text-xs uppercase tracking-wide mb-1">Total</p><p id="browse-count-${scope}" class="font-display text-2xl font-bold">${count.toLocaleString()}</p></div>
      <div class="flex items-end gap-2 ml-auto">
            <input class="input-glass max-w-xs" id="local-search" placeholder="Filter current page..." />

            </div>
    </div>
  `;
}

/* ============================================================
    Render functions for admin pages
   ============================================================ */

function renderUsersTable(res) {
  const dataToRender = res.items || res;

  if (!dataToRender || !dataToRender.length) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">No users to show.</p>`;
    return;
  }

  $("#admin-browse-table").innerHTML = `
  <div class="space-y-2">
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th class="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>${dataToRender
        .map(
          (u) => `
        <tr>
          <td>${escapeHtml(u.fullName || "—")}</td>
          <td class="font-mono text-xs">${escapeHtml(u.email)}</td>
          <td class="text-right whitespace-nowrap space-x-1">
            <!-- الأزرار الأربعة جنب بعض -->
            <button class="btn btn-ghost btn-sm" data-action="view-user-projects" data-id="${u.id}" data-name="${escapeHtml(u.fullName)}">Projects</button>
            <button class="btn btn-ghost btn-sm" data-action="admin-view-user" data-id="${u.id}">View</button>
            <button class="btn btn-aurora btn-sm" data-action="admin-open-subscribe" data-id="${u.id}" data-name="${escapeHtml(u.fullName)}">Subscribe</button>
            <button class="btn ${u.isActive ? "btn-danger" : "btn-ghost"} btn-sm" data-action="toggle-user-status" data-id="${u.id}" data-active="${u.isActive}">${u.isActive ? "Suspend" : "Activate"}</button>
          </td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
        ${paginationHTML(res.currentPage, res.totalPages, "users")}
  </div>`;
}

function renderProjectsTable(res) {
  const dataToRender = res.items || res;

  if (!dataToRender || !dataToRender.length) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">No projects to show.</p>`;
    return;
  }

  $("#admin-browse-table").innerHTML = `
    <div class="space-y-2">
    <table class="data-table">
      <thead><tr><th>Name</th><th>Owner</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>${res.items
        .map(
          (p) => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td class="font-mono text-xs">${escapeHtml(p.userId || "—")}</td>
          <td><span class="status-pill ${p.isActive ? "is-success" : "is-warning"}">${p.isActive ? "Active" : "Paused"}</span></td>
          <td class="text-tertiary text-xs">${formatDate(p.createdAt)}</td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-action="view-admin-project" data-id="${p.id}">Templates / Services</button></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
        ${paginationHTML(res.currentPage, res.totalPages, "projects")}
    </div>
  `;
}

function renderTemplatesTable(res) {
  const dataToRender = res.items || res;

  if (!dataToRender || !dataToRender.length) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">No templates to show.</p>`;
    return;
  }

  $("#admin-browse-table").innerHTML = `
    <div class="space-y-2">
    <table class="data-table">
      <thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>${res.items
        .map(
          (t) => `
        <tr>
          <td>${escapeHtml(t.name)}</td>
          <td class="text-xs text-tertiary truncate">${escapeHtml(t.subject || "")}</td>
          <td><span class="status-pill ${t.isActive ? "is-success" : "is-warning"}">${t.isActive ? "Active" : "Paused"}</span></td>
          <td class="text-tertiary text-xs">${formatDate(t.createdAt)}</td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-action="view-admin-template" data-id="${t.id}">View</button></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
        ${paginationHTML(res.currentPage, res.totalPages, "templates")}
    </div>
  `;
}

function renderServicesTable(res) {
  const dataToRender = res.items || res;

  if (!dataToRender || !dataToRender.length) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">No services to show.</p>`;
    return;
  }

  $("#admin-browse-table").innerHTML = `
    <div class="space-y-2">
    <table class="data-table">
      <thead><tr><th>Provider</th><th>From</th><th>Status</th><th></th></tr></thead>
      <tbody>${res.items
        .map(
          (s) => `
        <tr>
          <td>${escapeHtml(s.providerType)}</td>
          <td class="text-xs text-tertiary font-mono">${escapeHtml(s.fromEmail || "_")}</td>
          <td><span class="status-pill ${s.isActive ? "is-success" : "is-warning"}">${s.isActive ? "Active" : "Paused"}</span></td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-action="view-admin-service" data-id="${s.id}">View</button></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
        ${paginationHTML(res.currentPage, res.totalPages, "services")}
    </div>
  `;
}

function renderBannedTable(res) {
  const dataToRender = res.items || res;

  if (!dataToRender || !dataToRender.length) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">No banned users to show.</p>`;
    return;
  }

  $("#admin-browse-table").innerHTML = `
    <div class="space-y-4 w-full">
      <div class="overflow-x-auto w-full rounded-lg border border-[var(--glass-border)]">
        <table class="data-table w-full text-left whitespace-nowrap">
          <thead>
            <tr>
              <th class="px-4 py-3">IP Address</th>
              <th class="px-4 py-3">Ban Level</th>
              <th class="px-4 py-3">Banned until</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${dataToRender
              .map((b) => {
                const detailsJson = escapeHtml(
                  JSON.stringify(b.banDetails || []),
                );

                return `
              <tr class="border-b border-[var(--glass-border)] hover:bg-[var(--glass-surface)] transition-colors">
                <td class="px-4 py-3 font-mono text-xs">${escapeHtml(b.ipAddress)}</td>
                <td class="px-4 py-3">
                  <span class="status-pill is-danger">Level ${escapeHtml(b.banLevel)}</span>
                </td>
                <td class="px-4 py-3 text-tertiary text-xs">${formatDate(b.bannedUntil)}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button class="btn btn-ghost btn-sm" data-action="view-ban-details" data-id="${escapeHtml(b.ipAddress)}" title="View violation details">Details</button>
                  
                  <button class="btn btn-ghost btn-sm" data-operation="reduce" data-action="open-ban-modal" data-id="${escapeHtml(b.ipAddress)}" title="Decrement violation count by 1">Reduce</button>
                  <button class="btn btn-icon btn-danger" data-operation="delete" data-action="open-ban-modal" data-id="${escapeHtml(b.ipAddress)}" aria-label="Remove ban">${ICONS.trash}</button>
                </td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      ${paginationHTML(res.currentPage, res.totalPages, "banned")}
    </div>
  `;
}

function renderLogsTable(res) {
  const dataToRender = res.items || res;

  if (!dataToRender || !dataToRender.length) {
    $("#admin-browse-table").innerHTML =
      `<p class="text-tertiary text-sm p-4 text-center">No logs to show.</p>`;
    return;
  }

  $("#admin-browse-table").innerHTML = `
  <div class="space-y-4 w-full">
    <!-- حاوية مخصصة لمنع خروج الجدول عن الشاشة وإضافة Scroll أفقي للجدول فقط -->
    <div class="overflow-x-auto w-full rounded-lg border border-[var(--glass-border)]">
      <table class="data-table w-full text-left whitespace-nowrap">
        <thead>
          <tr>
            <th class="px-4 py-3">Level</th>
            <th class="px-4 py-3">Trace & IP</th>
            <th class="px-4 py-3">Identifiers</th>
            <th class="px-4 py-3">Details (Message & Exception)</th>
            <th class="px-4 py-3">Time</th>
          </tr>
        </thead>
        <tbody>
          ${dataToRender
            .map((l) => {
              // تحديد لون الـ Status
              let pillClass = "is-neutral";
              if (l.logLevel === "Error" || l.logLevel === "Critical")
                pillClass = "is-danger";
              else if (l.logLevel === "Warning") pillClass = "is-warning";

              return `
            <tr class="border-b border-[var(--glass-border)] hover:bg-[var(--glass-surface)] transition-colors">
              
              <!-- 1. Log Level -->
              <td class="px-4 py-3">
                <span class="status-pill ${pillClass}">${escapeHtml(l.logLevel)}</span>
              </td>
              
              <!-- 2. Execution Trace & IP Address -->
              <td class="px-4 py-3 text-xs">
                <div class="font-mono text-primary mb-1">${escapeHtml(l.executionTrace || "-")}</div>
                <div class="text-tertiary">IP: <span class="font-mono">${escapeHtml(l.ipAddress || "N/A")}</span></div>
              </td>
              
              <!-- 3. UserId & ProjectId -->
              <td class="px-4 py-3 text-xs">
                <div class="text-secondary mb-1">User: <span class="font-mono">${escapeHtml(l.userId || "N/A")}</span></div>
                <div class="text-secondary">Proj: <span class="font-mono">${escapeHtml(l.projectId || "N/A")}</span></div>
              </td>
              
              <!-- 4. Message & Exception (يمنع الـ Overflow ويسمح بالـ Hover والنسخ) -->
              <td class="px-4 py-3 text-xs" style="max-width: 350px;">
                <!-- الرسالة -->
                <div class="truncate block w-full text-primary font-medium cursor-text" 
                     title="${escapeHtml(l.message)}">
                  ${escapeHtml(l.message)}
                </div>
                
                <!-- تفاصيل الخطأ (تظهر فقط إن وجدت) -->
                ${
                  l.exceptionDetails
                    ? `
                <div class="truncate block w-full text-tertiary mt-1 font-mono opacity-80 cursor-text" 
                     title="${escapeHtml(l.exceptionDetails)}">
                  ${escapeHtml(l.exceptionDetails)}
                </div>`
                    : ""
                }
              </td>
              
              <!-- 5. CreatedAt -->
              <td class="px-4 py-3 text-tertiary text-xs">
                ${formatDate(l.createdAt)}
              </td>

            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
    
    <!-- الـ Pagination أسفل الجدول -->
    ${paginationHTML(res.currentPage, res.totalPages, "logs")}
  </div>
  `;
}

/* ============================================================
    Filter table rows for admin pages
   ============================================================ */

function filterTableRows(term) {
  const lowerTerm = term.toLowerCase();
  const rows = document.querySelectorAll(".data-table tbody tr");

  rows.forEach((row) => {
    // تجميع النص من كل خلايا الصف بعد إزالة الأزرار منها
    const rowText = Array.from(row.cells)
      .map((cell) => {
        // نأخذ نسخة وهمية من الخلية
        const clone = cell.cloneNode(true);
        // نحذف أي زرار داخل هذه النسخة الوهمية
        clone.querySelectorAll("button").forEach((btn) => btn.remove());
        // نرجع النص الصافي
        return clone.textContent;
      })
      .join(" ") // نربط نصوص الخلايا بمسافة
      .toLowerCase();

    // البحث في النص الصافي
    row.style.display = rowText.includes(lowerTerm) ? "" : "none";
  });
}

/* ============================================================
    Shared pagination control
    ============================================================ */
function paginationHTML(currentPage, totalPages, scope = "", extraAttrs = "") {
  return `
    <div class="flex items-center justify-center gap-4 mt-6">
      <!-- أزرار التنقل العادية -->
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-sm" data-action="pagination-browse" data-scope="${scope}" data-dir="-1" ${extraAttrs} ${currentPage <= 1 ? "disabled" : ""}>Previous</button>
        <span class="text-tertiary text-xs self-center">Page <span id="pagination-page">${currentPage}</span> of <span id="pagination-total">${totalPages}</span></span>
        <button class="btn btn-ghost btn-sm" data-action="pagination-browse" data-scope="${scope}" data-dir="1" ${extraAttrs} ${totalPages <= currentPage ? "disabled" : ""}>Next</button>
      </div>
      
      <!-- فاصل عمودي -->
      <div class="w-px h-5 bg-white/10 hidden sm:block"></div>
      
      <!-- قسم الانتقال لصفحة مخصصة -->
      <div class="flex items-center gap-2">
        <input type="number" id="pagination-custom-input" class="input-glass px-2 py-0.5 w-16 h-7 text-xs text-center" placeholder="No." min="1" max="${totalPages}" />
        <button class="btn btn-aurora btn-sm px-3 h-7 text-xs" data-action="pagination-jump-btn" data-scope="${scope}" ${extraAttrs}>Go</button>
      </div>
    </div>
  `;
}

function getCurrentPage() {
  const pageElement = document.getElementById("pagination-page");
  return pageElement ? parseInt(pageElement.textContent) || 1 : 1;
}

/* ============================================================
   PAGE: admin/index.html
   ============================================================ */
async function initAdminDashboardPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const stats = await AdminService.getDashboard();
    const hangfireUrl = BASE_URL.replace(/\/api\/?$/, "/hangfire");
    const cards = [
      ["Total users", stats.totalUsers],
      ["Active users", stats.activeUsers],
      ["Active projects", stats.totalProjects],
      ["Revenue", `$${stats.totalRevenue}`],
      ["Pending submissions", stats.pendingSubmissions],
      ["Failed submissions", stats.failedSubmissions],
    ];
    content.innerHTML = `
  <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
    <div>
      <h1 class="font-display text-2xl font-bold mb-1">Admin overview</h1>
      <p class="text-secondary text-sm">System-wide stats across all Emaily accounts.</p>
    </div>
    <a href="${hangfireUrl}" target="_blank" class="glass px-4 py-2 text-sm font-bold flex items-center gap-2 hover:bg-white hover:text-black transition-colors">
      Hangfire Dashboard
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
    </a>
  </div>

  <div class="grid sm:grid-cols-3 gap-5">
    ${cards
      .map(
        ([label, val]) => `
      <div class="glass glass-panel p-6">
        <p class="text-tertiary text-xs uppercase tracking-wide mb-2">${label}</p>
        <p class="font-display text-3xl font-bold">${val}</p>
      </div>
    `,
      )
      .join("")}
  </div>
`;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

/* ============================================================
   PAGE: admin/analytics.html
   ============================================================ */
async function initAdminAnalyticsPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const data = await AdminService.getAnalytics();
    const maxRevenue = Math.max(1, ...data.revenueByPlan.map((p) => p.mrr));

    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">System analytics</h1>
      <p class="text-secondary text-sm mb-8">Everything happening across every Emaily account.</p>

      <div class="grid sm:grid-cols-4 gap-4 mb-6">
        <div class="glass glass-card stat-tile"><p class="stat-label">Total users</p><p class="stat-value">${data.totalUsers}</p></div>
        <div class="glass glass-card stat-tile"><p class="stat-label">Active users</p><p class="stat-value">${data.activeUsers}</p></div>
        <div class="glass glass-card stat-tile"><p class="stat-label">Suspended</p><p class="stat-value" style="color: var(--danger)">${data.suspendedUsers}</p></div>
        <div class="glass glass-card stat-tile"><p class="stat-label">Active projects</p><p class="stat-value">${data.totalProjects}</p></div>
      </div>

      <div class="grid sm:grid-cols-4 gap-4 mb-8">
        <div class="glass glass-card stat-tile"><p class="stat-label">Emails sent</p><p class="stat-value" style="color: var(--success)">${data.totalEmailsSent}</p></div>
        <div class="glass glass-card stat-tile"><p class="stat-label">Emails failed</p><p class="stat-value" style="color: var(--danger)">${data.totalEmailsFailed}</p></div>
        <div class="glass glass-card stat-tile"><p class="stat-label">Success rate</p><p class="stat-value">${data.overallSuccessRate}%</p></div>
        <div class="glass glass-card stat-tile"><p class="stat-label">MRR</p><p class="stat-value">$${data.totalMRR}</p></div>
      </div>

      <div class="glass glass-card chart-card mb-8">
        <div class="flex items-center justify-between mb-4"><h2 class="font-display font-semibold text-sm">System-wide volume — last 14 days</h2>${chartLegendHTML()}</div>
        ${svgVolumeChart(data.volumeByDay)}
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <div class="glass glass-card p-6">
          <h2 class="font-display font-semibold text-sm mb-4">Revenue by plan</h2>
          ${data.revenueByPlan.map((p) => progressBarRow(`${p.planName} (${p.subscriberCount} subscriber${p.subscriberCount === 1 ? "" : "s"})`, p.mrr, maxRevenue, "#fbbf24")).join("") || '<p class="text-tertiary text-sm">No active subscriptions yet.</p>'}        </div>
        <div class="glass glass-card p-6">
          <h2 class="font-display font-semibold text-sm mb-4">System health</h2>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-tertiary">Status</span><span class="status-pill is-success">${escapeHtml(data.systemHealth.status)}</span></div>
            <div class="flex justify-between"><span class="text-tertiary">Queue depth</span><span>${data.systemHealth.queueDepth} pending</span></div>
            <div class="flex justify-between"><span class="text-tertiary">Avg delivery time</span><span>${data.systemHealth.avgDeliveryTimeMs} ms</span></div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

/* ============================================================
   PAGE: admin/users.html
   ============================================================ */
async function initAdminUsersPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const res = await AdminService.listUsers(1);

    content.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex flex-col gap-2 mb-6">
          <h1 class="font-display text-2xl font-bold">Users</h1>
          <p class="text-secondary text-sm">Every User account across all Emaily projects</p>
        </div>

        ${browseSearchBarHTML("users", "Search by ID, name, or email…")}
      </div>
        
        ${browseControlHTML(res.totalCount, "users")}
        <div id="admin-browse-table"></div>
    `;

    await loadAdminUsers(1, res);
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminUsers(page = 1, res = null) {
  const term = $("#db-search").value.trim();
  if (term) {
    return searchDbUsers(page);
  }

  res = res || (await AdminService.listUsers(page));
  renderUsersTable(res);
}

async function openAdminViewUserModal(userId) {
  try {
    const user = await AdminService.getUserDetails(userId);
    if (!user) return;

    const bodyHTML = `
      <div class="space-y-3 text-sm">
        <p class="text-tertiary text-xs">User Details</p>
        <!-- البيانات الأساسية -->
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">User ID</span>
          <span class="font-mono text-xs">${escapeHtml(user.id)}</span>
        </div>
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Full Name</span>
          <span class="font-semibold">${escapeHtml(user.fullName || "—")}</span>
        </div>
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Email</span>
          <span class="font-mono text-xs">${escapeHtml(user.email)}</span>
        </div>
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Dev Notification Email</span>
          <span class="font-mono text-xs">${escapeHtml(user.devNotificationEmail || "—")}</span>
        </div>

        <!-- حالة الحساب والصلاحيات -->
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Status</span>
          <span class="status-pill ${user.isActive ? "is-success" : "is-danger"}">${user.isActive ? "Active" : "Suspended"}</span>
        </div>
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Role</span>
          <span>${escapeHtml(user.roles || "User")}</span>
        </div>

        <!-- معلومات الاشتراك والاستهلاك -->
        <div class="flex justify-between border-b border-white/10 pb-2 mt-4">
          <span class="text-tertiary">Current Plan</span>
          <span class="font-semibold" style="color: var(--aurora-cyan)">${escapeHtml(user.planName || "No Plan")}</span>
        </div>
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Remaining Quota</span>
          <span class="font-mono">${(user.remainingQuota || 0).toLocaleString()} emails</span>
        </div>
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Overage Emails</span>
          <span class="font-mono" style="color: var(--danger)">${escapeHtml(user.overageEmails || "0")}</span>
        </div>

        <!-- إحصائيات النظام -->
        <div class="flex justify-between border-b border-white/10 pb-2">
          <span class="text-tertiary">Usage (Proj / Serv / Temp)</span>
          <span class="font-mono">${user.projectsCount} / ${user.servicesCount} / ${user.templatesCount}</span>
        </div>
        
        <div class="flex justify-between pb-2">
          <span class="text-tertiary">Joined At</span>
          <span class="text-xs text-tertiary">${formatDate(user.createdAt)}</span>
        </div>
      </div>
    `;

    openModal({
      title: "User Details",
      bodyHTML: bodyHTML,
      footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
    });
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function openAdminSubscribeModal(userId, userName) {
  let plans = [];
  try {
    plans = await BillingService.getPlans();
  } catch {
    plans = [];
  }

  const bodyHTML = `
    <div class="space-y-4 text-sm">
      <p>Select a new plan to assign for <strong class="text-white">${escapeHtml(userName)}</strong>:</p>
      <div>
        <label class="field-label mb-2 block">Available Plans</label>
        <select class="input-glass w-full" id="admin-target-plan-id">
          ${plans.map((p) => `<option value="${p.id}" class="bg-dark text-white">${escapeHtml(p.name)} - $${p.monthlyPrice}/mo (${p.maxProjects} Projects)</option>`).join("")}
        </select>
      </div>
    </div>
  `;

  openModal({
    title: "Assign Plan to User",
    bodyHTML: bodyHTML,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-aurora" data-action="confirm-admin-subscribe" data-userid="${userId}">Confirm & Assign</button>
    `,
  });
}

async function subscribeToPlanAdmin(planId, userId) {
  try {
    await AdminService.subscribe(planId, userId);
    showToast("Subscription updated successfully.", "success");
    closeModal();
    await loadAdminUsers();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function toggleUserStatus(userId, currentlyActive, btnEl) {
  const next = !currentlyActive;
  btnEl.disabled = true;
  try {
    await AdminService.setUserStatus(userId, next);
    btnEl.dataset.active = next.toString();
    btnEl.textContent = next ? "Suspend" : "Activate";
    btnEl.classList.toggle("btn-danger", next);
    btnEl.classList.toggle("btn-ghost", !next);
    showToast(next ? "User reactivated." : "User suspended.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.disabled = false;
  }
}

async function openAdminUserProjectsModal(userId, userName) {
  openModal({
    title: `${userName}'s projects`,
    wide: true,
    bodyHTML: `<div id="admin-user-projects-body"><div class="skeleton h-20 w-full"></div></div>`,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
  });
  try {
    const projects = await AdminService.getUserProjects(userId);
    $("#admin-user-projects-body").innerHTML = projects.length
      ? `<div class="space-y-2">${projects
          .map(
            (p) => `
      <div class="glass glass-card p-3 flex items-center justify-between gap-3">
        <div class="min-w-0"><p class="text-sm font-semibold truncate">${escapeHtml(p.name)}</p><p class="text-tertiary text-xs font-mono truncate">${(p.restrictedDomains || []).join(", ") || "No domain restriction"}</p></div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="status-pill ${p.isActive ? "is-success" : "is-warning"}">${p.isActive ? "Active" : "Paused"}</span>
          <button class="btn btn-ghost btn-sm" data-action="view-admin-project" data-id="${p.id}">Templates / Services</button>
        </div>
      </div>
    `,
          )
          .join("")}</div>`
      : `<p class="text-tertiary text-sm">This user has no projects.</p>`;
  } catch (err) {
    $("#admin-user-projects-body").innerHTML =
      `<p class="text-secondary text-sm">${escapeHtml(friendlyError(err))}</p>`;
  }
}

async function openAdminProjectDrilldown(projectId) {
  openModal({
    title: "Project contents",
    wide: true,
    bodyHTML: `<div id="admin-drilldown-body"><div class="skeleton h-20 w-full"></div></div>`,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
  });

  try {
    const [templates, services] = await Promise.all([
      AdminService.listProjectTemplates(projectId).catch(() => []),
      AdminService.listProjectServices(projectId).catch(() => []),
    ]);

    $("#admin-drilldown-body").innerHTML = `
      <h4 class="font-display font-semibold text-sm mb-3 text-secondary">Templates (${templates.length})</h4>
      ${
        templates.length
          ? `<div class="space-y-2 mb-6">
              ${templates
                .map(
                  (t) => `
                <div class="glass glass-card p-3 text-sm flex items-center justify-between cursor-pointer hover:bg-white/5 hover:border-white/20 transition group" data-action="view-admin-template" data-id="${t.id}">
                  <span class="group-hover:text-aurora transition pointer-events-none">${escapeHtml(t.name)}</span>
                  <span class="text-tertiary text-xs pointer-events-none">${escapeHtml(t.subject || "")}</span>
                </div>
              `,
                )
                .join("")}
            </div>`
          : `<p class="text-tertiary text-xs mb-6">None.</p>`
      }
      
      <h4 class="font-display font-semibold text-sm mb-3 text-secondary">Services (${services.length})</h4>
      ${
        services.length
          ? `<div class="space-y-2">
              ${services
                .map(
                  (s) => `
                <div class="glass glass-card p-3 text-sm flex items-center justify-between cursor-pointer hover:bg-white/5 hover:border-white/20 transition group" data-action="view-admin-service" data-id="${s.id}">
                  <span class="group-hover:text-aurora transition pointer-events-none">${escapeHtml(s.fromName)} <span class="text-xs text-tertiary ml-1">[${escapeHtml(s.providerType)}]</span></span>
                  <span class="text-tertiary text-xs font-mono pointer-events-none">${escapeHtml(s.fromEmail || s.username || "")}</span>
                </div>
              `,
                )
                .join("")}
            </div>`
          : `<p class="text-tertiary text-xs">None.</p>`
      }
    `;
  } catch (err) {
    $("#admin-drilldown-body").innerHTML =
      `<p class="text-secondary text-sm">${escapeHtml(friendlyError(err))}</p>`;
  }
}

/* ============================================================
   PAGE: admin/banned.html
   ============================================================ */

async function initAdminBannedPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const res = await AdminService.listBanned(1);

    content.innerHTML = `
<div class="flex flex-wrap items-center justify-between gap-4 mb-6">
  
  <div class="flex flex-col gap-1">
    <h1 class="font-display text-2xl font-bold">Banned</h1>
    <p class="text-secondary text-sm">IP addresses and email addresses that are banned from using the system.</p>
  </div>

  <div class="flex items-center gap-2">
    ${browseSearchBarHTML("banned", "Search by IP or email...")}
    <button class="btn btn-aurora btn-sm" data-operation="submit" data-action="open-ban-modal">+ Add ban</button>
  </div>
  
</div>
      ${browseControlHTML(res.totalCount, "banned")}
      <div id="admin-browse-table"></div>
    `;
    await loadAdminBanned(1, res);
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminBanned(page = 1, res = null) {
  const term = $("#db-search").value.trim();
  if (term) {
    return searchDbBanned(page);
  }
  res = res || (await AdminService.listBanned(page));
  renderBannedTable(res);
}

function openBanModal(actionType, ipAddress = "") {
  let title = "";
  let bodyHTML = "";
  let submitText = "";
  let submitBtnClass = "btn-aurora";

  if (actionType === "submit") {
    title = "Ban an IP or email";
    submitText = "Apply Ban";
    bodyHTML = `
      <div class="space-y-4">
        <div>
          <label class="field-label">IP address or email</label>
          <input class="input-glass" id="ban-value" placeholder="203.0.113.7 or spammer@example.com" />
        </div>
        <div>
          <label class="field-label">Banned until</label>
          <input class="input-glass" id="ban-until" type="datetime-local" />
        </div>
        <div>
          <label class="field-label">Reason for ban</label>
          <input class="input-glass" id="ban-reason" placeholder="e.g., Suspicious activity, brute force..." required />
        </div>
      </div>
    `;
  } else if (actionType === "reduce") {
    title = "Reduce Ban Level";
    submitText = "Reduce Ban";
    bodyHTML = `
      <div class="space-y-4">
        <div class="text-secondary text-sm">
          You are reducing the ban level for:
          <br><strong class="text-primary font-mono">${escapeHtml(ipAddress)}</strong>
        </div>
        <div>
          <label class="field-label">Reason for reduction</label>
          <input class="input-glass" id="ban-reason" placeholder="e.g., User contacted support..." required />
        </div>
      </div>
    `;
  } else if (actionType === "delete") {
    title = "Remove Ban (Pardon)";
    submitText = "Pardon User";
    submitBtnClass = "btn-danger";
    bodyHTML = `
      <div class="space-y-4">
        <div class="text-secondary text-sm">
          You are about to completely remove the ban for:
          <br><strong class="text-primary font-mono">${escapeHtml(ipAddress)}</strong>
        </div>
        <div>
          <label class="field-label">Reason for pardoning</label>
          <input class="input-glass" id="ban-reason" placeholder="e.g., False positive, issue resolved..." required />
        </div>
      </div>
    `;
  }

  openModal({
    title: title,
    bodyHTML: bodyHTML,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn ${submitBtnClass}" data-action="${actionType}-ban" data-id="${escapeHtml(ipAddress)}">${submitText}</button>
    `,
  });
}

async function openBanDetailsModal(ipAddress) {
  const detailsArray = await AdminService.banDetails(ipAddress).catch(() => []);
  let tbodyHtml = "";

  if (detailsArray.length === 0) {
    tbodyHtml = `<tr><td colspan="5" class="text-center text-tertiary py-6">No violation details recorded.</td></tr>`;
  } else {
    tbodyHtml = detailsArray
      .map(
        (d) => `
      <tr class="border-b border-[var(--glass-border)] hover:bg-[var(--glass-surface)]">
        <td class="px-3 py-2 text-xs font-medium">${escapeHtml(d.actionType)}</td>
        <td class="px-3 py-2 text-xs text-center">
          <span class="status-pill ${d.violationWeight >= 5 ? "is-danger" : d.violationWeight >= 3 ? "is-warning" : "is-neutral"}">+${d.violationWeight}</span>
        </td>
        <td class="px-3 py-2 text-xs truncate max-w-[150px]" title="${escapeHtml(d.reason)}">${escapeHtml(d.reason)}</td>
        <td class="px-3 py-2 text-xs font-mono text-tertiary truncate max-w-[150px]" title="${escapeHtml(d.userAgent)}">${escapeHtml(d.userAgent)}</td>
        <td class="px-3 py-2 text-xs font-mono text-tertiary truncate max-w-[120px]" title="${escapeHtml(d.endpoint)}">${escapeHtml(d.endpoint)}</td>
        <td class="px-3 py-2 text-xs text-tertiary whitespace-nowrap">${formatDate(d.createdAt)}</td>
        <td class="px-3 py-2 text-xs font-mono text-tertiary">${escapeHtml(d.adminId || "N/A")}</td>
      </tr>
    `,
      )
      .join("");
  }

  const bodyHTML = `
    <div class="text-secondary text-sm mb-4">Incident logs for <span class="font-mono text-primary">${escapeHtml(ipAddress)}</span></div>
    <div class="overflow-x-auto w-full rounded-lg border border-[var(--glass-border)] max-h-[350px] overflow-y-auto">
      <table class="data-table w-full text-left whitespace-nowrap">
        <thead class="sticky top-0 bg-[var(--glass-surface)] shadow-md z-10">
          <tr>
            <th class="px-3 py-2 text-xs">Action</th>
            <th class="px-3 py-2 text-xs text-center">Weight</th>
            <th class="px-3 py-2 text-xs">Reason</th>
            <th class="px-3 py-2 text-xs">UserAgent</th>
            <th class="px-3 py-2 text-xs">Endpoint</th>
            <th class="px-3 py-2 text-xs">Time (UTC)</th>
            <th class="px-3 py-2 text-xs">AdminId</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHtml}
        </tbody>
      </table>
    </div>
  `;

  openModal({
    title: "Violation Details",
    bodyHTML: bodyHTML,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Close</button>
    `,
    wide: true,
  });
}

async function submitBan() {
  const value = $("#ban-value").value.trim();
  const reason = $("#ban-reason").value.trim();
  const bannedUntilRaw = $("#ban-until").value;
  if (!value) return showToast("Enter an IP or email.", "error");
  try {
    await AdminService.addBanned({
      ipAddress: value,
      reason: reason,
      bannedUntil: bannedUntilRaw
        ? new Date(bannedUntilRaw).toISOString()
        : undefined,
    });
    showToast("Ban added.", "success");
    closeModal();

    await loadAdminBanned();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function deleteBanned(id, reason) {
  const isConfirmed = await confirm("Remove this ban?");
  if (!isConfirmed) return;
  try {
    await AdminService.removeBanned({
      ipAddress: id,
      reason: reason,
    });
    showToast("Ban removed.", "success");
    closeModal();

    await loadAdminBanned();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function reduceBanned(id, reason) {
  try {
    const res = await AdminService.reduceBanned({
      ipAddress: id,
      reason: reason,
    });
    showToast(
      res.removed
        ? "Violation count reached zero — ban removed."
        : "Violation count reduced.",
      "success",
    );
    closeModal();

    await loadAdminBanned();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   PAGE: admin/projects.html
   ============================================================ */
async function initAdminProjectsPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const res = await AdminService.listProjects(1);
    content.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex flex-col gap-2 mb-6">
      <h1 class="font-display text-2xl font-bold mb-1">Projects</h1>
      <p class="text-secondary text-sm mb-6">Every project across every account.</p>
      </div>

        ${browseSearchBarHTML("projects", "Search by ID or name...")}
      </div>
      ${browseControlHTML(res.totalCount, "projects")}
      <div id="admin-browse-table"></div>
    `;
    await loadAdminProjects(1, res);
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminProjects(page = 1, res = null) {
  const term = $("#db-search").value.trim();
  if (term) {
    return searchDbProjects(page);
  }
  res = res || (await AdminService.listProjects(page));
  renderProjectsTable(res);
}

/* ============================================================
    PAGE: admin/templates.html
    ============================================================ */

async function initAdminTemplatesPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const res = await AdminService.listTemplates(1);
    content.innerHTML = `
     <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex flex-col gap-2 mb-6">
      <h1 class="font-display text-2xl font-bold mb-1">Templates</h1>
      <p class="text-secondary text-sm mb-6">Every template across every project.</p>
      </div>

        ${browseSearchBarHTML("templates", "Search by ID or name...")}
      </div>
      ${browseControlHTML(res.totalCount, "templates")}
      <div id="admin-browse-table"></div>
    `;
    await loadAdminTemplates(1, res);
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminTemplates(page = 1, res = null) {
  const term = $("#db-search").value.trim();
  if (term) {
    return searchDbTemplates(page);
  }
  res = res || (await AdminService.listTemplates(page));
  renderTemplatesTable(res);
}

async function openAdminTemplateDetail(id) {
  try {
    const t = await AdminService.getTemplate(id);
    openModal({
      title: escapeHtml(t.name || "Template Details"),
      bodyHTML: `
        <div class="space-y-3 text-sm">
          
          <!-- Basic Info -->
          <div class="glass glass-panel p-4 space-y-2">
            <div class="flex justify-between"><span class="text-tertiary">ID</span><span class="font-mono text-xs text-secondary">${escapeHtml(t.id || "—")}</span></div>
            <div class="flex justify-between"><span class="text-tertiary">Project ID</span><span class="font-mono text-xs text-secondary">${escapeHtml(t.projectId || "—")}</span></div>
            <div class="flex justify-between items-center"><span class="text-tertiary">Status</span><span class="status-pill ${t.isActive ? "is-success" : "is-warning"}">${t.isActive ? "Active" : "Paused"}</span></div>
          </div>

          <!-- Email Details -->
          <div class="glass glass-panel p-4 space-y-2">
            <div class="flex justify-between"><span class="text-tertiary">Subject</span><span class="text-right truncate ml-4" title="${escapeHtml(t.subject || "")}">${escapeHtml(t.subject || "—")}</span></div>
            <div class="flex justify-between"><span class="text-tertiary">To</span><span class="font-mono text-aurora">${escapeHtml(t.toEmail || "—")}</span></div>
            ${t.replyTo ? `<div class="flex justify-between"><span class="text-tertiary">Reply-To</span><span class="font-mono">${escapeHtml(t.replyTo)}</span></div>` : ""}
            ${t.cc ? `<div class="flex justify-between"><span class="text-tertiary">CC</span><span class="font-mono text-xs">${escapeHtml(t.cc)}</span></div>` : ""}
            ${t.bcc ? `<div class="flex justify-between"><span class="text-tertiary">BCC</span><span class="font-mono text-xs">${escapeHtml(t.bcc)}</span></div>` : ""}
          </div>

          <!-- Settings & Security -->
          <div class="glass glass-panel p-4 space-y-2">
            <div class="flex justify-between"><span class="text-tertiary">save in history</span>
              <span>${t.doSaveInHistory ? "Yes" : "No"}</span>
            </div>
            <div class="flex justify-between"><span class="text-tertiary">Auto-Reply</span><span>${t.enableAutoReply ? `Yes (ID: ${escapeHtml(t.autoReplyTemplateId || "—")})` : "Off"}</span></div>
            <div class="flex justify-between"><span class="text-tertiary">reCAPTCHA v2</span><span>${t.enableRecaptchaV2 ? "Enabled" : "Off"}</span></div>
            <div class="flex justify-between"><span class="text-tertiary">App Check</span><span>${t.enableAppCheck ? (t.issuer ? `Enabled <span class="text-xs text-secondary">(${escapeHtml(t.issuer)})</span>` : "Enabled (Any Issuer)") : "Off"}</span></div>
          </div>
          
        </div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
    });
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
    PAGE: admin/services.html
   ============================================================ */

async function initAdminServicesPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const res = await AdminService.listServices(1);
    content.innerHTML = `
          <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex flex-col gap-2 mb-6">
      <h1 class="font-display text-2xl font-bold mb-1">Services</h1>
      <p class="text-secondary text-sm mb-6">Every connected sending service across every project.</p>
       </div>

        ${browseSearchBarHTML("services", "Search by ID, From Email or Provider Type...")}
      </div>
      ${browseControlHTML(res.totalCount, "services")}
      <div id="admin-browse-table"></div>
    `;
    await loadAdminServices(1, res);
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminServices(page = 1, res = null) {
  const term = $("#db-search").value.trim();
  if (term) {
    return searchDbServices(page);
  }
  res = res || (await AdminService.listServices(page));
  renderServicesTable(res);
}

async function openAdminServiceDetail(id) {
  try {
    const s = await AdminService.getService(id);

    // بناء الحقول الخاصة بنوع الخدمة ديناميكياً
    let specificHTML = "";
    if (s.providerType === "ApiKey") {
      specificHTML = `
        <div class="flex justify-between"><span class="text-tertiary">Provider Name</span><span class="font-semibold">${escapeHtml(s.providerName || "—")}</span></div>
      `;
    } else if (s.providerType === "AppPassword") {
      specificHTML = `
        <div class="flex justify-between"><span class="text-tertiary">SMTP Host</span><span class="font-mono">${escapeHtml(s.smtpHost || "—")}</span></div>
        <div class="flex justify-between"><span class="text-tertiary">SMTP Port</span><span class="font-mono">${escapeHtml(String(s.smtpPort || "—"))}</span></div>
        <div class="flex justify-between"><span class="text-tertiary">Username</span><span class="font-mono">${escapeHtml(s.username || "—")}</span></div>
      `;
    } else if (s.providerType === "OAuth") {
      // تنسيق التاريخ إذا كان موجوداً
      const expiryText = s.tokenExpiry
        ? new Date(s.tokenExpiry).toLocaleString()
        : "—";
      specificHTML = `
        <div class="flex justify-between"><span class="text-tertiary">OAuth Provider</span><span class="font-semibold">${escapeHtml(s.oauthProvider || "—")}</span></div>
        <div class="flex justify-between"><span class="text-tertiary">Token Expiry</span><span class="font-mono text-xs">${expiryText}</span></div>
      `;
    }

    openModal({
      title: `${s.providerType} Service`,
      bodyHTML: `
        <div class="space-y-3 text-sm">
          
          <!-- General Info -->
          <div class="glass glass-panel p-4 space-y-2">
            <div class="flex justify-between items-start gap-2">
                <span class="text-tertiary whitespace-nowrap mt-0.5">ID</span>
                <span class="font-mono text-xs text-secondary text-right break-all">${escapeHtml(s.id || "—")}</span>
            </div>
            
            <!-- إضافة User ID هنا -->
            <div class="flex justify-between items-start gap-2">
                <span class="text-tertiary whitespace-nowrap mt-0.5">User ID</span>
                <span class="font-mono text-xs text-secondary text-right break-all">${escapeHtml(s.userId || "—")}</span>
            </div>
            
            <div class="flex justify-between items-center pt-1 border-t border-white/10 mt-2">
                <span class="text-tertiary">Status</span>
                <span class="status-pill ${s.isActive ? "is-success" : "is-warning"}">${s.isActive ? "Active" : "Paused"}</span>
            </div>
          </div>
          
          <!-- Sender Details -->
          <div class="glass glass-panel p-4 space-y-2">
            <div class="flex justify-between"><span class="text-tertiary">From Name</span><span>${escapeHtml(s.fromName || "—")}</span></div>
            <div class="flex justify-between"><span class="text-tertiary">From Email</span><span class="font-mono text-aurora text-right break-all ml-4">${escapeHtml(s.fromEmail || "—")}</span></div>
          </div>
          
          <!-- Provider Specific Settings -->
          <div class="glass glass-panel p-4 space-y-2 border border-white/10">
            <p class="text-xs text-tertiary uppercase tracking-wider mb-2 border-b border-white/5 pb-1">${s.providerType} Details</p>
            ${specificHTML}
          </div>

        </div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
    });
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
    PAGE: admin/logs.html
   ============================================================ */

async function initAdminLogsPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const res = await AdminService.listLogs(1);

    content.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div class="flex flex-col gap-2 mb-6">
      <h1 class="font-display text-2xl font-bold mb-1">System logs</h1>
      <p class="text-secondary text-sm mb-6">Recent activity across the whole system.</p>
      </div>

        ${browseSearchBarHTML("logs", "Search by any field...")}
      </div>
      ${browseControlHTML(res.totalCount, "logs")}
      <div id="admin-browse-table"></div>
    `;
    await loadAdminLogs(1, res);
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminLogs(page = 1, res = null) {
  const term = $("#db-search").value.trim();
  if (term) {
    return searchDbLogs(page);
  }
  res = res || (await AdminService.listLogs(page));
  renderLogsTable(res);
}

/* ============================================================
   PAGE: admin/plans.html
   ============================================================ */
async function renderPlansGrid() {
  const plans = await BillingService.getPlans();
  return `
    <div class="grid sm:grid-cols-3 gap-5">
      ${plans
        .map(
          (p) => `
        <div class="glass glass-card p-6">
          <p class="font-display font-semibold mb-1">${escapeHtml(p.name)}</p>
          <p class="text-2xl font-display font-bold mb-3">$${escapeHtml(p.monthlyPrice)}<span class="text-xs text-tertiary font-body">/mo</span></p>
          <ul class="text-xs text-secondary space-y-1 mb-5">
            <li>${p.maxProjects} projects · ${p.maxServices} services · ${p.maxTemplates} templates</li>
            <li>${p.maxEmailsPerMonth.toLocaleString()} emails/mo · ${p.maxAttachmentsPerTemplate} attachment${p.maxAttachmentsPerTemplate === 1 ? "" : "s"}/template</li>
            <li>${[p.canUseGoogleSheets && "Sheets", p.canUseAI && "AI", p.canUseTelegramBot && "Telegram"].filter(Boolean).join(", ") || "No add-ons"}</li>
          </ul>
          <button class="btn btn-ghost btn-sm w-full justify-center" data-action="edit-plan" data-plan='${escapeHtml(JSON.stringify(p))}'>Edit</button>
        </div>`,
        )
        .join("")}
    </div>
  `;
}

async function initAdminPlansPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    content.innerHTML = `
      <div class="flex items-center justify-between mb-6"><h1 class="font-display text-2xl font-bold">Plans</h1><button class="btn btn-aurora btn-sm" data-action="open-plan-modal">+ New plan</button></div>
      <div id="plans-grid">${await renderPlansGrid()}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function planFormFields(p = {}) {
  return `
    <input type="hidden" id="plan-id" value="${p.id || ""}" />
    <div class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Name</label><input class="input-glass" id="plan-name" value="${escapeHtml(p.name || "")}" /></div>
      <div><label class="field-label">Monthly Price ($/mo)</label><input class="input-glass" id="plan-price" type="number" min="0" value="${p.monthlyPrice ?? 0}" /></div>
    </div>
    <div class="grid grid-cols-3 gap-3 mt-4">
      <div><label class="field-label">Max projects</label><input class="input-glass" id="plan-max-projects" type="number" min="1" value="${p.maxProjects ?? 1}" /></div>
      <div><label class="field-label">Max services</label><input class="input-glass" id="plan-max-services" type="number" min="1" value="${p.maxServices ?? 1}" /></div>
      <div><label class="field-label">Max templates</label><input class="input-glass" id="plan-max-templates" type="number" min="1" value="${p.maxTemplates ?? 1}" /></div>
    </div>
    <div class="grid grid-cols-2 gap-3 mt-4">
      <div><label class="field-label">Max emails / month</label><input class="input-glass" id="plan-max-emails" type="number" min="0" value="${p.maxEmailsPerMonth ?? 0}" /></div>
      <div><label class="field-label">Max attachments / template</label><input class="input-glass" id="plan-max-attachments" type="number" min="0" value="${p.maxAttachmentsPerTemplate ?? 0}" /></div>
    </div>
    <div class="flex items-center gap-6 mt-5">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-sheets" ${p.canUseGoogleSheets ? "checked" : ""}/> Google Sheets</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-ai" ${p.canUseAI ? "checked" : ""}/> AI summaries</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-telegram" ${p.canUseTelegramBot ? "checked" : ""}/> Telegram Bot</label>
    </div>
  `;
}

function openPlanModal(plan = null) {
  openModal({
    title: plan ? `Edit ${plan.name}` : "New plan",
    bodyHTML: `<div class="space-y-1">${planFormFields(plan || {})}</div>`,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-plan">Save plan</button>`,
  });
}

async function submitPlan() {
  const id = $("#plan-id").value || undefined;
  try {
    await AdminService.createOrUpdatePlan({
      id,
      name: $("#plan-name").value.trim(),
      monthlyPrice: Number($("#plan-price").value) || 0,
      maxProjects: Number($("#plan-max-projects").value) || 1,
      maxServices: Number($("#plan-max-services").value) || 1,
      maxTemplates: Number($("#plan-max-templates").value) || 1,
      maxEmailsPerMonth: Number($("#plan-max-emails").value) || 0,
      maxAttachmentsPerTemplate: Number($("#plan-max-attachments").value) || 0,
      canUseGoogleSheets: $("#plan-sheets").checked,
      canUseAI: $("#plan-ai").checked,
      canUseTelegramBot: $("#plan-telegram").checked,
    });
    showToast(id ? "Plan updated." : "Plan created.", "success");
    closeModal();
    $("#plans-grid").innerHTML = await renderPlansGrid();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   Event delegation — clicks
   ============================================================ */
document.addEventListener("click", async (e) => {
  if (e.target.id === "modal-root") return closeModal();

  const target = e.target.closest("[data-action]");
  if (!target) return;
  const a = target.dataset.action;

  switch (a) {
    case "logout":
      return handleLogout();
    case "forgot-password":
      return handleForgotPassword();
    case "submit-forgot-password":
      return submitForgotPassword();

    case "open-project-modal":
      return openProjectModal();
    case "submit-project":
      return submitProject();
    case "delete-project":
      return deleteProjectAndRedirect(target.dataset.id);
    case "set-project-tab": {
      const id = target.dataset.projectId;
      const tab = target.dataset.tab;

      const url = new URL(location.href);
      url.searchParams.set("id", id);
      url.searchParams.set("tab", tab);
      history.pushState({}, "", url);

      const project = JSON.parse(target.dataset.project);
      const linkedServices = JSON.parse(target.dataset.linkedServices);
      const integrations = JSON.parse(target.dataset.integrations);

      let panel = "";
      if (tab === "keys") panel = renderKeysTab(project);
      else if (tab === "services")
        panel = renderServicesTab(id, linkedServices);
      else if (tab === "integrations")
        panel = renderIntegrationsTab(id, integrations);
      else if (tab === "settings") panel = renderSettingsTab(project);

      $("#project-tab-panel").innerHTML = panel;
      break;
    }
    case "regenerate-keys":
      return regenerateKeys(target.dataset.id);

    case "open-service-modal":
      return openServiceModal();
    case "pick-provider":
      return renderProviderForm(target.dataset.type);
    case "save-service":
      return saveService(target.dataset.id, target.dataset.type);
    case "trigger-oauth-flow":
      return triggerOAuthFlow();
    case "open-link-service-modal":
      return openLinkServiceModal(target.dataset.projectId);
    case "submit-link-service":
      return submitLinkService(target.dataset.projectId);
    case "unlink-service":
      return unlinkService(target.dataset.projectId, target.dataset.serviceId);
    case "edit-service":
      return openServiceModal(JSON.parse(target.dataset.service));
    case "delete-service":
      return deleteService(target.dataset.id);
    case "toggle-service":
      return toggleServiceStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );
    case "open-integration-modal":
      return openIntegrationModal(target.dataset.projectId);
    case "submit-integration":
      return submitIntegration(target.dataset.projectId);
    case "toggle-integration":
      toggleIntegrationStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );
      break;
    case "edit-integration":
      openEditIntegrationModal(
        target.dataset.id,
        target.dataset.projectId,
        target.dataset.integration,
      );
      break;
    case "submit-edit-integration":
      submitEditIntegration(
        target.dataset.id,
        target.dataset.projectId,
        target,
      );
      break;
    case "delete-integration":
      return deleteIntegration(target.dataset.id, target.dataset.projectId);

    case "set-template-tab": {
      const tabId = target.dataset.tab;
      if (!tabId) return;

      const url = new URL(location.href);
      url.searchParams.set("tab", tabId);
      history.pushState({}, "", url);

      document
        .querySelectorAll('[data-action="set-template-tab"]')
        .forEach((btn) => {
          btn.classList.toggle("is-active", btn.dataset.tab === tabId);
        });

      document
        .querySelectorAll(".editor-section")
        .forEach((el) => el.classList.add("hidden"));
      document.getElementById("tab-" + tabId)?.classList.remove("hidden");
      break;
    }
    case "delete-template":
      return deleteTemplate(target.dataset.id);
    case "toggle-template-status":
      return toggleTemplateStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );
    case "pick-attachment":
      const fileInput = $("#attachment-input");
      if (!fileInput) return;
      fileInput.dataset.maxAttachments = target.dataset.maxAttachments;
      return fileInput.click();
    case "remove-attachment":
      return removeAttachment(
        target.dataset.attachmentId,
        target.dataset.maxAttachments,
      );
    case "open-snippet-modal":
      return await openCodeSnippetModal(
        JSON.parse(decodeURIComponent(target.dataset.template)),
      );
    case "test-now":
      return openTestModal(
        JSON.parse(decodeURIComponent(target.dataset.template)),
        JSON.parse(decodeURIComponent(target.dataset.project)),
      );
    case "switch-snippet-tab": {
      $$(".snippet-tab").forEach((btn) =>
        btn.classList.toggle("is-active", btn === target),
      );
      $$("[data-snippet-panel]").forEach((panel) =>
        panel.classList.toggle(
          "hidden",
          panel.dataset.snippetPanel !== target.dataset.lang,
        ),
      );
      return;
    }
    case "copy-text":
      return copyToClipboard(target.dataset.copy, target);
    case "toggle-reveal-key": {
      const el = $("#keys-private");
      const revealed = el.dataset.revealed === "true";
      el.textContent = revealed
        ? "•".repeat(Math.max(12, el.dataset.value.length))
        : el.dataset.value;
      el.dataset.revealed = String(!revealed);
      target.innerHTML = revealed
        ? `${ICONS.eye} Show`
        : `${ICONS.eyeOff} Hide`;
      return;
    }
    case "toggle-password": {
      const container = target.closest(".relative");
      if (!container) return;

      const passInput = container.querySelector("input");
      if (passInput && passInput.type === "password") {
        passInput.type = "text";
        target.innerHTML = `${ICONS.eyeOff}`;
      } else if (passInput) {
        passInput.type = "password";
        target.innerHTML = `${ICONS.eye}`;
      }
      return;
    }

    case "toggle-project-status":
      return toggleProjectStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );

    case "delete-account":
      return deleteAccount();

    case "view-submission":
      return viewSubmission(target.dataset.id, target.dataset.projectId);
    case "retry-submission":
      return retrySubmission(target.dataset.id, target.dataset.projectId);

    case "subscribe-plan":
      const planId = target.dataset.id;
      const planName = target.dataset.name;

      if (planName && planName.trim().toLowerCase() === "free") {
        return openFreePlanDowngradeModal(planId, planName);
      } else {
        return openContactAdminModal(planName);
      }
    case "confirm-downgrade":
      closeModal();
      return await subscribeToPlan(target.dataset.id);
    case "view-subscription-details":
      return openSubscriptionDetailsModal();

    case "toggle-user-status":
      return toggleUserStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );
    case "admin-view-user":
      return openAdminViewUserModal(target.dataset.id);
    case "admin-open-subscribe":
      return openAdminSubscribeModal(target.dataset.id, target.dataset.name);
    case "confirm-admin-subscribe": {
      const planId = $("#admin-target-plan-id")?.value;
      const userId = target.dataset.userid;
      if (planId && userId) {
        return await subscribeToPlanAdmin(planId, userId);
      }

      break;
    }
    case "view-user-projects":
      return openAdminUserProjectsModal(target.dataset.id, target.dataset.name);
    case "view-admin-project":
      return openAdminProjectDrilldown(target.dataset.id);
    case "view-admin-template":
      return openAdminTemplateDetail(target.dataset.id);
    case "view-admin-service":
      return openAdminServiceDetail(target.dataset.id);

    case "view-ban-details":
      return openBanDetailsModal(target.dataset.id);
    case "open-ban-modal":
      return openBanModal(target.dataset.operation, target.dataset.id);
    case "submit-ban":
      return submitBan();
    case "delete-ban": {
      const reason = $("#ban-reason").value.trim();
      return deleteBanned(target.dataset.id, reason);
    }
    case "reduce-ban": {
      const reason = $("#ban-reason").value.trim();
      return reduceBanned(target.dataset.id, reason);
    }

    case "open-plan-modal":
      return openPlanModal();
    case "edit-plan":
      return openPlanModal(JSON.parse(target.dataset.plan));
    case "submit-plan":
      return submitPlan();

    case "pagination-jump-btn": {
      const input = document.getElementById("pagination-custom-input");
      let page = parseInt(input?.value);
      const maxPage =
        parseInt(document.getElementById("pagination-total")?.textContent) || 1;
      if (isNaN(page)) return;
      if (page < 1) page = 1;
      if (page > maxPage) page = maxPage;
      document.getElementById("pagination-page").textContent = page; // تمرير رقم الصفحه
      input.value = "";
    }
    case "pagination-browse": {
      const scope = target.dataset.scope;
      const currentPage = getCurrentPage();
      const dir = Number(target.dataset.dir) || 0;
      const page = Math.max(1, currentPage + dir);
      if (scope === "history") {
        const historyContainer = document.getElementById("history-list");
        historyContainer.innerHTML = await historyListHTML(
          page,
          target.dataset.projectid,
        );
        return;
      }
      if (scope === "users") return loadAdminUsers(page);
      if (scope === "projects") return loadAdminProjects(page);
      if (scope === "templates") return loadAdminTemplates(page);
      if (scope === "services") return loadAdminServices(page);
      if (scope === "banned") return lodAdminBanned(page);
      if (scope === "logs") return loadAdminLogs(page);
      return;
    }

    case "confirm-ok":
      if (window.__confirmResolver) {
        window.__confirmResolver(true);
        window.__confirmResolver = null;
      }
      closeModal();
      break;

    case "confirm-cancel":
    case "close-modal":
      if (window.__confirmResolver) {
        window.__confirmResolver(false);
        window.__confirmResolver = null;
      }
      closeModal();
      break;
    case "close-beta-banner": {
      // 1. إخفاء الشريط من الشاشة بأنيميشن بسيط أو بإخفائه فوراً
      const banner = document.getElementById("beta-banner");
      if (banner) {
        banner.style.display = "none";
      }

      // 2. تخزين الاختيار في الجلسة بحيث لا يظهر مجدداً إذا تنقل بين الصفحات
      sessionStorage.setItem("hideBetaBanner", "true");
      break;
    }

    case "unlock-card": {
      const cardId = target.dataset.id;
      if (cardId.startsWith("p")) {
        // project
        try {
          await ProjectService.unlockProject(cardId);
          showToast("Project unlocked successfully.", "success");
          target
            .closest(".with-unlock-badge")
            ?.classList.remove("with-unlock-badge");
          target.remove(); // إزالة الزر بعد النجاح
          decreaseUnlockCount("projects");
        } catch (error) {
          showToast(friendlyError(error), "error");
        }
      } else if (cardId.startsWith("t")) {
        // template
        try {
          await TemplateService.unlockTemplate(cardId);
          showToast("Template unlocked successfully.", "success");
          target
            .closest(".with-unlock-badge")
            ?.classList.remove("with-unlock-badge");
          target.remove(); // إزالة الزر بعد النجاح
          decreaseUnlockCount("templates");
        } catch (error) {
          showToast(friendlyError(error), "error");
        }
      } else if (cardId.startsWith("s")) {
        // service
        try {
          await ServiceService.unlockService(cardId);
          showToast("Service unlocked successfully.", "success");
          target
            .closest(".with-unlock-badge")
            ?.classList.remove("with-unlock-badge");
          target.remove(); // إزالة الزر بعد النجاح
          decreaseUnlockCount("services");
        } catch (error) {
          showToast(friendlyError(error), "error");
        }
      } else {
        console.assert(false, "Unknown card type for unlocking: " + cardId);
      }
    }

    case "close-toc": {
      const panel = document.getElementById(target.dataset.target);
      target.classList.add("hidden");
      panel.setAttribute("aria-expanded", "false");
    }
    case "toggle-toc": {
      const panel = document.getElementById(target.dataset.target);
      const isOpen = !panel.classList.contains("hidden");
      panel.classList.toggle("hidden");
      target.setAttribute("aria-expanded", String(!isOpen));
    }

    default:
      return;
  }
});

/* ============================================================
   Event delegation — change events
   ============================================================ */
document.addEventListener("change", (e) => {
  if (e.target.id === "project-picker") {
    const url = new URL(location.href);
    url.searchParams.set("project", e.target.value);
    location.href = url.toString();
  } else if (e.target.id === "analytics-project-picker") {
    const url = new URL(location.href);
    if (e.target.value) url.searchParams.set("project", e.target.value);
    else url.searchParams.delete("project");
    location.href = url.toString();
  } else if (e.target.id === "tpl-auto-reply") {
    $("#tpl-auto-reply-target-wrap")?.classList.toggle(
      "hidden",
      !e.target.checked,
    );
  } else if (e.target.id === "tpl-recaptcha") {
    $("#tpl-recaptcha-secret-key-wrap")?.classList.toggle(
      "hidden",
      !e.target.checked,
    );
  } else if (e.target.id === "attachment-input" && e.target.files[0]) {
    uploadAttachment(e.target.files[0], e.target.dataset.maxAttachments);
  } else if (e.target.id && e.target.id.startsWith("accessMode-")) {
    const projectId = e.target.dataset.projectId;
    const newValue = e.target.value;

    updateProjectAccessMode(projectId, newValue, e.target);
  }
});

/* ============================================================
   Event delegation — keydown & input events
   ============================================================ */
document.addEventListener("keydown", (e) => {
  if (e.target.id === "db-search" && e.key === "Enter") {
    e.preventDefault(); // لمنع أي سلوك افتراضي للـ Enter
    const scope = e.target.dataset.scope;
    if (scope === "users") return searchDbUsers();
    if (scope === "projects") return searchDbProjects();
    if (scope === "templates") return searchDbTemplates();
    if (scope === "services") return searchDbServices();
    if (scope === "banned") return searchDbBanned();
    if (scope === "logs") return searchDbLogs();
  }
});

/* ============================================================
   Event delegation — input events
   ============================================================ */
document.addEventListener("input", (e) => {
  if (e.target.id === "local-search") {
    clearTimeout(window.__LocalSearchDebounce);
    window.__LocalSearchDebounce = setTimeout(() => {
      filterTableRows(e.target.value.trim());
    }, 150);
  }
  if (e.target.id === "faq-search") {
    var search = e.target;
    var items = Array.prototype.slice.call(
      document.querySelectorAll("#faq-list .faq-item"),
    );
    var empty = document.getElementById("faq-empty");
    var count = document.getElementById("faq-count");
    var q = search.value.trim().toLowerCase();
    var shown = 0;
    items.forEach(function (item) {
      var match = !q || item.textContent.toLowerCase().indexOf(q) !== -1;
      item.classList.toggle("hidden", !match);
      if (match) shown++;
    });
    empty.classList.toggle("hidden", shown !== 0);
    count.textContent = q
      ? shown + " of " + items.length + " questions match"
      : "";
  }
});

/* ============================================================
   Event delegation — form submits
   ============================================================ */
document.addEventListener("submit", async (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === "form-login") return handleLogin(form);
  if (form.id === "form-register") return handleRegister(form);
  if (form.id === "form-reset-password") return handleResetPassword(form);
  if (form.id === "form-account") return saveAccount();
  if (form.id === "form-change-password") return changePassword(form);
  if (form.id === "form-project-settings")
    return saveProjectSettings(form.dataset.id);
  if (form.id === "form-template-editor")
    return submitTemplateEditor(
      form.dataset.projectId,
      form.dataset.templateId || null,
      form.dataset.maxAttachments,
    );
});

/* ============================================================
   Boot
   ============================================================ */
const PAGE_INIT = {
  dashboard: initDashboardPage,
  projects: initProjectsPage,
  templates: initTemplatesPage,
  services: initServicesPage,
  "template-editor": initTemplateEditorPage,
  history: initHistoryPage,
  analytics: initAnalyticsPage,
  billing: initBillingPage,
  account: initAccountPage,
  "admin-dashboard": initAdminDashboardPage,
  "admin-analytics": initAdminAnalyticsPage,
  "admin-users": initAdminUsersPage,
  "admin-projects": initAdminProjectsPage,
  "admin-templates": initAdminTemplatesPage,
  "admin-services": initAdminServicesPage,
  "admin-logs": initAdminLogsPage,
  "admin-banned": initAdminBannedPage,
  "admin-plans": initAdminPlansPage,
};

const PUBLIC_ONLY_PAGE_INIT = {
  login: initLoginPage,
  register: initRegisterPage,
  "reset-password": initResetPasswordPage,
  pricing: initPricingPage,
  features: initFeaturesPage,
  docs: initDocsPage,
  "api-reference": initApiReferencePage,
  landing: initLandingPage,
  support: initSupportPage,
  privacy: initPrivacyPage,
  terms: initTermsPage,
};

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;

  if (PUBLIC_ONLY_PAGE_INIT[page]) {
    renderNavbar(null);
    renderFooter(true);
    await PUBLIC_ONLY_PAGE_INIT[page]();
    return;
  }

  const user = await mountAppShell(page);
  if (!user) return; // mountAppShell already redirected

  renderNavbar(user);
  renderFooter(false);

  const init = PAGE_INIT[page];
  if (init) await init(user);
});

/* ============================================================
   Custom confirm() replacement
   ============================================================ */

window.__confirmResolver = null;
window.confirm = function (htmlMessage) {
  return new Promise((resolve) => {
    // لو فيه confirm شغال بالفعل، نلغيه الأول
    if (window.__confirmResolver) {
      window.__confirmResolver(false);
    }

    // حفظ دالة الـ resolve عشان ننادي عليها لما المستخدم يضغط على الزرار
    window.__confirmResolver = resolve;

    const bodyHTML = `
      <div class="text-sm text-secondary">
        <p class="whitespace-pre-wrap">${htmlMessage}</p>
      </div>
    `;

    openModal({
      title: "Confirmation",
      bodyHTML: bodyHTML,
      footerHTML: `
        <button class="btn btn-ghost" data-action="confirm-cancel">Cancel</button>
        <button class="btn btn-aurora" data-action="confirm-ok">OK</button>
      `,
      wide: false,
    });
  });
};
