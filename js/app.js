/* ============================================================
   EMAILY — app.js
   Shared across every page. Each HTML file sets
   <body data-page="..."> and this file:
     1. figures out whether the page needs an authenticated
        (or admin) session and redirects if not,
     2. mounts the shared navbar/sidebar into #navbar-root /
        #sidebar-root when present,
     3. runs the init function for that specific page.
   All backend calls go through the services exported from
   api.js (which itself may be backed by mockDB.js).
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
  BASE_URL,
  tokenStore,
} from "./api.js";

/* ============================================================
   Path helpers — the admin/ folder is one level down, so every
   link and asset path has to account for that.
   ============================================================ */
const inAdmin = location.pathname.includes("/admin/");
const isSrc = location.pathname.includes("/src/");

const PAGE_URLS = {
  landing: "index.html",
  login: "src/login.html",
  register: "src/register.html",
  dashboard: "src/dashboard.html",
  projects: "src/projects.html",
  templates: "src/templates.html",
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
  const resolved = inAdmin
    ? path.startsWith("admin/")
      ? path.slice("admin/".length)
      : "../" + path
    : isSrc
      ? "../" + path
      : path;
  return resolved + query;
}

function assetPath(name) {
  return (inAdmin || isSrc ? "../assets/" : "assets/") + name;
}

function redirectTo(pageKey, query = "") {
  window.location.href = urlFor(pageKey, query);
}

/* ============================================================
   DOM & format helpers
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  el.className = `toast is-${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .25s ease";
    setTimeout(() => el.remove(), 250);
  }, 4000);
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
let currentUserCache = null;

function navbarInnerHTML(user, quota) {
  return `
    <div class="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <a href="${urlFor(inAdmin ? "admin-dashboard" : "dashboard")}" class="flex items-center gap-3">
          <img src="${assetPath("logo.png")}" alt="Emaily" class="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(139,92,246,0.55)]" />
          <span class="font-display font-bold text-lg tracking-tight">Emaily</span>
          ${inAdmin ? '<span class="admin-tag">ADMIN</span>' : ""}
        </a>
        ${quota ? `<span class="badge-pill hidden md:inline-flex" title="Resets on the 1st of next month"><span class="dot"></span>Remaining: ${quota.remaining.toLocaleString()} / ${quota.limit.toLocaleString()}</span>` : ""}
      </div>
      <div class="flex items-center gap-3">
        ${!inAdmin && isAdminRole(user) ? `<a href="${urlFor("admin-dashboard")}" class="btn btn-ghost btn-sm">Admin panel</a>` : ""}
        <span class="hidden sm:inline text-sm text-secondary font-mono">${escapeHtml(user.email)}</span>
        <button class="btn btn-icon btn-ghost" data-action="logout" title="Log out" aria-label="Log out">${ICONS.logout}</button>
      </div>
    </div>
  `;
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
  } catch {
    redirectTo("login", "?redirect=" + encodeURIComponent(currentPath()));
    return null;
  }

  if (inAdmin && !isAdminRole(user)) {
    showToast("Admin access required.", "error");
    redirectTo("dashboard");
    return null;
  }

  currentUserCache = user;
  const quota = !inAdmin
    ? await UserService.getQuota().catch(() => null)
    : null;

  const navRoot = $("#navbar-root");
  const sideRoot = $("#sidebar-root");
  if (navRoot) navRoot.innerHTML = navbarInnerHTML(user, quota);
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
  } catch {
    tokenStore.clear();
  }
}

/* ============================================================
   PAGE: login.html
   ============================================================ */
async function initLoginPage() {
  await redirectIfAuthed();
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
}

async function handleRegister(form) {
  const btn = $('button[type="submit"]', form);
  const errorEl = $('[data-error-for="register"]');
  errorEl.classList.add("hidden");
  setBtnLoading(btn, true, "Creating account…");
  try {
    await AuthService.register({
      name: $("#register-name").value.trim(),
      email: $("#register-email").value.trim(),
      password: $("#register-password").value,
    });
    showToast("Account created. Sign in to continue.", "success");
    redirectTo("login");
  } catch (err) {
    errorEl.textContent = friendlyError(err, "Could not create that account.");
    errorEl.classList.remove("hidden");
  } finally {
    setBtnLoading(btn, false, "Create account");
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
        <div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">Remaining quota</p><p class="font-display text-3xl font-bold">${escapeHtml(user.remainingQuota ?? "—")}</p></div>
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

function projectCard(p) {
  const isOn = p.isActive !== false;
  return `
    <div class="glass glass-card p-6">
      <div class="flex items-start justify-between mb-3 gap-3">
        <a href="${urlFor("projects", "?id=" + p.id)}" class="font-display font-semibold">${escapeHtml(p.name)}</a>
        ${toggleSwitchHTML({ isOn, action: "toggle-project-status", id: p.id })}
      </div>
      <p class="text-tertiary text-xs font-mono mb-4">${p.domains?.length ? escapeHtml(p.domains.join(", ")) : "No domain restriction"}</p>
      <div class="flex items-center justify-between">
        <p class="text-tertiary text-xs">Created ${formatDate(p.createdAt)}</p>
        <a href="${urlFor("projects", "?id=" + p.id)}" class="btn btn-ghost btn-sm">Open</a>
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
    content.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div><h1 class="font-display text-2xl font-bold">Projects</h1><p class="text-secondary text-sm">Each project has its own API keys, templates, and services.</p></div>
        <button class="btn btn-aurora btn-sm" data-action="open-project-modal">+ New project</button>
      </div>
      ${projects.length ? `<div class="grid sm:grid-cols-2 gap-4">${projects.map(projectCard).join("")}</div>` : emptyState("No projects yet", "Create your first project to get a public API key.", "Create project", () => $('[data-action="open-project-modal"]')?.click())}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
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
    await ProjectService.create({
      name,
      domains: domainsRaw
        ? domainsRaw
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : [],
    });
    showToast("Project created.", "success");
    closeModal();
    await renderProjectsList();
  } catch (err) {
    showToast(
      friendlyError(err, "Could not create project — check your plan limits."),
      "error",
    );
  }
}

async function deleteProjectAndRedirect(id) {
  if (!confirm("Delete this project? This cannot be undone.")) return;
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
    let panel = "";
    if (tab === "keys") panel = renderKeysTab(project);
    else if (tab === "services") panel = await renderServicesTab(id);
    else if (tab === "integrations") panel = await renderIntegrationsTab(id);
    else if (tab === "settings") panel = renderSettingsTab(project);

    const isOn = project.isActive !== false;
    content.innerHTML = `
      <a href="${urlFor("projects")}" class="btn btn-ghost btn-sm mb-5">← All projects</a>
      <div class="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 class="font-display text-2xl font-bold">${escapeHtml(project.name)}</h1>
          <p class="text-tertiary text-xs font-mono mt-1">${(project.domains || []).join(", ") || "No domain restriction"}</p>
        </div>
        <div class="toggle-row shrink-0">
          <span class="text-xs text-secondary">${isOn ? "Active" : "Paused"}</span>
          ${toggleSwitchHTML({ isOn, action: "toggle-project-status", id: project.id })}
        </div>
      </div>
      <div class="flex gap-1 mb-6 border-b" style="border-color: var(--glass-border)">
        ${PROJECT_TABS.map(([key, label]) => `<button class="tab-btn ${tab === key ? "is-active" : ""}" data-action="set-project-tab" data-project-id="${project.id}" data-tab="${key}">${label}</button>`).join("")}
      </div>
      <div id="project-tab-panel">${panel}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

/* Reusable pause/resume toggle switch — used for Projects, Templates, Services. */
function toggleSwitchHTML({ isOn, action, id, dataExtra = "" }) {
  return `
    <button type="button" class="toggle-switch ${isOn ? "is-on" : ""}" data-action="${action}" data-id="${id}" data-active="${isOn}" ${dataExtra}
      role="switch" aria-checked="${isOn}" aria-label="${isOn ? "Pause" : "Resume"}" title="${isOn ? "Active — click to pause" : "Paused — click to resume"}">
      <span class="toggle-knob"></span>
    </button>
  `;
}

function renderKeysTab(project) {
  return `
    <div class="glass glass-card p-6">
      <h3 class="font-display font-semibold mb-4">API keys</h3>
      <div class="space-y-4">
        <div>
          <p class="text-tertiary text-xs mb-1">Public key — used in <code class="font-mono">/api/submit/{key}</code></p>
          <div class="key-row">
            <p class="api-key-chip flex-1">${escapeHtml(project.publicApiKey || "—")}</p>
            <button type="button" class="copy-btn" data-action="copy-text" data-copy="${escapeHtml(project.publicApiKey || "")}">${ICONS.copy} Copy</button>
          </div>
        </div>
        <div>
          <p class="text-tertiary text-xs mb-1">Private key — server-to-server calls. Keep this out of client-side code.</p>
          <div class="key-row">
            <p class="api-key-chip flex-1" id="private-key-display" data-value="${escapeHtml(project.privateApiKey || "")}" data-revealed="false">${"•".repeat(Math.max(12, (project.privateApiKey || "").length))}</p>
            <button type="button" class="copy-btn" data-action="toggle-reveal-key">${ICONS.eye} Show</button>
            <button type="button" class="copy-btn" data-action="copy-text" data-copy="${escapeHtml(project.privateApiKey || "")}">${ICONS.copy} Copy</button>
          </div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm mt-5" data-action="regenerate-keys" data-id="${project.id}">Regenerate keys</button>
    </div>
  `;
}

function renderSettingsTab(project) {
  return `
    <div class="glass glass-card p-6 mb-6">
      <h3 class="font-display font-semibold mb-4">Project settings</h3>
      <form id="form-project-settings" data-id="${project.id}" class="space-y-4">
        <div><label class="field-label" for="settings-name">Name</label><input class="input-glass" id="settings-name" value="${escapeHtml(project.name)}" /></div>
        <div><label class="field-label" for="settings-domains">Allowed domains</label><input class="input-glass" id="settings-domains" value="${escapeHtml((project.domains || []).join(", "))}" /></div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
    <div class="glass glass-card p-6 mb-6">
      <h3 class="font-display font-semibold mb-1">API settings</h3>
      <p class="text-tertiary text-xs mb-5">Security behavior for requests hitting <code class="font-mono">/api/submit/{key}</code>.</p>
      <div class="space-y-5">
        <div class="toggle-row justify-between">
          <div class="pr-4">
            <p class="text-sm font-semibold mb-0.5">Allow EmailyAPI for non-browser applications</p>
            <p class="text-tertiary text-xs">Bypasses AppCheck and reCAPTCHA automatically so a backend (C#, Python, etc.) can call this project directly without a browser.</p>
          </div>
          ${toggleSwitchHTML({ isOn: project.allowNonBrowserApps, action: "toggle-project-flag", id: project.id, dataExtra: 'data-flag="allowNonBrowserApps"' })}
        </div>
        <div class="toggle-row justify-between">
          <div class="pr-4">
            <p class="text-sm font-semibold mb-0.5">Use Private Key (recommended)</p>
            <p class="text-tertiary text-xs">Enforces high security — no request is accepted from any backend unless it includes this project's Private Key.</p>
          </div>
          ${toggleSwitchHTML({ isOn: project.requirePrivateKey, action: "toggle-project-flag", id: project.id, dataExtra: 'data-flag="requirePrivateKey"' })}
        </div>
      </div>
    </div>
    <div class="glass glass-card p-6" style="border-color: rgba(248,113,113,0.25)">
      <h3 class="font-display font-semibold mb-2" style="color: var(--danger)">Danger zone</h3>
      <p class="text-secondary text-sm mb-4">Deleting a project is permanent — it disappears from your dashboard immediately and stops accepting submissions. (To temporarily stop submissions without deleting anything, use the pause toggle above instead.)</p>
      <button class="btn btn-danger btn-sm" data-action="delete-project" data-id="${project.id}">Delete project</button>
    </div>
  `;
}

async function saveProjectSettings(projectId) {
  const domainsRaw = $("#settings-domains").value.trim();
  try {
    await ProjectService.update(projectId, {
      name: $("#settings-name").value.trim(),
      domains: domainsRaw
        ? domainsRaw
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : [],
    });
    showToast("Project updated.", "success");
    await renderProjectDetail(projectId, "settings");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function toggleProjectFlag(id, flagName, currentValue, btnEl) {
  const next = !currentValue;
  btnEl.classList.add("is-busy");
  try {
    await ProjectService.update(id, { [flagName]: next });
    btnEl.classList.toggle("is-on", next);
    btnEl.dataset.active = String(next);
    showToast("Setting updated.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btnEl.classList.remove("is-busy");
  }
}

async function regenerateKeys(projectId) {
  if (
    !confirm(
      "Regenerate API keys? Anything using the old keys will stop working immediately.",
    )
  )
    return;
  try {
    await ProjectService.regenerateKeys(projectId);
    showToast("Keys regenerated.", "success");
    await renderProjectDetail(projectId, "keys");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function renderServicesTab(projectId) {
  const services = await ServiceService.list(projectId).catch(() => []);
  return `
    <div class="flex justify-end mb-4"><button class="btn btn-aurora btn-sm" data-action="open-service-modal" data-project-id="${projectId}">+ Add service</button></div>
    ${
      services.length
        ? `<div class="space-y-3">${services
            .map(
              (s) => `
      <div class="glass glass-card p-5 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-0.5"><span class="status-pill is-neutral">${escapeHtml(s.provider)}</span><p class="font-semibold text-sm truncate">${escapeHtml(s.fromName || s.username || "Untitled")}</p></div>
          <p class="text-tertiary text-xs font-mono truncate">${escapeHtml(s.fromEmail || s.username || "")} ${s.host ? "· " + escapeHtml(s.host) : ""}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${toggleSwitchHTML({ isOn: s.isActive !== false, action: "toggle-service-status", id: s.id, dataExtra: `data-project-id="${projectId}"` })}
          <button class="btn btn-icon btn-ghost" data-action="edit-service" data-id="${s.id}" data-project-id="${projectId}" data-service='${escapeHtml(JSON.stringify(s))}' aria-label="Edit service">${ICONS.pencil}</button>
          <button class="btn btn-icon btn-danger" data-action="delete-service" data-id="${s.id}" data-project-id="${projectId}" aria-label="Remove service">${ICONS.trash}</button>
        </div>
      </div>`,
            )
            .join("")}</div>`
        : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No sending services</p><p class="text-secondary text-sm">Connect a service so Emaily can deliver mail for this project.</p></div>`
    }
  `;
}

/* ============================================================
   Add-service flow: provider picker -> provider-specific form.
   Editing an existing service skips the picker and opens its
   provider's form directly.
   ============================================================ */
const SERVICE_PROVIDERS = [
  ["SMTP", "Custom Domain (SMTP)", "Host, port, and an app password"],
  ["Gmail", "Gmail", "Connect a Google account via OAuth"],
  ["SendGrid", "SendGrid", "API key based sending"],
  ["Mailgun", "Mailgun", "API key based sending"],
];

function openServiceModal(projectId, service = null) {
  if (service)
    return renderServiceProviderForm(
      projectId,
      service.provider || "SMTP",
      service,
    );
  openModal({
    title: "Add a sending service",
    wide: true,
    bodyHTML: `
      <p class="text-secondary text-sm mb-4">Choose how Emaily should send mail for this project.</p>
      <div class="grid sm:grid-cols-2 gap-3">
        ${SERVICE_PROVIDERS.map(
          ([key, label, desc]) => `
          <button type="button" class="glass glass-card p-4 text-left" data-action="pick-service-provider" data-project-id="${projectId}" data-provider="${key}">
            <p class="font-semibold text-sm mb-1">${label}</p>
            <p class="text-tertiary text-xs">${desc}</p>
          </button>
        `,
        ).join("")}
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button>`,
  });
}

function renderServiceProviderForm(projectId, provider, service = null) {
  const s = service || {};
  let bodyHTML;
  if (provider === "SMTP") bodyHTML = smtpFormHTML(s);
  else if (provider === "Gmail") bodyHTML = gmailOAuthFormHTML(s);
  else bodyHTML = apiKeyFormHTML(provider, s);

  openModal({
    title: service ? `Edit ${provider} service` : `Connect ${provider}`,
    wide: true,
    bodyHTML: `
      ${!service ? `<button type="button" class="btn btn-ghost btn-sm mb-4" data-action="open-service-modal" data-project-id="${projectId}">← Choose a different provider</button>` : ""}
      ${bodyHTML}
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-service" data-project-id="${projectId}" data-service-id="${s.id || ""}" data-provider="${provider}">${service ? "Save changes" : provider === "Gmail" ? "Connect account" : "Add service"}</button>`,
  });
}

function smtpFormHTML(s) {
  return `
    <div class="space-y-4">
      <div><label class="field-label">Host</label><input class="input-glass" id="svc-host" placeholder="smtp.mailprovider.com" value="${escapeHtml(s.host || "")}" required /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">Port</label><input class="input-glass" id="svc-port" placeholder="587" value="${escapeHtml(s.port || "")}" /></div>
        <div><label class="field-label">From name</label><input class="input-glass" id="svc-from-name" placeholder="Your App" value="${escapeHtml(s.fromName || "")}" /></div>
      </div>
      <div><label class="field-label">From email</label><input class="input-glass" id="svc-from" placeholder="hello&#64;yourdomain.com" value="${escapeHtml(s.fromEmail || "")}" /></div>
      <div><label class="field-label">Username</label><input class="input-glass" id="svc-username" value="${escapeHtml(s.username || "")}" /></div>
      <div><label class="field-label">Password / App password ${s.id ? '<span class="text-tertiary font-normal">(leave blank to keep current)</span>' : ""}</label><input class="input-glass" type="password" id="svc-password" /></div>
    </div>
  `;
}

function apiKeyFormHTML(provider, s) {
  return `
    <div class="space-y-4">
      <div>
        <label class="field-label">${provider} API Key</label>
        <input class="input-glass font-mono" type="password" id="svc-api-key" placeholder="${provider === "SendGrid" ? "SG.xxxxxxxxxxxxxxxx" : "key-xxxxxxxxxxxxxxxx"}" />
        ${s.apiKeySet ? `<p class="text-tertiary text-xs mt-1">A key is already saved. Leave blank to keep it, or paste a new one to replace it.</p>` : ""}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="field-label">From name</label><input class="input-glass" id="svc-from-name" value="${escapeHtml(s.fromName || "")}" placeholder="Your App" /></div>
        <div><label class="field-label">From email</label><input class="input-glass" id="svc-from" value="${escapeHtml(s.fromEmail || "")}" placeholder="hello&#64;yourdomain.com" /></div>
      </div>
    </div>
  `;
}

function gmailOAuthFormHTML(s) {
  const connected = !!s.username;
  return `
    <div class="glass glass-card p-6 text-center" id="gmail-oauth-panel">
      ${
        connected
          ? gmailConnectedHTML(s.username)
          : `
        <p class="text-secondary text-sm mb-4">Emaily will request permission to send email on your behalf through Gmail's API.</p>
        <button type="button" class="btn btn-aurora" data-action="simulate-gmail-oauth">Connect with Google</button>
      `
      }
    </div>
    <div class="mt-4">
      <label class="field-label">From name</label>
      <input class="input-glass" id="svc-from-name" placeholder="Your App" value="${escapeHtml(s.fromName || "")}" />
    </div>
  `;
}

function gmailConnectedHTML(email) {
  return `
    <div class="w-11 h-11 rounded-full mx-auto mb-3 flex items-center justify-center" style="background: var(--success-bg)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <p class="font-semibold text-sm mb-1">Connected as</p>
    <p class="text-secondary text-sm font-mono">${escapeHtml(email)}</p>
    <input type="hidden" id="gmail-connected-email" value="${escapeHtml(email)}" />
  `;
}

async function simulateGmailOAuth() {
  const panel = $("#gmail-oauth-panel");
  panel.innerHTML = `<div class="flex flex-col items-center gap-3 py-3"><span class="spinner"></span><p class="text-secondary text-sm">Connecting to Google…</p></div>`;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const fakeEmail =
    (currentUserCache?.email?.split("@")[0] || "user") + "@gmail.com";
  panel.innerHTML = gmailConnectedHTML(fakeEmail);
}

async function submitService(projectId, serviceId, provider) {
  let payload = { provider };
  if (provider === "SMTP") {
    payload = {
      ...payload,
      host: $("#svc-host").value.trim(),
      port: Number($("#svc-port").value) || undefined,
      fromName: $("#svc-from-name").value.trim(),
      fromEmail: $("#svc-from").value.trim(),
      username: $("#svc-username").value.trim(),
      password: $("#svc-password").value,
    };
  } else if (provider === "Gmail") {
    const email = $("#gmail-connected-email")?.value;
    if (!email) return showToast("Connect your Google account first.", "error");
    payload = {
      ...payload,
      username: email,
      fromEmail: email,
      fromName: $("#svc-from-name").value.trim(),
      apiKey: "gmail_oauth_token_" + Date.now(),
    };
  } else {
    payload = {
      ...payload,
      apiKey: $("#svc-api-key").value.trim() || undefined,
      fromEmail: $("#svc-from").value.trim(),
      fromName: $("#svc-from-name").value.trim(),
    };
  }
  try {
    if (serviceId) await ServiceService.update(serviceId, payload);
    else await ServiceService.create(projectId, payload);
    showToast(serviceId ? "Service updated." : "Service added.", "success");
    closeModal();
    await renderProjectDetail(projectId, "services");
  } catch (err) {
    showToast(
      friendlyError(err, "Could not save service — check your plan limits."),
      "error",
    );
  }
}

async function toggleServiceStatus(id, currentlyActive, btnEl, projectId) {
  const next = !currentlyActive;
  btnEl.classList.add("is-busy");
  try {
    await ServiceService.setStatus(id, next);
    btnEl.classList.toggle("is-on", next);
    btnEl.dataset.active = String(next);
    showToast(next ? "Service resumed." : "Service paused.", "success");
  } catch (err) {
    showToast(friendlyError(err), "error");
    await renderProjectDetail(projectId, "services");
  } finally {
    btnEl.classList.remove("is-busy");
  }
}

async function deleteService(serviceId, projectId) {
  if (!confirm("Remove this service?")) return;
  try {
    await ServiceService.remove(serviceId);
    showToast("Service removed.", "success");
    await renderProjectDetail(projectId, "services");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function renderIntegrationsTab(projectId) {
  const integrations = await IntegrationService.list(projectId).catch(() => []);
  return `
    <div class="flex justify-end mb-4"><button class="btn btn-aurora btn-sm" data-action="open-integration-modal" data-project-id="${projectId}">+ Add integration</button></div>
    ${
      integrations.length
        ? `<div class="space-y-3">${integrations
            .map(
              (i) => `
      <div class="glass glass-card p-5 flex items-center justify-between">
        <div><p class="font-semibold text-sm">${escapeHtml(i.type)}</p><p class="text-tertiary text-xs font-mono mt-1">${escapeHtml(JSON.stringify(i.config))}</p></div>
        <button class="btn btn-icon btn-danger" data-action="delete-integration" data-id="${i.id}" data-project-id="${projectId}" aria-label="Remove integration">${ICONS.trash}</button>
      </div>`,
            )
            .join("")}</div>`
        : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No integrations yet</p><p class="text-secondary text-sm">Connect Telegram or Google Sheets to get notified of new submissions.</p></div>`
    }
  `;
}

function openIntegrationModal(projectId) {
  openModal({
    title: "Add integration",
    bodyHTML: `
      <div class="space-y-4">
        <div>
          <label class="field-label">Type</label>
          <select class="input-glass" id="int-type"><option value="Telegram">Telegram bot</option><option value="GoogleSheets">Google Sheets</option></select>
        </div>
        <div><label class="field-label">Chat ID / Sheet URL</label><input class="input-glass" id="int-config" placeholder="@your_channel or sheet URL" /></div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-integration" data-project-id="${projectId}">Add integration</button>`,
  });
}

async function submitIntegration(projectId) {
  try {
    await IntegrationService.create(projectId, {
      type: $("#int-type").value,
      config: { value: $("#int-config").value.trim() },
    });
    showToast("Integration added.", "success");
    closeModal();
    await renderProjectDetail(projectId, "integrations");
  } catch (err) {
    showToast(
      friendlyError(err, "Could not add integration — check your plan."),
      "error",
    );
  }
}

async function deleteIntegration(intId, projectId) {
  if (!confirm("Remove this integration?")) return;
  try {
    await IntegrationService.remove(intId);
    showToast("Integration removed.", "success");
    await renderProjectDetail(projectId, "integrations");
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   Project picker (shared by templates.html / history.html)
   ============================================================ */
async function renderProjectPicker(selectedId) {
  const projects = await ProjectService.list().catch(() => []);
  const remembered =
    selectedId ||
    localStorage.getItem("emaily_last_project") ||
    projects[0]?.id ||
    "";
  if (remembered) localStorage.setItem("emaily_last_project", remembered);
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

  const project = projects.find((p) => p.id === selectedId) || projects[0];

  content.innerHTML = `
    <div class="flex items-center justify-between mb-2"><h1 class="font-display text-2xl font-bold">Templates</h1><a href="${urlFor("template-editor", "?project=" + selectedId)}" class="btn btn-aurora btn-sm">+ New template</a></div>
    ${pickerHTML}
    <div id="templates-list">${await templatesListHTML(selectedId, project)}</div>
  `;
}

async function templatesListHTML(projectId, project) {
  if (!project)
    project = await ProjectService.getById(projectId).catch(() => ({
      id: projectId,
      publicApiKey: "",
    }));
  const templates = await TemplateService.list(projectId).catch(() => []);
  return templates.length
    ? `<div class="space-y-3">${templates
        .map(
          (t) => `
    <div class="glass glass-card p-5 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-semibold text-sm">${escapeHtml(t.name)}</p>
        <p class="text-tertiary text-xs mt-1 truncate">${escapeHtml(t.subject || "")}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${toggleSwitchHTML({ isOn: t.isActive !== false, action: "toggle-template-status", id: t.id, dataExtra: `data-project-id="${projectId}"` })}
        <button class="btn btn-icon btn-ghost" data-action="open-snippet-modal" data-template='${escapeHtml(JSON.stringify(t))}' data-project='${escapeHtml(JSON.stringify(project))}' aria-label="Integration code" title="Integration code">${ICONS.code}</button>
        <a class="btn btn-icon btn-ghost" href="${urlFor("template-editor", `?project=${projectId}&template=${t.id}`)}" aria-label="Edit template" title="Edit">${ICONS.pencil}</a>
        <button class="btn btn-icon btn-danger" data-action="delete-template" data-id="${t.id}" data-project-id="${projectId}" aria-label="Delete template" title="Delete">${ICONS.trash}</button>
      </div>
    </div>`,
        )
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

async function deleteTemplate(templateId, projectId) {
  if (!confirm("Delete this template?")) return;
  try {
    await TemplateService.remove(templateId);
    showToast("Template deleted.", "success");
    $("#templates-list").innerHTML = await templatesListHTML(projectId);
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   PAGE: template-editor.html — dedicated full page, not a modal
   ============================================================ */
async function initTemplateEditorPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  const params = new URLSearchParams(location.search);
  const projectId = params.get("project");
  const templateId = params.get("template");

  if (!projectId) {
    content.innerHTML = errorPanel({ message: "No project specified." });
    return;
  }

  try {
    const [project, services, templates, subscription, plans] =
      await Promise.all([
        ProjectService.getById(projectId),
        ServiceService.list(projectId).catch(() => []),
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

    content.innerHTML = templateEditorHTML({
      project,
      services,
      template,
      otherTemplates,
      maxAttachments: plan.maxAttachmentsPerTemplate || 0,
    });
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function templateEditorHTML({
  project,
  services,
  template,
  otherTemplates,
  maxAttachments,
}) {
  const t = template || {};
  return `
    <a href="${urlFor("templates", "?project=" + project.id)}" class="btn btn-ghost btn-sm mb-5">← Templates</a>
    <h1 class="font-display text-2xl font-bold mb-1">${template ? "Edit template" : "New template"}</h1>
    <p class="text-secondary text-sm mb-8">${escapeHtml(project.name)}</p>

    <form id="form-template-editor" data-project-id="${project.id}" data-template-id="${t.id || ""}" class="max-w-3xl space-y-6">

      <div class="glass glass-card p-6">
        <h3 class="font-display font-semibold mb-4">Email details</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label class="field-label">Name</label><input class="input-glass" id="tpl-name" value="${escapeHtml(t.name || "")}" placeholder="contact-form" required /></div>
          <div><label class="field-label">Subject</label><input class="input-glass" id="tpl-subject" value="${escapeHtml(t.subject || "")}" placeholder="New message from {{name}}" /></div>
        </div>
        <div class="mb-4"><label class="field-label">HTML body</label><textarea class="input-glass font-mono" style="min-height:220px" id="tpl-html" placeholder="<h1>New submission</h1>">${escapeHtml(t.html || "")}</textarea></div>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div><label class="field-label">To</label><input class="input-glass" id="tpl-to" value="${escapeHtml(t.toEmail || "")}" placeholder="you&#64;example.com" /></div>
          <div><label class="field-label">Reply-To</label><input class="input-glass" id="tpl-reply-to" value="${escapeHtml(t.replyTo || "")}" placeholder="optional" /></div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="field-label">CC</label><input class="input-glass" id="tpl-cc" value="${escapeHtml(t.cc || "")}" placeholder="optional, comma-separated" /></div>
          <div><label class="field-label">BCC</label><input class="input-glass" id="tpl-bcc" value="${escapeHtml(t.bcc || "")}" placeholder="optional, comma-separated" /></div>
        </div>
      </div>

      <div class="glass glass-card p-6">
        <h3 class="font-display font-semibold mb-4">Settings</h3>
        <div class="grid grid-cols-2 gap-y-4 gap-x-6">
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="tpl-recaptcha" ${t.enableRecaptchaV2 ? "checked" : ""}/> reCAPTCHA v2</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="tpl-appcheck" ${t.enableAppCheck ? "checked" : ""}/> Firebase App Check</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="tpl-save-history" ${t.doSaveInHistory !== false ? "checked" : ""}/> Save to history</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="tpl-auto-reply" ${t.enableAutoReply ? "checked" : ""}/> Send auto-reply</label>
        </div>
        <div id="tpl-recaptcha-site-key-wrap" class="mt-4 ${t.enableRecaptchaV2 ? "" : "hidden"}">
          <label class="field-label">reCAPTCHA Site Key</label>
          <input class="input-glass font-mono" id="tpl-recaptcha-site-key" value="${escapeHtml(t.recaptchaSiteKey || "")}" placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxx" />
        </div>
        <div id="tpl-auto-reply-target-wrap" class="mt-4 ${t.enableAutoReply ? "" : "hidden"}">
          <label class="field-label">Auto-reply template</label>
          <select class="input-glass" id="tpl-auto-reply-target">
            <option value="">— choose a template —</option>
            ${otherTemplates.map((ot) => `<option value="${ot.id}" ${t.autoReplyTemplateId === ot.id ? "selected" : ""}>${escapeHtml(ot.name)}</option>`).join("")}
          </select>
          ${!otherTemplates.length ? '<p class="text-tertiary text-xs mt-2">Create another template first to use as the auto-reply.</p>' : ""}
        </div>
      </div>

      <div class="glass glass-card p-6">
        <h3 class="font-display font-semibold mb-4">Sending service</h3>
        <p class="text-tertiary text-xs mb-3">Which connected service should deliver this template's emails.</p>
        ${
          services.length
            ? `
          <select class="input-glass" id="tpl-service">
            <option value="">— none selected —</option>
            ${services.map((s) => `<option value="${s.id}" ${t.serviceId === s.id ? "selected" : ""}>${escapeHtml(s.fromName || s.provider)} · ${escapeHtml(s.provider)}</option>`).join("")}
          </select>
        `
            : `<p class="text-tertiary text-sm">No services connected yet. <a href="${urlFor("projects", "?id=" + project.id + "&tab=services")}" class="text-gradient-aurora font-semibold">Add one</a> first.</p>`
        }
      </div>

      ${
        template
          ? attachmentsSectionHTML(t, maxAttachments)
          : `
        <div class="glass glass-card p-6">
          <h3 class="font-display font-semibold mb-1">Attachments</h3>
          <p class="text-tertiary text-sm">Save this template first, then come back to attach files (${maxAttachments} max on your plan).</p>
        </div>
      `
      }

      <div class="flex gap-3 pb-4">
        <button type="submit" class="btn btn-aurora">${template ? "Save changes" : "Create template"}</button>
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
      <h3 class="font-display font-semibold mb-1">Attachments</h3>
      <p class="text-tertiary text-xs mb-4">${maxAttachments} attachment${maxAttachments === 1 ? "" : "s"} max on your plan · ${atts.length} of ${maxAttachments} used</p>
      ${
        atts.length
          ? `<div class="space-y-2 mb-4">${atts
              .map(
                (a) => `
        <div class="glass glass-card p-3 flex items-center justify-between">
          <span class="text-sm font-mono truncate">${escapeHtml(a.fileName)}</span>
          <button type="button" class="btn btn-icon btn-danger" data-action="remove-attachment" data-attachment-id="${a.id}" aria-label="Remove attachment">${ICONS.trash}</button>
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
            : `<input type="file" id="attachment-input" class="hidden" /><button type="button" class="btn btn-ghost btn-sm" data-action="pick-attachment">+ Add attachment</button>`
      }
    </div>
  `;
}

async function submitTemplateEditor(projectId, templateId) {
  const name = $("#tpl-name").value.trim();
  if (!name) return showToast("Give the template a name.", "error");
  const autoReply = $("#tpl-auto-reply").checked;
  const recaptcha = $("#tpl-recaptcha").checked;
  const payload = {
    name,
    subject: $("#tpl-subject").value.trim(),
    html: $("#tpl-html").value,
    toEmail: $("#tpl-to").value.trim(),
    replyTo: $("#tpl-reply-to").value.trim(),
    cc: $("#tpl-cc").value.trim(),
    bcc: $("#tpl-bcc").value.trim(),
    enableRecaptchaV2: recaptcha,
    recaptchaSiteKey: recaptcha
      ? $("#tpl-recaptcha-site-key").value.trim()
      : "",
    enableAppCheck: $("#tpl-appcheck").checked,
    doSaveInHistory: $("#tpl-save-history").checked,
    enableAutoReply: autoReply,
    autoReplyTemplateId: autoReply
      ? $("#tpl-auto-reply-target")?.value || null
      : null,
    serviceId: $("#tpl-service")?.value || null,
  };
  try {
    let saved;
    if (templateId) saved = await TemplateService.update(templateId, payload);
    else saved = await TemplateService.create(projectId, payload);
    showToast(
      templateId
        ? "Template updated."
        : "Template created — you can now add attachments.",
      "success",
    );
    window.location.href = urlFor(
      "template-editor",
      `?project=${projectId}&template=${saved.id}`,
    );
  } catch (err) {
    showToast(
      friendlyError(err, "Could not save template — check your plan limits."),
      "error",
    );
  }
}

async function uploadAttachment(file) {
  const templateId = $("#form-template-editor")?.dataset.templateId;
  if (!templateId || !file) return;
  const fd = new FormData();
  fd.append("fileName", file.name);
  fd.append("fileSize", String(file.size));
  try {
    await TemplateService.addAttachment(templateId, fd);
    showToast("Attachment added.", "success");
    location.reload();
  } catch (err) {
    showToast(
      friendlyError(err, "Could not add attachment — check your plan limits."),
      "error",
    );
  }
}

async function removeAttachment(attachmentId) {
  const templateId = $("#form-template-editor")?.dataset.templateId;
  if (!confirm("Remove this attachment?")) return;
  try {
    await TemplateService.removeAttachment(templateId, attachmentId);
    showToast("Attachment removed.", "success");
    location.reload();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   Integration code snippets (HTML/JS, Python, C#)
   ============================================================ */
function buildSnippets(template, project) {
  const submitUrl = `${BASE_URL}/submit/${project?.publicApiKey || "YOUR_PUBLIC_KEY"}`;
  const html = `fetch("${submitUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    templateId: "${template.id}",
    fields: { name: "Sara", message: "Hello!" }
  })
})
  .then((res) => res.json())
  .then((data) => console.log(data));`;

  const python = `import requests

response = requests.post(
    "${submitUrl}",
    json={
        "templateId": "${template.id}",
        "fields": {"name": "Sara", "message": "Hello!"}
    },
)
print(response.json())`;

  const csharp = `using var client = new HttpClient();

var payload = new
{
    templateId = "${template.id}",
    fields = new { name = "Sara", message = "Hello!" }
};

var response = await client.PostAsJsonAsync(
    "${submitUrl}",
    payload
);
var result = await response.Content.ReadFromJsonAsync<object>();`;

  return { html, python, csharp };
}

function openCodeSnippetModal(template, project) {
  const snippets = buildSnippets(template, project);
  const langs = [
    ["html", "HTML / JS"],
    ["python", "Python"],
    ["csharp", "C#"],
  ];

  openModal({
    title: `Integrate "${template.name}"`,
    wide: true,
    bodyHTML: `
      <p class="text-secondary text-sm mb-4">Copy-paste calls that trigger this exact template through your project's public key.</p>
      <div class="snippet-tabs">
        ${langs.map(([key, label], i) => `<button type="button" class="snippet-tab ${i === 0 ? "is-active" : ""}" data-action="switch-snippet-tab" data-lang="${key}">${label}</button>`).join("")}
      </div>
      ${langs
        .map(
          ([key], i) => `
        <div data-snippet-panel="${key}" class="${i === 0 ? "" : "hidden"}">
          <pre class="code-block" style="white-space: pre-wrap;">${escapeHtml(snippets[key])}</pre>
          <button type="button" class="copy-btn mt-2" data-action="copy-text" data-copy="${escapeHtml(snippets[key])}">${ICONS.copy} Copy snippet</button>
        </div>
      `,
        )
        .join("")}
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
  });
}

/* ============================================================
   PAGE: history.html
   ============================================================ */
let historyPage = 1;

async function initHistoryPage() {
  historyPage = 1;
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

  content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-2">History</h1>${pickerHTML}<div id="history-list">${await historyListHTML(selectedId)}</div>`;
}

function statusPillClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "sent" || s === "resent") return "is-success";
  if (s === "failed") return "is-danger";
  if (s === "pending") return "is-warning";
  return "is-neutral";
}

async function historyListHTML(projectId) {
  const res = await SubmissionService.listByProject(projectId, {
    page: historyPage,
    pageSize: 20,
  }).catch(() => ({ items: [] }));
  const items = res.items || [];
  if (!items.length)
    return `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No submissions yet</p><p class="text-secondary text-sm">Submissions will appear here as soon as your form starts posting.</p></div>`;
  return `
    <div class="space-y-2">${items
      .map(
        (s) => `
      <div class="glass glass-card p-4 flex items-center justify-between cursor-pointer" data-action="view-submission" data-id="${s.id}" data-project-id="${projectId}">
        <div class="flex items-center gap-3"><span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || "Unknown")}</span><span class="text-sm">${escapeHtml(s.recipient || "—")}</span></div>
        <span class="text-tertiary text-xs font-mono">${formatDate(s.createdAt)}</span>
      </div>`,
      )
      .join("")}</div>
    <div class="flex justify-center gap-3 mt-6">
      <button class="btn btn-ghost btn-sm" data-action="history-page" data-project-id="${projectId}" data-dir="-1" ${historyPage <= 1 ? "disabled" : ""}>Previous</button>
      <span class="text-tertiary text-xs self-center">Page ${historyPage}</span>
      <button class="btn btn-ghost btn-sm" data-action="history-page" data-project-id="${projectId}" data-dir="1">Next</button>
    </div>
  `;
}

async function viewSubmission(id, projectId) {
  try {
    const s = await SubmissionService.getById(id);
    openModal({
      title: "Submission detail",
      bodyHTML: `
        <div class="space-y-3 text-sm">
          <div class="flex justify-between"><span class="text-tertiary">Status</span><span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Recipient</span><span class="font-mono">${escapeHtml(s.recipient || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Date</span><span>${formatDate(s.createdAt)}</span></div>
          ${s.errorMessage ? `<div><p class="text-tertiary mb-1">Error</p><p class="code-block">${escapeHtml(s.errorMessage)}</p></div>` : ""}
          ${s.aiSummary ? `<div><p class="text-tertiary mb-1">AI summary</p><p class="text-secondary">${escapeHtml(s.aiSummary)}</p></div>` : ""}
        </div>
      `,
      footerHTML:
        (s.status || "").toLowerCase() === "failed"
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
    $("#history-list").innerHTML = await historyListHTML(projectId);
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
      segs += `<rect class="chart-bar" x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${sentH.toFixed(1)}" style="fill:#22d3ee" rx="2"><title>${d.date}: ${d.sent} sent</title></rect>`;
      y -= failedH;
      if (failedH > 0.3)
        segs += `<rect class="chart-bar" x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${failedH.toFixed(1)}" style="fill:#f87171" rx="2"><title>${d.date}: ${d.failed} failed</title></rect>`;
      y -= pendingH;
      if (pendingH > 0.3)
        segs += `<rect class="chart-bar" x="${x}" y="${y.toFixed(1)}" width="${barW}" height="${pendingH.toFixed(1)}" style="fill:#fbbf24" rx="2"><title>${d.date}: ${d.pending} pending</title></rect>`;
      if (i % labelEvery === 0) {
        segs += `<text x="${x + barW / 2}" y="${height - 4}" font-size="9" style="fill:#ffffff61" text-anchor="middle">${escapeHtml(d.date.slice(5))}</text>`;
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
      <span><span class="dot" style="background:#22d3ee"></span>Sent</span>
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
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Billing</h1>
      <p class="text-secondary text-sm mb-8">Manage your plan and download past invoices.</p>
      <div class="grid sm:grid-cols-3 gap-5 mb-10">
        ${plans
          .map(
            (p) => `
          <div class="glass glass-card p-6" ${subscription?.planId === p.id ? `style="border-color: var(--aurora-cyan)"` : ""}>
            <p class="font-display font-semibold mb-1">${escapeHtml(p.name)}</p>
            <p class="text-2xl font-display font-bold mb-4">$${escapeHtml(p.price)}<span class="text-xs text-tertiary font-body">/mo</span></p>
            <ul class="text-xs text-secondary space-y-1 mb-5">
              <li>${p.maxProjects} projects</li><li>${p.maxTemplates} templates</li><li>${p.maxEmailsPerMonth.toLocaleString()} emails/mo</li>
            </ul>
            <button class="btn ${subscription?.planId === p.id ? "btn-ghost" : "btn-aurora"} btn-sm w-full justify-center" data-action="subscribe-plan" data-id="${p.id}" ${subscription?.planId === p.id ? "disabled" : ""}>${subscription?.planId === p.id ? "Current plan" : "Choose plan"}</button>
          </div>`,
          )
          .join("")}
      </div>
      <h2 class="font-display font-semibold text-lg mb-4">Invoices</h2>
      ${invoices.length ? `<div class="space-y-2">${invoices.map((inv) => `<div class="glass glass-card p-4 flex items-center justify-between"><span class="text-sm">${formatDate(inv.date)}</span><a class="btn btn-ghost btn-sm" href="${inv.pdfUrl}" target="_blank" rel="noopener">Download PDF</a></div>`).join("")}</div>` : `<p class="text-tertiary text-sm">No invoices yet.</p>`}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
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
        <div><label class="field-label" for="account-name">Name</label><input class="input-glass" id="account-name" value="${escapeHtml(user.name || "")}" /></div>
        <div><label class="field-label" for="account-notify-email">Notification email</label><input class="input-glass" id="account-notify-email" value="${escapeHtml(user.notificationEmail || user.email || "")}" /></div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
    <div class="glass glass-card p-6 max-w-md mb-6">
      <h3 class="font-display font-semibold mb-4">Change password</h3>
      <form id="form-change-password" class="space-y-4">
        <div><label class="field-label" for="pwd-current">Current password</label><input class="input-glass" type="password" id="pwd-current" required /></div>
        <div><label class="field-label" for="pwd-new">New password</label><input class="input-glass" type="password" id="pwd-new" minlength="8" required /></div>
        <div><label class="field-label" for="pwd-confirm">Confirm new password</label><input class="input-glass" type="password" id="pwd-confirm" minlength="8" required /></div>
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
      name: $("#account-name").value.trim(),
      notificationEmail: $("#account-notify-email").value.trim(),
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
  if (
    !confirm(
      "Delete your account? This cannot be undone and you will be signed out immediately.",
    )
  )
    return;
  if (!confirm("Are you absolutely sure? This is permanent.")) return;
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
   PAGE: admin/index.html
   ============================================================ */
async function initAdminDashboardPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const stats = await AdminService.getDashboard();
    const cards = [
      ["Total users", stats.totalUsers],
      ["Active users", stats.activeUsers],
      ["Active projects", stats.totalProjects],
      ["Revenue", `$${stats.totalRevenue}`],
      ["Pending submissions", stats.pendingSubmissions],
      ["Failed submissions", stats.failedSubmissions],
    ];
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Admin overview</h1>
      <p class="text-secondary text-sm mb-8">System-wide stats across all Emaily accounts.</p>
      <div class="grid sm:grid-cols-3 gap-5">${cards.map(([label, val]) => `<div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">${label}</p><p class="font-display text-3xl font-bold">${val}</p></div>`).join("")}</div>
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
          ${data.revenueByPlan.map((p) => progressBarRow(`${p.planName} (${p.subscriberCount} subscriber${p.subscriberCount === 1 ? "" : "s"})`, p.mrr, maxRevenue, "#8b5cf6")).join("") || '<p class="text-tertiary text-sm">No active subscriptions yet.</p>'}
        </div>
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
async function renderAdminUsers(search = "") {
  const users = await AdminService.listUsers(
    search ? `?search=${encodeURIComponent(search)}` : "",
  );
  return `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
      <tbody>${users
        .map(
          (u) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td class="font-mono text-xs">${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.roles)}</td>
          <td><span class="status-pill ${u.isActive ? "is-success" : "is-danger"}">${u.isActive ? "Active" : "Suspended"}</span></td>
          <td class="text-tertiary text-xs">${formatDate(u.createdAt)}</td>
          <td class="text-right whitespace-nowrap">
            <button class="btn btn-ghost btn-sm" data-action="view-user-projects" data-id="${u.id}" data-name="${escapeHtml(u.name)}">Projects</button>
            <button class="btn ${u.isActive ? "btn-danger" : "btn-ghost"} btn-sm" data-action="toggle-user-status" data-id="${u.id}" data-active="${u.isActive}">${u.isActive ? "Suspend" : "Activate"}</button>
          </td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
  `;
}

async function initAdminUsersPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    content.innerHTML = `
      <div class="flex items-center justify-between mb-6"><h1 class="font-display text-2xl font-bold">Users</h1><input class="input-glass max-w-xs" id="user-search" placeholder="Search name or email…" /></div>
      <div class="glass glass-card p-2" id="users-table">${await renderAdminUsers()}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function toggleUserStatus(userId, currentlyActive) {
  try {
    await AdminService.setUserStatus(userId, !currentlyActive);
    showToast(
      currentlyActive ? "User suspended." : "User reactivated.",
      "success",
    );
    $("#users-table").innerHTML = await renderAdminUsers(
      $("#user-search")?.value.trim() || "",
    );
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   Admin drill-down: a user's projects, and a project's
   templates/services. Shared by admin/users.html and
   admin/projects.html.
   ============================================================ */
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
        <div class="min-w-0"><p class="text-sm font-semibold truncate">${escapeHtml(p.name)}</p><p class="text-tertiary text-xs font-mono truncate">${(p.domains || []).join(", ") || "No domain restriction"}</p></div>
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
      <h4 class="font-display font-semibold text-sm mb-2">Templates (${templates.length})</h4>
      ${templates.length ? `<div class="space-y-2 mb-5">${templates.map((t) => `<div class="glass glass-card p-3 text-sm flex items-center justify-between"><span>${escapeHtml(t.name)}</span><span class="text-tertiary text-xs">${escapeHtml(t.subject || "")}</span></div>`).join("")}</div>` : `<p class="text-tertiary text-xs mb-5">None.</p>`}
      <h4 class="font-display font-semibold text-sm mb-2">Services (${services.length})</h4>
      ${services.length ? `<div class="space-y-2">${services.map((s) => `<div class="glass glass-card p-3 text-sm flex items-center justify-between"><span>${escapeHtml(s.provider)}</span><span class="text-tertiary text-xs font-mono">${escapeHtml(s.fromEmail || s.username || "")}</span></div>`).join("")}</div>` : `<p class="text-tertiary text-xs">None.</p>`}
    `;
  } catch (err) {
    $("#admin-drilldown-body").innerHTML =
      `<p class="text-secondary text-sm">${escapeHtml(friendlyError(err))}</p>`;
  }
}

/* ============================================================
   PAGE: admin/banned.html
   ============================================================ */
async function renderBannedTable() {
  const rows = await AdminService.listBanned();
  return `
    <table class="data-table">
      <thead><tr><th>IP / Email</th><th>Violations</th><th>Banned until</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (b) => `
        <tr><td class="font-mono text-xs">${escapeHtml(b.id)}</td><td>${escapeHtml(b.violationCount)}</td><td class="text-tertiary text-xs">${formatDate(b.bannedUntil)}</td>
        <td class="text-right whitespace-nowrap">
          <button class="btn btn-ghost btn-sm" data-action="reduce-banned" data-id="${encodeURIComponent(b.id)}" title="Decrement violation count by 1">Reduce</button>
          <button class="btn btn-icon btn-danger" data-action="delete-banned" data-id="${encodeURIComponent(b.id)}" aria-label="Remove ban">${ICONS.trash}</button>
        </td></tr>`,
        )
        .join("")}</tbody>
    </table>
  `;
}

async function initAdminBannedPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    content.innerHTML = `
      <div class="flex items-center justify-between mb-6"><h1 class="font-display text-2xl font-bold">Banned</h1><button class="btn btn-aurora btn-sm" data-action="open-ban-modal">+ Add ban</button></div>
      <div class="glass glass-card p-2" id="banned-table">${await renderBannedTable()}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function openBanModal() {
  openModal({
    title: "Ban an IP or email",
    bodyHTML: `
      <div class="space-y-4">
        <div><label class="field-label">IP address or email</label><input class="input-glass" id="ban-value" placeholder="203.0.113.7 or spammer&#64;example.com" /></div>
        <div><label class="field-label">Violation count (1–8)</label><input class="input-glass" id="ban-violations" type="number" min="1" max="8" value="1" /></div>
        <div><label class="field-label">Banned until</label><input class="input-glass" id="ban-until" type="date" /></div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-ban">Ban</button>`,
  });
}

async function submitBan() {
  const value = $("#ban-value").value.trim();
  const violationCount = Number($("#ban-violations").value) || 1;
  const bannedUntilRaw = $("#ban-until").value;
  if (!value) return showToast("Enter an IP or email.", "error");
  try {
    await AdminService.addBanned({
      value,
      violationCount,
      bannedUntil: bannedUntilRaw
        ? new Date(bannedUntilRaw).toISOString()
        : undefined,
    });
    showToast("Ban added.", "success");
    closeModal();
    $("#banned-table").innerHTML = await renderBannedTable();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function deleteBanned(id) {
  if (!confirm("Remove this ban?")) return;
  try {
    await AdminService.removeBanned(id);
    showToast("Ban removed.", "success");
    $("#banned-table").innerHTML = await renderBannedTable();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function reduceBanned(id) {
  try {
    const res = await AdminService.reduceBanned(id);
    showToast(
      res.removed
        ? "Violation count reached zero — ban removed."
        : "Violation count reduced.",
      "success",
    );
    $("#banned-table").innerHTML = await renderBannedTable();
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

/* ============================================================
   PAGE: admin/projects.html, admin/templates.html,
   admin/services.html, admin/logs.html — system-wide browse.
   Shared "count vs capped list" control: page loads showing a
   total count; entering a size and clicking Load fetches up to
   that many items (server clamps to 100).
   ============================================================ */
function browseControlHTML(count, scope) {
  return `
    <div class="glass glass-card p-5 mb-6 flex items-end gap-4 flex-wrap">
      <div><p class="text-tertiary text-xs uppercase tracking-wide mb-1">Total</p><p class="font-display text-2xl font-bold">${count.toLocaleString()}</p></div>
      <div class="flex items-end gap-2 ml-auto">
        <div><label class="field-label" for="browse-size-${scope}">Show up to (max 100)</label><input class="input-glass w-32" id="browse-size-${scope}" type="number" min="1" max="100" value="20" /></div>
        <button class="btn btn-aurora btn-sm" data-action="load-admin-browse" data-scope="${scope}">Load</button>
      </div>
    </div>
  `;
}

function browseSize(scope) {
  const el = $(`#browse-size-${scope}`);
  return Math.max(1, Math.min(100, Number(el?.value) || 20));
}

async function initAdminProjectsPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const countRes = await AdminService.listProjects();
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Projects</h1>
      <p class="text-secondary text-sm mb-6">Every project across every account.</p>
      ${browseControlHTML(countRes.count, "projects")}
      <div id="admin-browse-table"></div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminProjects() {
  const res = await AdminService.listProjects(browseSize("projects"));
  $("#admin-browse-table").innerHTML = res.items.length
    ? `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Owner</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>${res.items
        .map(
          (p) => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td class="font-mono text-xs">${escapeHtml(p.ownerEmail || "—")}</td>
          <td><span class="status-pill ${p.isActive ? "is-success" : "is-warning"}">${p.isActive ? "Active" : "Paused"}</span></td>
          <td class="text-tertiary text-xs">${formatDate(p.createdAt)}</td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-action="view-admin-project" data-id="${p.id}">Templates / Services</button></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
  `
    : `<p class="text-tertiary text-sm">No projects to show.</p>`;
}

async function initAdminTemplatesPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const countRes = await AdminService.listTemplates();
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Templates</h1>
      <p class="text-secondary text-sm mb-6">Every template across every project.</p>
      ${browseControlHTML(countRes.count, "templates")}
      <div id="admin-browse-table"></div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminTemplates() {
  const res = await AdminService.listTemplates(browseSize("templates"));
  $("#admin-browse-table").innerHTML = res.items.length
    ? `
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
  `
    : `<p class="text-tertiary text-sm">No templates to show.</p>`;
}

async function openAdminTemplateDetail(id) {
  try {
    const t = await AdminService.getTemplate(id);
    openModal({
      title: t.name,
      bodyHTML: `
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-tertiary">Subject</span><span>${escapeHtml(t.subject || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">To</span><span class="font-mono">${escapeHtml(t.toEmail || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">reCAPTCHA v2</span><span>${t.enableRecaptchaV2 ? "Enabled" : "Off"}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Status</span><span class="status-pill ${t.isActive ? "is-success" : "is-warning"}">${t.isActive ? "Active" : "Paused"}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Attachments</span><span>${t.attachments.length}</span></div>
        </div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
    });
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function initAdminServicesPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const countRes = await AdminService.listServices();
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Services</h1>
      <p class="text-secondary text-sm mb-6">Every connected sending service across every project.</p>
      ${browseControlHTML(countRes.count, "services")}
      <div id="admin-browse-table"></div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminServices() {
  const res = await AdminService.listServices(browseSize("services"));
  $("#admin-browse-table").innerHTML = res.items.length
    ? `
    <table class="data-table">
      <thead><tr><th>Provider</th><th>From</th><th>Status</th><th></th></tr></thead>
      <tbody>${res.items
        .map(
          (s) => `
        <tr>
          <td>${escapeHtml(s.provider)}</td>
          <td class="text-xs text-tertiary font-mono">${escapeHtml(s.fromEmail || s.username || "")}</td>
          <td><span class="status-pill ${s.isActive ? "is-success" : "is-warning"}">${s.isActive ? "Active" : "Paused"}</span></td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-action="view-admin-service" data-id="${s.id}">View</button></td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
  `
    : `<p class="text-tertiary text-sm">No services to show.</p>`;
}

async function openAdminServiceDetail(id) {
  try {
    const s = await AdminService.getService(id);
    openModal({
      title: `${s.provider} service`,
      bodyHTML: `
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-tertiary">From name</span><span>${escapeHtml(s.fromName || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">From email</span><span class="font-mono">${escapeHtml(s.fromEmail || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Host</span><span class="font-mono">${escapeHtml(s.host || "—")}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">API key configured</span><span>${s.apiKeySet ? "Yes" : "No"}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Status</span><span class="status-pill ${s.isActive ? "is-success" : "is-warning"}">${s.isActive ? "Active" : "Paused"}</span></div>
        </div>
      `,
      footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Close</button>`,
    });
  } catch (err) {
    showToast(friendlyError(err), "error");
  }
}

async function initAdminLogsPage() {
  const content = $("#page-content");
  content.innerHTML = renderSkeleton();
  try {
    const countRes = await AdminService.listLogs();
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">System logs</h1>
      <p class="text-secondary text-sm mb-6">Recent activity across the whole system.</p>
      ${browseControlHTML(countRes.count, "logs")}
      <div id="admin-browse-table"></div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function loadAdminLogs() {
  const res = await AdminService.listLogs(browseSize("logs"));
  $("#admin-browse-table").innerHTML = res.items.length
    ? `
    <table class="data-table">
      <thead><tr><th>Level</th><th>Source</th><th>Message</th><th>When</th></tr></thead>
      <tbody>${res.items
        .map(
          (l) => `
        <tr>
          <td><span class="status-pill ${l.level === "Error" || l.level === "Critical" ? "is-danger" : l.level === "Warning" ? "is-warning" : "is-neutral"}">${escapeHtml(l.level)}</span></td>
          <td class="text-xs font-mono">${escapeHtml(l.source)}</td>
          <td class="text-xs">${escapeHtml(l.message)}</td>
          <td class="text-tertiary text-xs">${formatDate(l.createdAt)}</td>
        </tr>`,
        )
        .join("")}</tbody>
    </table>
  `
    : `<p class="text-tertiary text-sm">No logs to show.</p>`;
}

/* ============================================================
   PAGE: admin/plans.html
   Note: the endpoint list only defines POST /admin/plans
   (create-or-update) with no dedicated admin GET, so this page
   lists plans via GET /billing/plans — meaning only currently
   *active* plans are shown. Deactivating a plan here will make
   it disappear from this list too.
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
          <p class="text-2xl font-display font-bold mb-3">$${escapeHtml(p.price)}<span class="text-xs text-tertiary font-body">/mo</span></p>
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
      <div><label class="field-label">Price ($/mo)</label><input class="input-glass" id="plan-price" type="number" min="0" value="${p.price ?? 0}" /></div>
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
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-telegram" ${p.canUseTelegramBot ? "checked" : ""}/> Telegram</label>
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
      price: Number($("#plan-price").value) || 0,
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
    case "close-modal":
      return closeModal();
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
      const url = new URL(location.href);
      url.searchParams.set("id", target.dataset.projectId);
      url.searchParams.set("tab", target.dataset.tab);
      history.pushState({}, "", url);
      return renderProjectDetail(target.dataset.projectId, target.dataset.tab);
    }
    case "regenerate-keys":
      return regenerateKeys(target.dataset.id);

    case "open-service-modal":
      return openServiceModal(target.dataset.projectId);
    case "edit-service":
      return openServiceModal(
        target.dataset.projectId,
        JSON.parse(target.dataset.service),
      );
    case "pick-service-provider":
      return renderServiceProviderForm(
        target.dataset.projectId,
        target.dataset.provider,
      );
    case "simulate-gmail-oauth":
      return simulateGmailOAuth();
    case "submit-service":
      return submitService(
        target.dataset.projectId,
        target.dataset.serviceId || null,
        target.dataset.provider,
      );
    case "delete-service":
      return deleteService(target.dataset.id, target.dataset.projectId);
    case "toggle-service-status":
      return toggleServiceStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
        target.dataset.projectId,
      );

    case "open-integration-modal":
      return openIntegrationModal(target.dataset.projectId);
    case "submit-integration":
      return submitIntegration(target.dataset.projectId);
    case "delete-integration":
      return deleteIntegration(target.dataset.id, target.dataset.projectId);

    case "delete-template":
      return deleteTemplate(target.dataset.id, target.dataset.projectId);
    case "toggle-template-status":
      return toggleTemplateStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );
    case "pick-attachment":
      return $("#attachment-input")?.click();
    case "remove-attachment":
      return removeAttachment(target.dataset.attachmentId);
    case "open-snippet-modal":
      return openCodeSnippetModal(
        JSON.parse(target.dataset.template),
        JSON.parse(target.dataset.project),
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
      const el = $("#private-key-display");
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

    case "toggle-project-status":
      return toggleProjectStatus(
        target.dataset.id,
        target.dataset.active === "true",
        target,
      );
    case "toggle-project-flag":
      return toggleProjectFlag(
        target.dataset.id,
        target.dataset.flag,
        target.dataset.active === "true",
        target,
      );

    case "delete-account":
      return deleteAccount();

    case "view-submission":
      return viewSubmission(target.dataset.id, target.dataset.projectId);
    case "retry-submission":
      return retrySubmission(target.dataset.id, target.dataset.projectId);
    case "history-page": {
      historyPage = Math.max(1, historyPage + Number(target.dataset.dir));
      $("#history-list").innerHTML = await historyListHTML(
        target.dataset.projectId,
      );
      return;
    }

    case "subscribe-plan":
      return subscribeToPlan(target.dataset.id);

    case "toggle-user-status":
      return toggleUserStatus(
        target.dataset.id,
        target.dataset.active === "true",
      );
    case "view-user-projects":
      return openAdminUserProjectsModal(target.dataset.id, target.dataset.name);
    case "view-admin-project":
      return openAdminProjectDrilldown(target.dataset.id);
    case "view-admin-template":
      return openAdminTemplateDetail(target.dataset.id);
    case "view-admin-service":
      return openAdminServiceDetail(target.dataset.id);

    case "open-ban-modal":
      return openBanModal();
    case "submit-ban":
      return submitBan();
    case "delete-banned":
      return deleteBanned(target.dataset.id);
    case "reduce-banned":
      return reduceBanned(target.dataset.id);

    case "open-plan-modal":
      return openPlanModal();
    case "edit-plan":
      return openPlanModal(JSON.parse(target.dataset.plan));
    case "submit-plan":
      return submitPlan();

    case "load-admin-browse": {
      const scope = target.dataset.scope;
      if (scope === "projects") return loadAdminProjects();
      if (scope === "templates") return loadAdminTemplates();
      if (scope === "services") return loadAdminServices();
      if (scope === "logs") return loadAdminLogs();
      return;
    }

    default:
      return;
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "project-picker") {
    const url = new URL(location.href);
    url.searchParams.set("project", e.target.value);
    location.href = url.toString();
  }
  if (e.target.id === "analytics-project-picker") {
    const url = new URL(location.href);
    if (e.target.value) url.searchParams.set("project", e.target.value);
    else url.searchParams.delete("project");
    location.href = url.toString();
  }
  if (e.target.id === "tpl-auto-reply") {
    $("#tpl-auto-reply-target-wrap")?.classList.toggle(
      "hidden",
      !e.target.checked,
    );
  }
  if (e.target.id === "tpl-recaptcha") {
    $("#tpl-recaptcha-site-key-wrap")?.classList.toggle(
      "hidden",
      !e.target.checked,
    );
  }
  if (e.target.id === "attachment-input" && e.target.files[0]) {
    uploadAttachment(e.target.files[0]);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "user-search") {
    clearTimeout(window.__userSearchDebounce);
    window.__userSearchDebounce = setTimeout(async () => {
      const table = $("#users-table");
      if (table)
        table.innerHTML = await renderAdminUsers(e.target.value.trim());
    }, 300);
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
  if (form.id === "form-account") return saveAccount();
  if (form.id === "form-change-password") return changePassword(form);
  if (form.id === "form-project-settings")
    return saveProjectSettings(form.dataset.id);
  if (form.id === "form-template-editor")
    return submitTemplateEditor(
      form.dataset.projectId,
      form.dataset.templateId || null,
    );
});

/* ============================================================
   Boot
   ============================================================ */
const PAGE_INIT = {
  dashboard: initDashboardPage,
  projects: initProjectsPage,
  templates: initTemplatesPage,
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
};

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;

  if (PUBLIC_ONLY_PAGE_INIT[page]) {
    return PUBLIC_ONLY_PAGE_INIT[page]();
  }

  if (page === "landing") {
    return; // fully static/public, no auth guard, no shell to mount
  }

  const user = await mountAppShell(page);
  if (!user) return; // mountAppShell already redirected
  const init = PAGE_INIT[page];
  if (init) await init(user);
});
