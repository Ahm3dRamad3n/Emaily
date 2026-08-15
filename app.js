/* ============================================================
   EMAILY — app.js
   DOM rendering, view routing, and UI state. All backend calls
   go through the services exported from api.js.

   NOTE ON DATA SHAPES: the endpoint list defines the routes and
   auth rules, not the exact DTO field names your C# API returns.
   The render functions below assume reasonable field names
   (e.g. project.publicApiKey, template.html, submission.status).
   Adjust the small number of `p.fieldName` reads if your DTOs
   differ — everything else (routing, wrapper, event wiring)
   stays the same.
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
  tokenStore,
} from './api.js';

/* ============================================================
   State
   ============================================================ */
const state = {
  user: null,
  projects: [],
  currentProjectId: null,
  currentDashTab: 'overview',
  submissionsPage: 1,
};

/* ============================================================
   Small helpers
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function currentProject() {
  return state.projects.find((p) => p.id === state.currentProjectId) || null;
}

/* ============================================================
   Toasts
   ============================================================ */
function showToast(message, type = 'info') {
  const container = $('#toast-container');
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

function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  return (err && err.message) || fallback;
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

/* ============================================================
   View routing
   ============================================================ */
function showView(viewId) {
  $$('[data-view]').forEach((v) => v.classList.add('hidden'));
  $(`#${viewId}`).classList.remove('hidden');
  window.scrollTo({ top: 0 });
}

function setAuthedNav(user) {
  const guest = $('#nav-guest-actions');
  const authed = $('#nav-user-actions');
  if (user) {
    guest.classList.add('hidden');
    authed.classList.remove('hidden');
    authed.classList.add('flex');
    $('#nav-user-email').textContent = user.email || '';
  } else {
    guest.classList.remove('hidden');
    authed.classList.add('hidden');
    authed.classList.remove('flex');
  }
}

function showAuthView(tab = 'login') {
  showView('view-auth');
  setAuthTab(tab);
}

function setAuthTab(tab) {
  $$('[data-auth-tab]').forEach((btn) => {
    const active = btn.dataset.authTab === tab;
    btn.classList.toggle('btn-aurora', active);
    btn.classList.toggle('btn-ghost', !active);
  });
  $('#form-login').classList.toggle('hidden', tab !== 'login');
  $('#form-register').classList.toggle('hidden', tab !== 'register');
  $$('.field-error').forEach((e) => e.classList.add('hidden'));
}

async function goToDashboard() {
  showView('view-dashboard');
  await setDashTab(state.currentDashTab || 'overview');
}

/* ============================================================
   Auth flows
   ============================================================ */
async function handleLogin(form) {
  const btn = $('button[type="submit"]', form);
  const errorEl = $('[data-error-for="login"]');
  errorEl.classList.add('hidden');
  setBtnLoading(btn, true, 'Signing in…');
  try {
    await AuthService.login({
      email: $('#login-email').value.trim(),
      password: $('#login-password').value,
    });
    await loadCurrentUser();
    showToast('Welcome back.', 'success');
    await goToDashboard();
    form.reset();
  } catch (err) {
    errorEl.textContent = friendlyError(err, 'Could not sign in with those details.');
    errorEl.classList.remove('hidden');
  } finally {
    setBtnLoading(btn, false, 'Sign in');
  }
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
    form.reset();
    setAuthTab('login');
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
  try {
    await AuthService.logout();
  } catch {
    /* token may already be invalid — clear locally regardless */
  }
  state.user = null;
  state.projects = [];
  setAuthedNav(null);
  showToast('Signed out.', 'info');
  showView('view-landing');
}

async function loadCurrentUser() {
  const user = await UserService.getMe();
  state.user = user;
  setAuthedNav(user);
  return user;
}

async function bootSession() {
  if (!tokenStore.getAccessToken()) {
    showView('view-landing');
    return;
  }
  try {
    await loadCurrentUser();
    await goToDashboard();
  } catch {
    tokenStore.clear();
    showView('view-landing');
  }
}

window.addEventListener('emaily:session-expired', () => {
  state.user = null;
  setAuthedNav(null);
  showToast('Your session expired — please sign in again.', 'error');
  showAuthView('login');
});

function setBtnLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> ${escapeHtml(label)}`
    : escapeHtml(label);
}

/* ============================================================
   Dashboard: tab switching
   ============================================================ */
async function setDashTab(tab, opts = {}) {
  state.currentDashTab = tab;
  $$('.sidebar-link[data-dash-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.dashTab === tab);
  });

  const content = $('#dashboard-content');
  content.innerHTML = renderSkeleton();

  try {
    if (tab === 'overview') content.innerHTML = await buildOverview();
    else if (tab === 'projects') content.innerHTML = await buildProjectsList();
    else if (tab === 'project-detail') content.innerHTML = await buildProjectDetail(opts.projectId, opts.tab);
    else if (tab === 'billing') content.innerHTML = await buildBilling();
    else if (tab === 'account') content.innerHTML = await buildAccount();
  } catch (err) {
    content.innerHTML = `<div class="glass glass-panel p-8 text-center">
      <p class="text-secondary">${escapeHtml(friendlyError(err, 'Could not load this section.'))}</p>
    </div>`;
  }
}

function renderSkeleton() {
  return `<div class="space-y-4">
    <div class="skeleton h-8 w-1/3"></div>
    <div class="skeleton h-32 w-full"></div>
    <div class="skeleton h-32 w-full"></div>
  </div>`;
}

/* ============================================================
   Dashboard: Overview
   ============================================================ */
async function buildOverview() {
  const [projects, subscription] = await Promise.all([
    ProjectService.list().catch(() => []),
    BillingService.getSubscription().catch(() => null),
  ]);
  state.projects = projects || [];

  const missing = state.user?.missingEmails ?? state.user?.MissingEmails ?? '—';
  const planName = subscription?.planName || subscription?.plan?.name || 'No active plan';

  return `
    <h1 class="font-display text-2xl font-bold mb-1">Welcome back${state.user?.name ? ', ' + escapeHtml(state.user.name) : ''}.</h1>
    <p class="text-secondary mb-8 text-sm">Here's what's happening across your Emaily account.</p>

    <div class="grid sm:grid-cols-3 gap-5 mb-10">
      <div class="glass glass-card p-6">
        <p class="text-tertiary text-xs uppercase tracking-wide mb-2">Active projects</p>
        <p class="font-display text-3xl font-bold">${state.projects.length}</p>
      </div>
      <div class="glass glass-card p-6">
        <p class="text-tertiary text-xs uppercase tracking-wide mb-2">Current plan</p>
        <p class="font-display text-3xl font-bold">${escapeHtml(planName)}</p>
      </div>
      <div class="glass glass-card p-6">
        <p class="text-tertiary text-xs uppercase tracking-wide mb-2">Missing emails</p>
        <p class="font-display text-3xl font-bold">${escapeHtml(missing)}</p>
      </div>
    </div>

    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display font-semibold text-lg">Recent projects</h2>
      <button class="btn btn-ghost btn-sm" data-action="set-dash-tab" data-tab="projects">View all</button>
    </div>
    ${state.projects.length ? `<div class="grid sm:grid-cols-2 gap-4">${state.projects.slice(0, 4).map(projectCard).join('')}</div>` : emptyState('No projects yet', 'Create your first project to get a public API key.', 'Create project', 'open-project-modal')}
  `;
}

/* ============================================================
   Dashboard: Projects list
   ============================================================ */
async function buildProjectsList() {
  const projects = await ProjectService.list();
  state.projects = projects || [];

  return `
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="font-display text-2xl font-bold">Projects</h1>
        <p class="text-secondary text-sm">Each project has its own API keys, templates, and services.</p>
      </div>
      <button class="btn btn-aurora btn-sm" data-action="open-project-modal">+ New project</button>
    </div>
    ${state.projects.length
      ? `<div class="grid sm:grid-cols-2 gap-4">${state.projects.map(projectCard).join('')}</div>`
      : emptyState('No projects yet', 'Create your first project to get a public API key.', 'Create project', 'open-project-modal')}
  `;
}

function projectCard(p) {
  const domains = p.domains || p.restrictedDomains || [];
  return `
    <div class="glass glass-card p-6 cursor-pointer" data-action="open-project" data-id="${p.id}">
      <div class="flex items-start justify-between mb-3">
        <h3 class="font-display font-semibold">${escapeHtml(p.name)}</h3>
        <span class="status-pill ${p.isActive === false ? 'is-danger' : 'is-success'}">${p.isActive === false ? 'Inactive' : 'Active'}</span>
      </div>
      <p class="text-tertiary text-xs font-mono mb-4">${domains.length ? escapeHtml(domains.join(', ')) : 'No domain restriction'}</p>
      <p class="text-tertiary text-xs">Created ${formatDate(p.createdAt)}</p>
    </div>
  `;
}

function openProjectModal() {
  openModal({
    title: 'New project',
    bodyHTML: `
      <div class="space-y-4">
        <div>
          <label class="field-label" for="project-name">Project name</label>
          <input class="input-glass" id="project-name" placeholder="Marketing site" required />
        </div>
        <div>
          <label class="field-label" for="project-domains">Allowed domains (comma-separated, optional)</label>
          <input class="input-glass" id="project-domains" placeholder="example.com, app.example.com" />
        </div>
      </div>
    `,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-aurora" data-action="submit-project">Create project</button>
    `,
  });
}

async function submitProject() {
  const name = $('#project-name').value.trim();
  const domainsRaw = $('#project-domains').value.trim();
  if (!name) return showToast('Give the project a name.', 'error');
  try {
    await ProjectService.create({
      name,
      domains: domainsRaw ? domainsRaw.split(',').map((d) => d.trim()).filter(Boolean) : [],
    });
    showToast('Project created.', 'success');
    closeModal();
    await setDashTab('projects');
  } catch (err) {
    showToast(friendlyError(err, 'Could not create project — check your plan limits.'), 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  try {
    await ProjectService.remove(id);
    showToast('Project deleted.', 'success');
    await setDashTab('projects');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   Dashboard: Project detail (Keys / Services / Templates / Submissions)
   ============================================================ */
async function buildProjectDetail(projectId, tab = 'keys') {
  const project = await ProjectService.getById(projectId);
  state.currentProjectId = projectId;

  const tabs = [
    ['keys', 'Keys'],
    ['services', 'Services'],
    ['templates', 'Templates'],
    ['submissions', 'Submissions'],
  ];

  let panel = '';
  if (tab === 'keys') panel = renderKeysTab(project);
  else if (tab === 'services') panel = await renderServicesTab(projectId);
  else if (tab === 'templates') panel = await renderTemplatesTab(projectId);
  else if (tab === 'submissions') panel = await renderSubmissionsTab(projectId);

  return `
    <button class="btn btn-ghost btn-sm mb-5" data-action="set-dash-tab" data-tab="projects">
      ← All projects
    </button>
    <div class="flex items-start justify-between mb-6">
      <div>
        <h1 class="font-display text-2xl font-bold">${escapeHtml(project.name)}</h1>
        <p class="text-tertiary text-xs font-mono mt-1">${(project.domains || []).join(', ') || 'No domain restriction'}</p>
      </div>
      <button class="btn btn-danger btn-sm" data-action="delete-project" data-id="${project.id}">Delete project</button>
    </div>

    <div class="flex gap-1 mb-6 border-b" style="border-color: var(--glass-border)">
      ${tabs.map(([key, label]) => `
        <button class="tab-btn ${tab === key ? 'is-active' : ''}" data-action="set-project-tab" data-project-id="${project.id}" data-tab="${key}">
          ${label}
        </button>
      `).join('')}
    </div>

    <div id="project-tab-panel">${panel}</div>
  `;
}

function renderKeysTab(project) {
  return `
    <div class="glass glass-card p-6 mb-6">
      <h3 class="font-display font-semibold mb-4">API keys</h3>
      <div class="space-y-3">
        <div>
          <p class="text-tertiary text-xs mb-1">Public key — used in <code class="font-mono">/api/submit/{key}</code></p>
          <p class="api-key-chip">${escapeHtml(project.publicApiKey || '—')}</p>
        </div>
        <div>
          <p class="text-tertiary text-xs mb-1">Private key — server-to-server calls</p>
          <p class="api-key-chip">${escapeHtml(project.privateApiKey || '—')}</p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm mt-5" data-action="regenerate-keys" data-id="${project.id}">
        Regenerate keys
      </button>
    </div>

    <div class="glass glass-card p-6">
      <h3 class="font-display font-semibold mb-4">Project settings</h3>
      <form id="form-project-settings" data-id="${project.id}" class="space-y-4">
        <div>
          <label class="field-label" for="settings-name">Name</label>
          <input class="input-glass" id="settings-name" value="${escapeHtml(project.name)}" />
        </div>
        <div>
          <label class="field-label" for="settings-domains">Allowed domains</label>
          <input class="input-glass" id="settings-domains" value="${escapeHtml((project.domains || []).join(', '))}" />
        </div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
  `;
}

async function renderServicesTab(projectId) {
  const services = await ServiceService.list(projectId).catch(() => []);
  return `
    <div class="flex justify-end mb-4">
      <button class="btn btn-aurora btn-sm" data-action="open-service-modal" data-project-id="${projectId}">+ Add service</button>
    </div>
    ${services.length ? `<div class="space-y-3">${services.map((s) => `
      <div class="glass glass-card p-5 flex items-center justify-between">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(s.provider || s.host || 'SMTP service')}</p>
          <p class="text-tertiary text-xs font-mono mt-1">${escapeHtml(s.fromEmail || s.username || '')}</p>
        </div>
        <button class="btn btn-icon btn-danger" data-action="delete-service" data-id="${s.id}" data-project-id="${projectId}" aria-label="Remove service">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `).join('')}</div>` : emptyState('No sending services', 'Connect an SMTP service so Emaily can deliver mail for this project.', 'Add service', 'open-service-modal', projectId)}
  `;
}

function openServiceModal(projectId) {
  openModal({
    title: 'Add SMTP service',
    bodyHTML: `
      <div class="space-y-4">
        <div><label class="field-label">Host</label><input class="input-glass" id="svc-host" placeholder="smtp.mailprovider.com" required /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Port</label><input class="input-glass" id="svc-port" placeholder="587" /></div>
          <div><label class="field-label">From email</label><input class="input-glass" id="svc-from" placeholder="[email protected]" /></div>
        </div>
        <div><label class="field-label">Username</label><input class="input-glass" id="svc-username" /></div>
        <div><label class="field-label">Password</label><input class="input-glass" type="password" id="svc-password" /></div>
      </div>
    `,
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-aurora" data-action="submit-service" data-project-id="${projectId}">Add service</button>
    `,
  });
}

async function submitService(projectId) {
  try {
    await ServiceService.create(projectId, {
      host: $('#svc-host').value.trim(),
      port: Number($('#svc-port').value) || undefined,
      fromEmail: $('#svc-from').value.trim(),
      username: $('#svc-username').value.trim(),
      password: $('#svc-password').value,
    });
    showToast('Service added.', 'success');
    closeModal();
    await setDashTab('project-detail', { projectId, tab: 'services' });
  } catch (err) {
    showToast(friendlyError(err, 'Could not add service — check your plan limits.'), 'error');
  }
}

async function deleteService(serviceId, projectId) {
  if (!confirm('Remove this service?')) return;
  try {
    await ServiceService.remove(serviceId);
    showToast('Service removed.', 'success');
    await setDashTab('project-detail', { projectId, tab: 'services' });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function renderTemplatesTab(projectId) {
  const templates = await TemplateService.list(projectId).catch(() => []);
  return `
    <div class="flex justify-end mb-4">
      <button class="btn btn-aurora btn-sm" data-action="open-template-modal" data-project-id="${projectId}">+ New template</button>
    </div>
    ${templates.length ? `<div class="space-y-3">${templates.map((t) => `
      <div class="glass glass-card p-5 flex items-center justify-between">
        <div>
          <p class="font-semibold text-sm">${escapeHtml(t.name)}</p>
          <p class="text-tertiary text-xs mt-1">${escapeHtml(t.subject || '')}</p>
        </div>
        <button class="btn btn-icon btn-danger" data-action="delete-template" data-id="${t.id}" data-project-id="${projectId}" aria-label="Delete template">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `).join('')}</div>` : emptyState('No templates yet', 'Create an HTML template that submissions can render into.', 'New template', 'open-template-modal', projectId)}
  `;
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
    footerHTML: `
      <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn-aurora" data-action="submit-template" data-project-id="${projectId}">Create template</button>
    `,
  });
}

async function submitTemplate(projectId) {
  const name = $('#tpl-name').value.trim();
  if (!name) return showToast('Give the template a name.', 'error');
  try {
    await TemplateService.create(projectId, {
      name,
      subject: $('#tpl-subject').value.trim(),
      html: $('#tpl-html').value,
    });
    showToast('Template created.', 'success');
    closeModal();
    await setDashTab('project-detail', { projectId, tab: 'templates' });
  } catch (err) {
    showToast(friendlyError(err, 'Could not create template — check your plan limits.'), 'error');
  }
}

async function deleteTemplate(templateId, projectId) {
  if (!confirm('Delete this template?')) return;
  try {
    await TemplateService.remove(templateId);
    showToast('Template deleted.', 'success');
    await setDashTab('project-detail', { projectId, tab: 'templates' });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function renderSubmissionsTab(projectId) {
  const page = state.submissionsPage || 1;
  const res = await SubmissionService.listByProject(projectId, { page, pageSize: 20 }).catch(() => ({ items: [] }));
  const items = res.items || res.data || (Array.isArray(res) ? res : []);

  return `
    ${items.length ? `<div class="space-y-2">${items.map((s) => `
      <div class="glass glass-card p-4 flex items-center justify-between cursor-pointer" data-action="view-submission" data-id="${s.id}">
        <div class="flex items-center gap-3">
          <span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || 'Unknown')}</span>
          <span class="text-sm">${escapeHtml(s.recipient || s.to || '—')}</span>
        </div>
        <span class="text-tertiary text-xs font-mono">${formatDate(s.createdAt)}</span>
      </div>
    `).join('')}</div>
    <div class="flex justify-center gap-3 mt-6">
      <button class="btn btn-ghost btn-sm" data-action="submissions-page" data-project-id="${projectId}" data-dir="-1" ${page <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="text-tertiary text-xs self-center">Page ${page}</span>
      <button class="btn btn-ghost btn-sm" data-action="submissions-page" data-project-id="${projectId}" data-dir="1">Next</button>
    </div>
    ` : emptyState('No submissions yet', 'Submissions will appear here as soon as your form starts posting.', null, null)}
  `;
}

function statusPillClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'sent') return 'is-success';
  if (s === 'failed') return 'is-danger';
  if (s === 'pending' || s === 'queued') return 'is-warning';
  return 'is-neutral';
}

async function viewSubmission(id) {
  try {
    const s = await SubmissionService.getById(id);
    openModal({
      title: 'Submission detail',
      bodyHTML: `
        <div class="space-y-3 text-sm">
          <div class="flex justify-between"><span class="text-tertiary">Status</span><span class="status-pill ${statusPillClass(s.status)}">${escapeHtml(s.status || '—')}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Recipient</span><span class="font-mono">${escapeHtml(s.recipient || s.to || '—')}</span></div>
          <div class="flex justify-between"><span class="text-tertiary">Date</span><span>${formatDate(s.createdAt)}</span></div>
          ${s.errorMessage ? `<div><p class="text-tertiary mb-1">Error</p><p class="code-block">${escapeHtml(s.errorMessage)}</p></div>` : ''}
          ${s.aiSummary ? `<div><p class="text-tertiary mb-1">AI summary</p><p class="text-secondary">${escapeHtml(s.aiSummary)}</p></div>` : ''}
        </div>
      `,
      footerHTML: (s.status || '').toLowerCase() === 'failed'
        ? `<button class="btn btn-aurora" data-action="retry-submission" data-id="${s.id}">Retry send</button>`
        : '',
    });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function retrySubmission(id) {
  try {
    await SubmissionService.retry(id);
    showToast('Retry queued.', 'success');
    closeModal();
    await setDashTab('project-detail', { projectId: state.currentProjectId, tab: 'submissions' });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   Dashboard: Billing
   ============================================================ */
async function buildBilling() {
  const [plans, subscription, invoices] = await Promise.all([
    BillingService.getPlans().catch(() => []),
    BillingService.getSubscription().catch(() => null),
    BillingService.getInvoices().catch(() => []),
  ]);

  return `
    <h1 class="font-display text-2xl font-bold mb-1">Billing</h1>
    <p class="text-secondary text-sm mb-8">Manage your plan and download past invoices.</p>

    <div class="grid sm:grid-cols-3 gap-5 mb-10">
      ${(plans || []).map((p) => `
        <div class="glass glass-card p-6 ${subscription?.planId === p.id ? 'border-2' : ''}" ${subscription?.planId === p.id ? `style="border-color: var(--aurora-cyan)"` : ''}>
          <p class="font-display font-semibold mb-1">${escapeHtml(p.name)}</p>
          <p class="text-2xl font-display font-bold mb-4">${p.price !== undefined ? `$${escapeHtml(p.price)}` : ''}</p>
          <button class="btn ${subscription?.planId === p.id ? 'btn-ghost' : 'btn-aurora'} btn-sm w-full justify-center" data-action="subscribe-plan" data-id="${p.id}" ${subscription?.planId === p.id ? 'disabled' : ''}>
            ${subscription?.planId === p.id ? 'Current plan' : 'Choose plan'}
          </button>
        </div>
      `).join('') || `<p class="text-tertiary text-sm">No plans available.</p>`}
    </div>

    <h2 class="font-display font-semibold text-lg mb-4">Invoices</h2>
    ${(invoices || []).length ? `<div class="space-y-2">${invoices.map((inv) => `
      <div class="glass glass-card p-4 flex items-center justify-between">
        <span class="text-sm">${formatDate(inv.date || inv.createdAt)}</span>
        <a class="btn btn-ghost btn-sm" href="${inv.pdfUrl || inv.url || '#'}" target="_blank" rel="noopener">Download PDF</a>
      </div>
    `).join('')}</div>` : `<p class="text-tertiary text-sm">No invoices yet.</p>`}
  `;
}

async function subscribeToPlan(planId) {
  try {
    await BillingService.subscribe(planId);
    showToast('Subscription updated.', 'success');
    await setDashTab('billing');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   Dashboard: Account
   ============================================================ */
async function buildAccount() {
  const user = await UserService.getMe();
  state.user = user;
  return `
    <h1 class="font-display text-2xl font-bold mb-1">Account</h1>
    <p class="text-secondary text-sm mb-8">Update your profile details.</p>
    <div class="glass glass-card p-6 max-w-md">
      <form id="form-account" class="space-y-4">
        <div>
          <label class="field-label" for="account-name">Name</label>
          <input class="input-glass" id="account-name" value="${escapeHtml(user.name || '')}" />
        </div>
        <div>
          <label class="field-label" for="account-notify-email">Notification email</label>
          <input class="input-glass" id="account-notify-email" value="${escapeHtml(user.notificationEmail || user.email || '')}" />
        </div>
        <button type="submit" class="btn btn-aurora btn-sm">Save changes</button>
      </form>
    </div>
  `;
}

async function saveAccount() {
  try {
    await UserService.updateMe({
      name: $('#account-name').value.trim(),
      notificationEmail: $('#account-notify-email').value.trim(),
    });
    showToast('Profile updated.', 'success');
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function saveProjectSettings(projectId) {
  const domainsRaw = $('#settings-domains').value.trim();
  try {
    await ProjectService.update(projectId, {
      name: $('#settings-name').value.trim(),
      domains: domainsRaw ? domainsRaw.split(',').map((d) => d.trim()).filter(Boolean) : [],
    });
    showToast('Project updated.', 'success');
    await setDashTab('project-detail', { projectId, tab: 'keys' });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

async function regenerateKeys(projectId) {
  if (!confirm('Regenerate API keys? Anything using the old keys will stop working immediately.')) return;
  try {
    await ProjectService.regenerateKeys(projectId);
    showToast('Keys regenerated.', 'success');
    await setDashTab('project-detail', { projectId, tab: 'keys' });
  } catch (err) {
    showToast(friendlyError(err), 'error');
  }
}

/* ============================================================
   Empty state helper
   ============================================================ */
function emptyState(title, body, actionLabel, action, actionArg) {
  return `
    <div class="glass glass-panel p-10 text-center">
      <p class="font-display font-semibold mb-2">${escapeHtml(title)}</p>
      <p class="text-secondary text-sm mb-6">${escapeHtml(body)}</p>
      ${actionLabel ? `<button class="btn btn-aurora btn-sm" data-action="${action}" ${actionArg ? `data-project-id="${actionArg}"` : ''}>${escapeHtml(actionLabel)}</button>` : ''}
    </div>
  `;
}

/* ============================================================
   Event delegation — clicks
   ============================================================ */
document.addEventListener('click', async (e) => {
  const target = e.target.closest('[data-action]');

  // Modal backdrop close
  if (e.target.id === 'modal-root') return closeModal();

  if (!target) {
    // Sidebar / brand nav (no data-action attribute on these two)
    const brand = e.target.closest('[data-nav="landing"]');
    if (brand) {
      showView('view-landing');
    }
    return;
  }

  const action = target.dataset.action;

  switch (action) {
    case 'show-auth':
      showAuthView(target.dataset.tab || 'login');
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'go-dashboard':
      await goToDashboard();
      break;
    case 'logout':
      await handleLogout();
      break;
    case 'forgot-password':
      handleForgotPassword();
      break;
    case 'submit-forgot-password':
      await submitForgotPassword();
      break;
    case 'set-dash-tab':
      await setDashTab(target.dataset.tab);
      break;
    case 'open-project-modal':
      openProjectModal();
      break;
    case 'submit-project':
      await submitProject();
      break;
    case 'open-project':
      await setDashTab('project-detail', { projectId: target.dataset.id, tab: 'keys' });
      break;
    case 'delete-project':
      await deleteProject(target.dataset.id);
      break;
    case 'set-project-tab':
      state.submissionsPage = 1;
      await setDashTab('project-detail', { projectId: target.dataset.projectId, tab: target.dataset.tab });
      break;
    case 'regenerate-keys':
      await regenerateKeys(target.dataset.id);
      break;
    case 'open-service-modal':
      openServiceModal(target.dataset.projectId);
      break;
    case 'submit-service':
      await submitService(target.dataset.projectId);
      break;
    case 'delete-service':
      await deleteService(target.dataset.id, target.dataset.projectId);
      break;
    case 'open-template-modal':
      openTemplateModal(target.dataset.projectId);
      break;
    case 'submit-template':
      await submitTemplate(target.dataset.projectId);
      break;
    case 'delete-template':
      await deleteTemplate(target.dataset.id, target.dataset.projectId);
      break;
    case 'view-submission':
      await viewSubmission(target.dataset.id);
      break;
    case 'retry-submission':
      await retrySubmission(target.dataset.id);
      break;
    case 'submissions-page':
      state.submissionsPage = Math.max(1, (state.submissionsPage || 1) + Number(target.dataset.dir));
      await setDashTab('project-detail', { projectId: target.dataset.projectId, tab: 'submissions' });
      break;
    case 'subscribe-plan':
      await subscribeToPlan(target.dataset.id);
      break;
    default:
      break;
  }
});

// Sidebar tabs (separate dataset key, kept out of the switch above for clarity)
document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('[data-dash-tab]');
  if (tabBtn) await setDashTab(tabBtn.dataset.dashTab);

  const authTabBtn = e.target.closest('[data-auth-tab]');
  if (authTabBtn) setAuthTab(authTabBtn.dataset.authTab);
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
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  bootSession();
});
