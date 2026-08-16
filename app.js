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
  AdminService,
  tokenStore,
} from './api.js';

/* ============================================================
   Path helpers — the admin/ folder is one level down, so every
   link and asset path has to account for that.
   ============================================================ */
const inAdmin = location.pathname.includes('/admin/');

const PAGE_URLS = {
  landing: 'index.html', login: 'login.html', register: 'register.html',
  dashboard: 'dashboard.html', projects: 'projects.html', templates: 'templates.html',
  history: 'history.html', billing: 'billing.html', account: 'account.html',
  'admin-dashboard': 'admin/index.html', 'admin-users': 'admin/users.html',
  'admin-banned': 'admin/banned.html', 'admin-plans': 'admin/plans.html',
};

function urlFor(pageKey, query = '') {
  const path = PAGE_URLS[pageKey];
  if (!path) return '#';
  const resolved = inAdmin
    ? (path.startsWith('admin/') ? path.slice('admin/'.length) : '../' + path)
    : path;
  return resolved + query;
}

function assetPath(name) {
  return (inAdmin ? '../assets/' : 'assets/') + name;
}

function redirectTo(pageKey, query = '') {
  window.location.href = urlFor(pageKey, query);
}

/* ============================================================
   DOM & format helpers
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  return (err && err.message) || fallback;
}

/* ============================================================
   Toasts
   ============================================================ */
function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast is-${type}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s ease';
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

/* ============================================================
   Modal
   ============================================================ */
function openModal({ title, bodyHTML, footerHTML = '' }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-panel glass glass-panel p-7" role="dialog" aria-modal="true">
      <div class="flex items-center justify-between mb-6">
        <h3 class="font-display font-semibold text-lg">${escapeHtml(title)}</h3>
        <button class="btn btn-icon btn-ghost" data-action="close-modal" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div>${bodyHTML}</div>
      ${footerHTML ? `<div class="mt-6 flex justify-end gap-3">${footerHTML}</div>` : ''}
    </div>
  `;
  root.classList.remove('hidden');
  root.classList.add('flex');
}

function closeModal() {
  const root = $('#modal-root');
  root.classList.add('hidden');
  root.classList.remove('flex');
  root.innerHTML = '';
}

function setBtnLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span> ${escapeHtml(label)}` : escapeHtml(label);
}

/* ============================================================
   Icons (compact inline SVGs used in nav/sidebar)
   ============================================================ */
const ICONS = {
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  card: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  ban: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41L13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  arrowLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
};

/* ============================================================
   Layout: navbar + sidebar
   ============================================================ */
function navbarInnerHTML(user) {
  return `
    <div class="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
      <a href="${urlFor(inAdmin ? 'admin-dashboard' : 'dashboard')}" class="flex items-center gap-3">
        <img src="${assetPath('logo.png')}" alt="Emaily" class="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(139,92,246,0.55)]" />
        <span class="font-display font-bold text-lg tracking-tight">Emaily</span>
        ${inAdmin ? '<span class="admin-tag">ADMIN</span>' : ''}
      </a>
      <div class="flex items-center gap-3">
        ${!inAdmin && user.roles === 'Admin' ? `<a href="${urlFor('admin-dashboard')}" class="btn btn-ghost btn-sm">Admin panel</a>` : ''}
        <span class="hidden sm:inline text-sm text-secondary font-mono">${escapeHtml(user.email)}</span>
        <button class="btn btn-icon btn-ghost" data-action="logout" title="Log out" aria-label="Log out">${ICONS.logout}</button>
      </div>
    </div>
  `;
}

function sidebarInnerHTML(activePage) {
  const links = inAdmin
    ? [['admin-dashboard', 'Overview', ICONS.grid], ['admin-users', 'Users', ICONS.users], ['admin-banned', 'Banned', ICONS.ban], ['admin-plans', 'Plans', ICONS.tag]]
    : [['dashboard', 'Overview', ICONS.grid], ['projects', 'Projects', ICONS.folder], ['templates', 'Templates', ICONS.file], ['history', 'History', ICONS.clock], ['billing', 'Billing', ICONS.card], ['account', 'Account', ICONS.user]];

  return `
    ${links.map(([key, label, icon]) => `
      <a href="${urlFor(key)}" class="sidebar-link ${activePage === key ? 'is-active' : ''}">
        <span class="sidebar-icon">${icon}</span> ${label}
      </a>
    `).join('')}
    <div class="my-2 h-px" style="background: var(--glass-border)"></div>
    ${inAdmin ? `<a href="${urlFor('dashboard')}" class="sidebar-link"><span class="sidebar-icon">${ICONS.arrowLeft}</span> Back to app</a>` : ''}
    <button class="sidebar-link" data-action="logout"><span class="sidebar-icon">${ICONS.logout}</span> Log out</button>
  `;
}

async function mountAppShell(activePage) {
  let user;
  try {
    user = await UserService.getMe();
  } catch {
    redirectTo('login');
    return null;
  }

  if (inAdmin && user.roles !== 'Admin') {
    showToast('Admin access required.', 'error');
    redirectTo('dashboard');
    return null;
  }

  const navRoot = $('#navbar-root');
  const sideRoot = $('#sidebar-root');
  if (navRoot) navRoot.innerHTML = navbarInnerHTML(user);
  if (sideRoot) sideRoot.innerHTML = sidebarInnerHTML(activePage);
  if (inAdmin) $('#app-shell')?.classList.add('admin-shell');

  return user;
}

async function redirectIfAuthed() {
  if (!tokenStore.getAccessToken()) return;
  try {
    await UserService.getMe();
    redirectTo('dashboard');
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
  errorEl.classList.add('hidden');
  setBtnLoading(btn, true, 'Signing in…');
  try {
    await AuthService.login({ email: $('#login-email').value.trim(), password: $('#login-password').value });
    redirectTo('dashboard');
  } catch (err) {
    errorEl.textContent = friendlyError(err, 'Could not sign in with those details.');
    errorEl.classList.remove('hidden');
    setBtnLoading(btn, false, 'Sign in');
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
  errorEl.classList.add('hidden');
  setBtnLoading(btn, true, 'Creating account…');
  try {
    await AuthService.register({
      name: $('#register-name').value.trim(),
      email: $('#register-email').value.trim(),
      password: $('#register-password').value,
    });
    showToast('Account created. Sign in to continue.', 'success');
    redirectTo('login');
  } catch (err) {
    errorEl.textContent = friendlyError(err, 'Could not create that account.');
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false, 'Create account');
  }
}

function handleForgotPassword() {
  openModal({
    title: 'Reset your password',
    bodyHTML: `
      <p class="text-secondary text-sm mb-4">We'll send a reset link to your email.</p>
      <label class="field-label" for="forgot-email">Email</label>
      <input class="input-glass" id="forgot-email" type="email" placeholder="[email protected]" required />
    `,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-aurora" data-action="submit-forgot-password">Send link</button>
    `,
  });
}

async function submitForgotPassword() {
  const email = $('#forgot-email').value.trim();
  if (!email) return;
  try {
    await AuthService.forgotPassword(email);
    showToast('If that email exists, a reset link is on its way.', 'success');
    closeModal();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function handleLogout() {
  try { await AuthService.logout(); } catch { /* clear locally regardless */ }
  showToast('Signed out.', 'info');
  redirectTo('landing');
}

/* ============================================================
   PAGE: dashboard.html
   ============================================================ */
async function initDashboardPage(user) {
  const content = $('#page-content');
  content.innerHTML = renderSkeleton();
  try {
    const [projects, subscription] = await Promise.all([
      ProjectService.list().catch(() => []),
      BillingService.getSubscription().catch(() => null),
    ]);
    const planName = subscription?.planName || 'No active plan';
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Welcome back${user.name ? ', ' + escapeHtml(user.name) : ''}.</h1>
      <p class="text-secondary mb-8 text-sm">Here's what's happening across your Emaily account.</p>
      <div class="grid sm:grid-cols-3 gap-5 mb-10">
        <div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">Active projects</p><p class="font-display text-3xl font-bold">${projects.length}</p></div>
        <div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">Current plan</p><p class="font-display text-3xl font-bold">${escapeHtml(planName)}</p></div>
        <div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">Missing emails</p><p class="font-display text-3xl font-bold">${escapeHtml(user.missingEmails ?? '—')}</p></div>
      </div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-display font-semibold text-lg">Recent projects</h2>
        <a href="${urlFor('projects')}" class="btn btn-ghost btn-sm">View all</a>
      </div>
      ${projects.length ? `<div class="grid sm:grid-cols-2 gap-4">${projects.slice(0, 4).map(projectCard).join('')}</div>` : emptyState('No projects yet', 'Create your first project to get a public API key.', 'Create project', () => redirectTo('projects'))}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function renderSkeleton() {
  return `<div class="space-y-4"><div class="skeleton h-8 w-1/3"></div><div class="skeleton h-32 w-full"></div><div class="skeleton h-32 w-full"></div></div>`;
}

function errorPanel(err) {
  return `<div class="glass glass-panel p-8 text-center"><p class="text-secondary">${escapeHtml(friendlyError(err, 'Could not load this page.'))}</p></div>`;
}

function emptyState(title, body, actionLabel, onClick) {
  const id = 'empty-cta-' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => { const b = document.getElementById(id); if (b && onClick) b.addEventListener('click', onClick); }, 0);
  return `
    <div class="glass glass-panel p-10 text-center">
      <p class="font-display font-semibold mb-2">${escapeHtml(title)}</p>
      <p class="text-secondary text-sm mb-6">${escapeHtml(body)}</p>
      ${actionLabel ? `<button id="${id}" class="btn btn-aurora btn-sm">${escapeHtml(actionLabel)}</button>` : ''}
    </div>
  `;
}

function projectCard(p) {
  return `
    <a href="${urlFor('projects', '?id=' + p.id)}" class="glass glass-card p-6 block">
      <div class="flex items-start justify-between mb-3">
        <h3 class="font-display font-semibold">${escapeHtml(p.name)}</h3>
        <span class="status-pill ${p.isActive === false ? 'is-danger' : 'is-success'}">${p.isActive === false ? 'Inactive' : 'Active'}</span>
      </div>
      <p class="text-tertiary text-xs font-mono mb-4">${p.domains?.length ? escapeHtml(p.domains.join(', ')) : 'No domain restriction'}</p>
      <p class="text-tertiary text-xs">Created ${formatDate(p.createdAt)}</p>
    </a>
  `;
}

/* ============================================================
   PAGE: projects.html (list + detail via ?id=)
   ============================================================ */
async function initProjectsPage() {
  const id = new URLSearchParams(location.search).get('id');
  if (id) await renderProjectDetail(id, new URLSearchParams(location.search).get('tab') || 'keys');
  else await renderProjectsList();
}

async function renderProjectsList() {
  const content = $('#page-content');
  content.innerHTML = renderSkeleton();
  try {
    const projects = await ProjectService.list();
    content.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div><h1 class="font-display text-2xl font-bold">Projects</h1><p class="text-secondary text-sm">Each project has its own API keys, templates, and services.</p></div>
        <button class="btn btn-aurora btn-sm" data-action="open-project-modal">+ New project</button>
      </div>
      ${projects.length ? `<div class="grid sm:grid-cols-2 gap-4">${projects.map(projectCard).join('')}</div>` : emptyState('No projects yet', 'Create your first project to get a public API key.', 'Create project', () => $('[data-action="open-project-modal"]')?.click())}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function openProjectModal() {
  openModal({
    title: 'New project',
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
  const name = $('#project-name').value.trim();
  const domainsRaw = $('#project-domains').value.trim();
  if (!name) return showToast('Give the project a name.', 'error');
  try {
    await ProjectService.create({ name, domains: domainsRaw ? domainsRaw.split(',').map((d) => d.trim()).filter(Boolean) : [] });
    showToast('Project created.', 'success');
    closeModal();
    await renderProjectsList();
  } catch (err) {
    showToast(friendlyError(err, 'Could not create project — check your plan limits.'), 'error');
  }
}

async function deleteProjectAndRedirect(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  try {
    await ProjectService.remove(id);
    showToast('Project deleted.', 'success');
    redirectTo('projects');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

const PROJECT_TABS = [['keys', 'Keys'], ['services', 'Services'], ['integrations', 'Integrations'], ['settings', 'Settings']];

async function renderProjectDetail(id, tab) {
  const content = $('#page-content');
  content.innerHTML = renderSkeleton();
  try {
    const project = await ProjectService.getById(id);
    let panel = '';
    if (tab === 'keys') panel = renderKeysTab(project);
    else if (tab === 'services') panel = await renderServicesTab(id);
    else if (tab === 'integrations') panel = await renderIntegrationsTab(id);
    else if (tab === 'settings') panel = renderSettingsTab(project);

    content.innerHTML = `
      <a href="${urlFor('projects')}" class="btn btn-ghost btn-sm mb-5">← All projects</a>
      <div class="flex items-start justify-between mb-6">
        <div>
          <h1 class="font-display text-2xl font-bold">${escapeHtml(project.name)}</h1>
          <p class="text-tertiary text-xs font-mono mt-1">${(project.domains || []).join(', ') || 'No domain restriction'}</p>
        </div>
      </div>
      <div class="flex gap-1 mb-6 border-b" style="border-color: var(--glass-border)">
        ${PROJECT_TABS.map(([key, label]) => `<button class="tab-btn ${tab === key ? 'is-active' : ''}" data-action="set-project-tab" data-project-id="${project.id}" data-tab="${key}">${label}</button>`).join('')}
      </div>
      <div id="project-tab-panel">${panel}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

function renderKeysTab(project) {
  return `
    <div class="glass glass-card p-6">
      <h3 class="font-display font-semibold mb-4">API keys</h3>
      <div class="space-y-3">
        <div><p class="text-tertiary text-xs mb-1">Public key — used in <code class="font-mono">/api/submit/{key}</code></p><p class="api-key-chip">${escapeHtml(project.publicApiKey || '—')}</p></div>
        <div><p class="text-tertiary text-xs mb-1">Private key — server-to-server calls</p><p class="api-key-chip">${escapeHtml(project.privateApiKey || '—')}</p></div>
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
        <div><label class="field-label" for="settings-domains">Allowed domains</label><input class="input-glass" id="settings-domains" value="${escapeHtml((project.domains || []).join(', '))}" /></div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
    <div class="glass glass-card p-6" style="border-color: rgba(248,113,113,0.25)">
      <h3 class="font-display font-semibold mb-2" style="color: var(--danger)">Danger zone</h3>
      <p class="text-secondary text-sm mb-4">Deleting a project stops all submissions immediately. This cannot be undone.</p>
      <button class="btn btn-danger btn-sm" data-action="delete-project" data-id="${project.id}">Delete project</button>
    </div>
  `;
}

async function saveProjectSettings(projectId) {
  const domainsRaw = $('#settings-domains').value.trim();
  try {
    await ProjectService.update(projectId, { name: $('#settings-name').value.trim(), domains: domainsRaw ? domainsRaw.split(',').map((d) => d.trim()).filter(Boolean) : [] });
    showToast('Project updated.', 'success');
    await renderProjectDetail(projectId, 'settings');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function regenerateKeys(projectId) {
  if (!confirm('Regenerate API keys? Anything using the old keys will stop working immediately.')) return;
  try {
    await ProjectService.regenerateKeys(projectId);
    showToast('Keys regenerated.', 'success');
    await renderProjectDetail(projectId, 'keys');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function renderServicesTab(projectId) {
  const services = await ServiceService.list(projectId).catch(() => []);
  return `
    <div class="flex justify-end mb-4"><button class="btn btn-aurora btn-sm" data-action="open-service-modal" data-project-id="${projectId}">+ Add service</button></div>
    ${services.length ? `<div class="space-y-3">${services.map((s) => `
      <div class="glass glass-card p-5 flex items-center justify-between">
        <div><p class="font-semibold text-sm">${escapeHtml(s.provider || s.host || 'SMTP service')}</p><p class="text-tertiary text-xs font-mono mt-1">${escapeHtml(s.fromEmail || s.username || '')}</p></div>
        <button class="btn btn-icon btn-danger" data-action="delete-service" data-id="${s.id}" data-project-id="${projectId}" aria-label="Remove service">${ICONS.trash}</button>
      </div>`).join('')}</div>` : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No sending services</p><p class="text-secondary text-sm">Connect an SMTP service so Emaily can deliver mail for this project.</p></div>`}
  `;
}

function openServiceModal(projectId) {
  openModal({
    title: 'Add SMTP service',
    bodyHTML: `
      <div class="space-y-4">
        <div><label class="field-label">Host</label><input class="input-glass" id="svc-host" placeholder="smtp.mailprovider.com" required /></div>
        <div class="grid grid-cols-2 gap-3"><div><label class="field-label">Port</label><input class="input-glass" id="svc-port" placeholder="587" /></div><div><label class="field-label">From email</label><input class="input-glass" id="svc-from" placeholder="[email protected]" /></div></div>
        <div><label class="field-label">Username</label><input class="input-glass" id="svc-username" /></div>
        <div><label class="field-label">Password</label><input class="input-glass" type="password" id="svc-password" /></div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-service" data-project-id="${projectId}">Add service</button>`,
  });
}

async function submitService(projectId) {
  try {
    await ServiceService.create(projectId, { host: $('#svc-host').value.trim(), port: Number($('#svc-port').value) || undefined, fromEmail: $('#svc-from').value.trim(), username: $('#svc-username').value.trim(), password: $('#svc-password').value });
    showToast('Service added.', 'success');
    closeModal();
    await renderProjectDetail(projectId, 'services');
  } catch (err) {
    showToast(friendlyError(err, 'Could not add service — check your plan limits.'), 'error');
  }
}

async function deleteService(serviceId, projectId) {
  if (!confirm('Remove this service?')) return;
  try {
    await ServiceService.remove(serviceId);
    showToast('Service removed.', 'success');
    await renderProjectDetail(projectId, 'services');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function renderIntegrationsTab(projectId) {
  const integrations = await IntegrationService.list(projectId).catch(() => []);
  return `
    <div class="flex justify-end mb-4"><button class="btn btn-aurora btn-sm" data-action="open-integration-modal" data-project-id="${projectId}">+ Add integration</button></div>
    ${integrations.length ? `<div class="space-y-3">${integrations.map((i) => `
      <div class="glass glass-card p-5 flex items-center justify-between">
        <div><p class="font-semibold text-sm">${escapeHtml(i.type)}</p><p class="text-tertiary text-xs font-mono mt-1">${escapeHtml(JSON.stringify(i.config))}</p></div>
        <button class="btn btn-icon btn-danger" data-action="delete-integration" data-id="${i.id}" data-project-id="${projectId}" aria-label="Remove integration">${ICONS.trash}</button>
      </div>`).join('')}</div>` : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No integrations yet</p><p class="text-secondary text-sm">Connect Telegram or Google Sheets to get notified of new submissions.</p></div>`}
  `;
}

function openIntegrationModal(projectId) {
  openModal({
    title: 'Add integration',
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
    await IntegrationService.create(projectId, { type: $('#int-type').value, config: { value: $('#int-config').value.trim() } });
    showToast('Integration added.', 'success');
    closeModal();
    await renderProjectDetail(projectId, 'integrations');
  } catch (err) {
    showToast(friendlyError(err, 'Could not add integration — check your plan.'), 'error');
  }
}

async function deleteIntegration(intId, projectId) {
  if (!confirm('Remove this integration?')) return;
  try {
    await IntegrationService.remove(intId);
    showToast('Integration removed.', 'success');
    await renderProjectDetail(projectId, 'integrations');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   Project picker (shared by templates.html / history.html)
   ============================================================ */
async function renderProjectPicker(selectedId) {
  const projects = await ProjectService.list().catch(() => []);
  const remembered = selectedId || localStorage.getItem('emaily_last_project') || projects[0]?.id || '';
  if (remembered) localStorage.setItem('emaily_last_project', remembered);
  return {
    projects,
    selectedId: remembered,
    html: `
      <div class="mb-6 flex items-center gap-3">
        <label class="field-label mb-0" for="project-picker">Project</label>
        <select class="input-glass max-w-xs" id="project-picker">
          ${projects.map((p) => `<option value="${p.id}" ${p.id === remembered ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
    `,
  };
}

/* ============================================================
   PAGE: templates.html
   ============================================================ */
async function initTemplatesPage() {
  const content = $('#page-content');
  content.innerHTML = renderSkeleton();
  const requestedId = new URLSearchParams(location.search).get('project');
  const { projects, selectedId, html: pickerHTML } = await renderProjectPicker(requestedId);

  if (!projects.length) {
    content.innerHTML = emptyState('No projects yet', 'Create a project first, then come back to add templates.', 'Create project', () => redirectTo('projects'));
    return;
  }

  content.innerHTML = `
    <div class="flex items-center justify-between mb-2"><h1 class="font-display text-2xl font-bold">Templates</h1><button class="btn btn-aurora btn-sm" data-action="open-template-modal" data-project-id="${selectedId}">+ New template</button></div>
    ${pickerHTML}
    <div id="templates-list">${await templatesListHTML(selectedId)}</div>
  `;
}

async function templatesListHTML(projectId) {
  const templates = await TemplateService.list(projectId).catch(() => []);
  return templates.length ? `<div class="space-y-3">${templates.map((t) => `
    <div class="glass glass-card p-5 flex items-center justify-between">
      <div><p class="font-semibold text-sm">${escapeHtml(t.name)}</p><p class="text-tertiary text-xs mt-1">${escapeHtml(t.subject || '')}</p></div>
      <button class="btn btn-icon btn-danger" data-action="delete-template" data-id="${t.id}" data-project-id="${projectId}" aria-label="Delete template">${ICONS.trash}</button>
    </div>`).join('')}</div>` : `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No templates yet</p><p class="text-secondary text-sm">Create an HTML template that submissions can render into.</p></div>`;
}

function openTemplateModal(projectId) {
  openModal({
    title: 'New template',
    bodyHTML: `
      <div class="space-y-4">
        <div><label class="field-label">Name</label><input class="input-glass" id="tpl-name" placeholder="contact-form" required /></div>
        <div><label class="field-label">Subject</label><input class="input-glass" id="tpl-subject" placeholder="New message from {{name}}" /></div>
        <div><label class="field-label">HTML</label><textarea class="input-glass font-mono" id="tpl-html" placeholder="<h1>New submission</h1>"></textarea></div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-template" data-project-id="${projectId}">Create template</button>`,
  });
}

async function submitTemplate(projectId) {
  const name = $('#tpl-name').value.trim();
  if (!name) return showToast('Give the template a name.', 'error');
  try {
    await TemplateService.create(projectId, { name, subject: $('#tpl-subject').value.trim(), html: $('#tpl-html').value });
    showToast('Template created.', 'success');
    closeModal();
    $('#templates-list').innerHTML = await templatesListHTML(projectId);
  } catch (err) {
    showToast(friendlyError(err, 'Could not create template — check your plan limits.'), 'error');
  }
}

async function deleteTemplate(templateId, projectId) {
  if (!confirm('Delete this template?')) return;
  try {
    await TemplateService.remove(templateId);
    showToast('Template deleted.', 'success');
    $('#templates-list').innerHTML = await templatesListHTML(projectId);
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   PAGE: history.html
   ============================================================ */
let historyPage = 1;

async function initHistoryPage() {
  historyPage = 1;
  const content = $('#page-content');
  content.innerHTML = renderSkeleton();
  const requestedId = new URLSearchParams(location.search).get('project');
  const { projects, selectedId, html: pickerHTML } = await renderProjectPicker(requestedId);

  if (!projects.length) {
    content.innerHTML = emptyState('No projects yet', 'Create a project first to see submission history.', 'Create project', () => redirectTo('projects'));
    return;
  }

  content.innerHTML = `<h1 class="font-display text-2xl font-bold mb-2">History</h1>${pickerHTML}<div id="history-list">${await historyListHTML(selectedId)}</div>`;
}

function statusPillClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'sent' || s === 'resent') return 'is-success';
  if (s === 'failed') return 'is-danger';
  if (s === 'pending') return 'is-warning';
  return 'is-neutral';
}

async function historyListHTML(projectId) {
  const res = await SubmissionService.listByProject(projectId, { page: historyPage, pageSize: 20 }).catch(() => ({ items: [] }));
  const items = res.items || [];
  if (!items.length) return `<div class="glass glass-panel p-10 text-center"><p class="font-display font-semibold mb-2">No submissions yet</p><p class="text-secondary text-sm">Submissions will appear here as soon as your form starts posting.</p></div>`;
  return `
    <div class="space-y-2">${items.map((s) => `
      <div class="glass glass-card p-4 flex items-center justify-between cursor-pointer" data-action="view-submission" data-id="${s.id}" data-project-id="${projectId}">
        <div class="flex items-center gap-3"><span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || 'Unknown')}</span><span class="text-sm">${escapeHtml(s.recipient || '—')}</span></div>
        <span class="text-tertiary text-xs font-mono">${formatDate(s.createdAt)}</span>
      </div>`).join('')}</div>
    <div class="flex justify-center gap-3 mt-6">
      <button class="btn btn-ghost btn-sm" data-action="history-page" data-project-id="${projectId}" data-dir="-1" ${historyPage <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="text-tertiary text-xs self-center">Page ${historyPage}</span>
      <button class="btn btn-ghost btn-sm" data-action="history-page" data-project-id="${projectId}" data-dir="1">Next</button>
    </div>
  `;
}

async function viewSubmission(id, projectId) {
  try {
    const s = await SubmissionService.getById(id);
    openModal({
      title: 'Submission detail',
      bodyHTML: `
        <div class="space-y-3 text-sm">
          <div class="flex justify-between"><span class="text-tertiary">Status</span><span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || '—')}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Recipient</span><span class="font-mono">${escapeHtml(s.recipient || '—')}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Date</span><span>${formatDate(s.createdAt)}</span></div>
          ${s.errorMessage ? `<div><p class="text-tertiary mb-1">Error</p><p class="code-block">${escapeHtml(s.errorMessage)}</p></div>` : ''}
          ${s.aiSummary ? `<div><p class="text-tertiary mb-1">AI summary</p><p class="text-secondary">${escapeHtml(s.aiSummary)}</p></div>` : ''}
        </div>
      `,
      footerHTML: (s.status || '').toLowerCase() === 'failed' ? `<button class="btn btn-aurora" data-action="retry-submission" data-id="${s.id}" data-project-id="${projectId}">Retry send</button>` : '',
    });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function retrySubmission(id, projectId) {
  try {
    await SubmissionService.retry(id);
    showToast('Retry queued.', 'success');
    closeModal();
    $('#history-list').innerHTML = await historyListHTML(projectId);
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   PAGE: billing.html
   ============================================================ */
async function initBillingPage() {
  const content = $('#page-content');
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
        ${plans.map((p) => `
          <div class="glass glass-card p-6" ${subscription?.planId === p.id ? `style="border-color: var(--aurora-cyan)"` : ''}>
            <p class="font-display font-semibold mb-1">${escapeHtml(p.name)}</p>
            <p class="text-2xl font-display font-bold mb-4">$${escapeHtml(p.price)}<span class="text-xs text-tertiary font-body">/mo</span></p>
            <ul class="text-xs text-secondary space-y-1 mb-5">
              <li>${p.maxProjects} projects</li><li>${p.maxTemplates} templates</li><li>${p.maxEmailsPerMonth.toLocaleString()} emails/mo</li>
            </ul>
            <button class="btn ${subscription?.planId === p.id ? 'btn-ghost' : 'btn-aurora'} btn-sm w-full justify-center" data-action="subscribe-plan" data-id="${p.id}" ${subscription?.planId === p.id ? 'disabled' : ''}>${subscription?.planId === p.id ? 'Current plan' : 'Choose plan'}</button>
          </div>`).join('')}
      </div>
      <h2 class="font-display font-semibold text-lg mb-4">Invoices</h2>
      ${invoices.length ? `<div class="space-y-2">${invoices.map((inv) => `<div class="glass glass-card p-4 flex items-center justify-between"><span class="text-sm">${formatDate(inv.date)}</span><a class="btn btn-ghost btn-sm" href="${inv.pdfUrl}" target="_blank" rel="noopener">Download PDF</a></div>`).join('')}</div>` : `<p class="text-tertiary text-sm">No invoices yet.</p>`}
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

async function subscribeToPlan(planId) {
  try {
    await BillingService.subscribe(planId);
    showToast('Subscription updated.', 'success');
    await initBillingPage();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   PAGE: account.html
   ============================================================ */
async function initAccountPage(user) {
  $('#page-content').innerHTML = `
    <h1 class="font-display text-2xl font-bold mb-1">Account</h1>
    <p class="text-secondary text-sm mb-8">Update your profile details.</p>
    <div class="glass glass-card p-6 max-w-md">
      <form id="form-account" class="space-y-4">
        <div><label class="field-label" for="account-name">Name</label><input class="input-glass" id="account-name" value="${escapeHtml(user.name || '')}" /></div>
        <div><label class="field-label" for="account-notify-email">Notification email</label><input class="input-glass" id="account-notify-email" value="${escapeHtml(user.notificationEmail || user.email || '')}" /></div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
  `;
}

async function saveAccount() {
  try {
    await UserService.updateMe({ name: $('#account-name').value.trim(), notificationEmail: $('#account-notify-email').value.trim() });
    showToast('Profile updated.', 'success');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   PAGE: admin/index.html
   ============================================================ */
async function initAdminDashboardPage() {
  const content = $('#page-content');
  content.innerHTML = renderSkeleton();
  try {
    const stats = await AdminService.getDashboard();
    const cards = [
      ['Total users', stats.totalUsers], ['Active users', stats.activeUsers], ['Active projects', stats.totalProjects],
      ['Revenue', `$${stats.totalRevenue}`], ['Pending submissions', stats.pendingSubmissions], ['Failed submissions', stats.failedSubmissions],
    ];
    content.innerHTML = `
      <h1 class="font-display text-2xl font-bold mb-1">Admin overview</h1>
      <p class="text-secondary text-sm mb-8">System-wide stats across all Emaily accounts.</p>
      <div class="grid sm:grid-cols-3 gap-5">${cards.map(([label, val]) => `<div class="glass glass-card p-6"><p class="text-tertiary text-xs uppercase tracking-wide mb-2">${label}</p><p class="font-display text-3xl font-bold">${val}</p></div>`).join('')}</div>
    `;
  } catch (err) {
    content.innerHTML = errorPanel(err);
  }
}

/* ============================================================
   PAGE: admin/users.html
   ============================================================ */
async function renderAdminUsers(search = '') {
  const users = await AdminService.listUsers(search ? `?search=${encodeURIComponent(search)}` : '');
  return `
    <table class="data-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Missing emails</th><th>Joined</th><th></th></tr></thead>
      <tbody>${users.map((u) => `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td class="font-mono text-xs">${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.roles)}</td>
          <td><span class="status-pill ${u.isActive ? 'is-success' : 'is-danger'}">${u.isActive ? 'Active' : 'Suspended'}</span></td>
          <td>${escapeHtml(u.missingEmails)}</td>
          <td class="text-tertiary text-xs">${formatDate(u.createdAt)}</td>
          <td class="text-right whitespace-nowrap">
            <button class="btn btn-ghost btn-sm" data-action="edit-quota" data-id="${u.id}" data-current="${u.missingEmails}">Quota</button>
            <button class="btn ${u.isActive ? 'btn-danger' : 'btn-ghost'} btn-sm" data-action="toggle-user-status" data-id="${u.id}" data-active="${u.isActive}">${u.isActive ? 'Suspend' : 'Activate'}</button>
          </td>
        </tr>`).join('')}</tbody>
    </table>
  `;
}

async function initAdminUsersPage() {
  const content = $('#page-content');
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
    showToast(currentlyActive ? 'User suspended.' : 'User reactivated.', 'success');
    $('#users-table').innerHTML = await renderAdminUsers($('#user-search')?.value.trim() || '');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

function openQuotaModal(userId, current) {
  openModal({
    title: 'Adjust missing-emails quota',
    bodyHTML: `<label class="field-label" for="quota-value">Missing emails</label><input class="input-glass" id="quota-value" type="number" min="0" value="${current}" />`,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-quota" data-id="${userId}">Save</button>`,
  });
}

async function submitQuota(userId) {
  try {
    await AdminService.setUserQuota(userId, Number($('#quota-value').value) || 0);
    showToast('Quota updated.', 'success');
    closeModal();
    $('#users-table').innerHTML = await renderAdminUsers($('#user-search')?.value.trim() || '');
  } catch (err) {
    showToast(friendlyError(err), 'error');
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
      <tbody>${rows.map((b) => `
        <tr><td class="font-mono text-xs">${escapeHtml(b.id)}</td><td>${escapeHtml(b.violationCount)}</td><td class="text-tertiary text-xs">${formatDate(b.bannedUntil)}</td>
        <td class="text-right"><button class="btn btn-icon btn-danger" data-action="delete-banned" data-id="${encodeURIComponent(b.id)}" aria-label="Remove ban">${ICONS.trash}</button></td></tr>`).join('')}</tbody>
    </table>
  `;
}

async function initAdminBannedPage() {
  const content = $('#page-content');
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
    title: 'Ban an IP or email',
    bodyHTML: `
      <div class="space-y-4">
        <div><label class="field-label">IP address or email</label><input class="input-glass" id="ban-value" placeholder="203.0.113.7 or [email protected]" /></div>
        <div><label class="field-label">Violation count (1–8)</label><input class="input-glass" id="ban-violations" type="number" min="1" max="8" value="1" /></div>
        <div><label class="field-label">Banned until</label><input class="input-glass" id="ban-until" type="date" /></div>
      </div>
    `,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-ban">Ban</button>`,
  });
}

async function submitBan() {
  const value = $('#ban-value').value.trim();
  const violationCount = Number($('#ban-violations').value) || 1;
  const bannedUntilRaw = $('#ban-until').value;
  if (!value) return showToast('Enter an IP or email.', 'error');
  try {
    await AdminService.addBanned({ value, violationCount, bannedUntil: bannedUntilRaw ? new Date(bannedUntilRaw).toISOString() : undefined });
    showToast('Ban added.', 'success');
    closeModal();
    $('#banned-table').innerHTML = await renderBannedTable();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function deleteBanned(id) {
  if (!confirm('Remove this ban?')) return;
  try {
    await AdminService.removeBanned(id);
    showToast('Ban removed.', 'success');
    $('#banned-table').innerHTML = await renderBannedTable();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
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
      ${plans.map((p) => `
        <div class="glass glass-card p-6">
          <p class="font-display font-semibold mb-1">${escapeHtml(p.name)}</p>
          <p class="text-2xl font-display font-bold mb-3">$${escapeHtml(p.price)}<span class="text-xs text-tertiary font-body">/mo</span></p>
          <ul class="text-xs text-secondary space-y-1 mb-5">
            <li>${p.maxProjects} projects · ${p.maxServices} services · ${p.maxTemplates} templates</li>
            <li>${p.maxEmailsPerMonth.toLocaleString()} emails/mo</li>
            <li>${[p.canUseGoogleSheets && 'Sheets', p.canUseAI && 'AI', p.canUseTelegramBot && 'Telegram'].filter(Boolean).join(', ') || 'No add-ons'}</li>
          </ul>
          <button class="btn btn-ghost btn-sm w-full justify-center" data-action="edit-plan" data-plan='${escapeHtml(JSON.stringify(p))}'>Edit</button>
        </div>`).join('')}
    </div>
  `;
}

async function initAdminPlansPage() {
  const content = $('#page-content');
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
    <input type="hidden" id="plan-id" value="${p.id || ''}" />
    <div class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Name</label><input class="input-glass" id="plan-name" value="${escapeHtml(p.name || '')}" /></div>
      <div><label class="field-label">Price ($/mo)</label><input class="input-glass" id="plan-price" type="number" min="0" value="${p.price ?? 0}" /></div>
    </div>
    <div class="grid grid-cols-3 gap-3 mt-4">
      <div><label class="field-label">Max projects</label><input class="input-glass" id="plan-max-projects" type="number" min="1" value="${p.maxProjects ?? 1}" /></div>
      <div><label class="field-label">Max services</label><input class="input-glass" id="plan-max-services" type="number" min="1" value="${p.maxServices ?? 1}" /></div>
      <div><label class="field-label">Max templates</label><input class="input-glass" id="plan-max-templates" type="number" min="1" value="${p.maxTemplates ?? 1}" /></div>
    </div>
    <div class="mt-4"><label class="field-label">Max emails / month</label><input class="input-glass" id="plan-max-emails" type="number" min="0" value="${p.maxEmailsPerMonth ?? 0}" /></div>
    <div class="flex items-center gap-6 mt-5">
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-sheets" ${p.canUseGoogleSheets ? 'checked' : ''}/> Google Sheets</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-ai" ${p.canUseAI ? 'checked' : ''}/> AI summaries</label>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox-glass" id="plan-telegram" ${p.canUseTelegramBot ? 'checked' : ''}/> Telegram</label>
    </div>
  `;
}

function openPlanModal(plan = null) {
  openModal({
    title: plan ? `Edit ${plan.name}` : 'New plan',
    bodyHTML: `<div class="space-y-1">${planFormFields(plan || {})}</div>`,
    footerHTML: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-aurora" data-action="submit-plan">Save plan</button>`,
  });
}

async function submitPlan() {
  const id = $('#plan-id').value || undefined;
  try {
    await AdminService.createOrUpdatePlan({
      id,
      name: $('#plan-name').value.trim(),
      price: Number($('#plan-price').value) || 0,
      maxProjects: Number($('#plan-max-projects').value) || 1,
      maxServices: Number($('#plan-max-services').value) || 1,
      maxTemplates: Number($('#plan-max-templates').value) || 1,
      maxEmailsPerMonth: Number($('#plan-max-emails').value) || 0,
      canUseGoogleSheets: $('#plan-sheets').checked,
      canUseAI: $('#plan-ai').checked,
      canUseTelegramBot: $('#plan-telegram').checked,
    });
    showToast(id ? 'Plan updated.' : 'Plan created.', 'success');
    closeModal();
    $('#plans-grid').innerHTML = await renderPlansGrid();
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   Event delegation — clicks
   ============================================================ */
document.addEventListener('click', async (e) => {
  if (e.target.id === 'modal-root') return closeModal();

  const target = e.target.closest('[data-action]');
  if (!target) return;
  const a = target.dataset.action;

  switch (a) {
    case 'close-modal': return closeModal();
    case 'logout': return handleLogout();
    case 'forgot-password': return handleForgotPassword();
    case 'submit-forgot-password': return submitForgotPassword();

    case 'open-project-modal': return openProjectModal();
    case 'submit-project': return submitProject();
    case 'delete-project': return deleteProjectAndRedirect(target.dataset.id);
    case 'set-project-tab': {
      const url = new URL(location.href);
      url.searchParams.set('id', target.dataset.projectId);
      url.searchParams.set('tab', target.dataset.tab);
      history.pushState({}, '', url);
      return renderProjectDetail(target.dataset.projectId, target.dataset.tab);
    }
    case 'regenerate-keys': return regenerateKeys(target.dataset.id);

    case 'open-service-modal': return openServiceModal(target.dataset.projectId);
    case 'submit-service': return submitService(target.dataset.projectId);
    case 'delete-service': return deleteService(target.dataset.id, target.dataset.projectId);

    case 'open-integration-modal': return openIntegrationModal(target.dataset.projectId);
    case 'submit-integration': return submitIntegration(target.dataset.projectId);
    case 'delete-integration': return deleteIntegration(target.dataset.id, target.dataset.projectId);

    case 'open-template-modal': return openTemplateModal(target.dataset.projectId);
    case 'submit-template': return submitTemplate(target.dataset.projectId);
    case 'delete-template': return deleteTemplate(target.dataset.id, target.dataset.projectId);

    case 'view-submission': return viewSubmission(target.dataset.id, target.dataset.projectId);
    case 'retry-submission': return retrySubmission(target.dataset.id, target.dataset.projectId);
    case 'history-page': {
      historyPage = Math.max(1, historyPage + Number(target.dataset.dir));
      $('#history-list').innerHTML = await historyListHTML(target.dataset.projectId);
      return;
    }

    case 'subscribe-plan': return subscribeToPlan(target.dataset.id);

    case 'edit-quota': return openQuotaModal(target.dataset.id, target.dataset.current);
    case 'submit-quota': return submitQuota(target.dataset.id);
    case 'toggle-user-status': return toggleUserStatus(target.dataset.id, target.dataset.active === 'true');

    case 'open-ban-modal': return openBanModal();
    case 'submit-ban': return submitBan();
    case 'delete-banned': return deleteBanned(target.dataset.id);

    case 'open-plan-modal': return openPlanModal();
    case 'edit-plan': return openPlanModal(JSON.parse(target.dataset.plan));
    case 'submit-plan': return submitPlan();

    default: return;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'project-picker') {
    const url = new URL(location.href);
    url.searchParams.set('project', e.target.value);
    location.href = url.toString();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'user-search') {
    clearTimeout(window.__userSearchDebounce);
    window.__userSearchDebounce = setTimeout(async () => {
      const table = $('#users-table');
      if (table) table.innerHTML = await renderAdminUsers(e.target.value.trim());
    }, 300);
  }
});

/* ============================================================
   Event delegation — form submits
   ============================================================ */
document.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === 'form-login') return handleLogin(form);
  if (form.id === 'form-register') return handleRegister(form);
  if (form.id === 'form-account') return saveAccount();
  if (form.id === 'form-project-settings') return saveProjectSettings(form.dataset.id);
});

/* ============================================================
   Boot
   ============================================================ */
const PAGE_INIT = {
  dashboard: initDashboardPage,
  projects: initProjectsPage,
  templates: initTemplatesPage,
  history: initHistoryPage,
  billing: initBillingPage,
  account: initAccountPage,
  'admin-dashboard': initAdminDashboardPage,
  'admin-users': initAdminUsersPage,
  'admin-banned': initAdminBannedPage,
  'admin-plans': initAdminPlansPage,
};

const PUBLIC_ONLY_PAGE_INIT = { login: initLoginPage, register: initRegisterPage };

document.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;

  if (PUBLIC_ONLY_PAGE_INIT[page]) {
    return PUBLIC_ONLY_PAGE_INIT[page]();
  }

  if (page === 'landing') {
    return; // fully static/public, no auth guard, no shell to mount
  }

  const user = await mountAppShell(page);
  if (!user) return; // mountAppShell already redirected
  const init = PAGE_INIT[page];
  if (init) await init(user);
});
