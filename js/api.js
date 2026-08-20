/* ============================================================
   EMAILY — api.js
   Central API configuration + generic fetch wrapper + services.

   TO POINT THE FRONTEND AT YOUR REAL C# BACKEND, CHANGE THIS
   ONE LINE:
   ============================================================ */
export const BASE_URL = 'http://localhost:5000/api';
/* ============================================================ */

/* ============================================================
   MOCK BACKEND SWITCH
   true  -> every request is served by mockDB.js. mockDB.js is
            loaded with a dynamic import() the first time it's
            needed, so it never touches the network or the
            runtime at all when this flag is false.
   false -> every request goes to BASE_URL, full stop. There is
            NO automatic fallback to mock data — if your C# API
            is unreachable, the caller gets a normal network
            ApiError, exactly like any production app talking to
            a real backend. mockDB.js is never imported in this
            mode; you could delete the file and nothing here
            would break.
   ============================================================ */
export const USE_MOCK = true;

const ACCESS_TOKEN_KEY = 'emaily_access_token';
const REFRESH_TOKEN_KEY = 'emaily_refresh_token';

/* ----------------------------------------------------------
   Token storage helpers
   ---------------------------------------------------------- */
export const tokenStore = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken, refreshToken) => {
    if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/* ----------------------------------------------------------
   ApiError — thrown for any non-2xx response, real or mock
   ---------------------------------------------------------- */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/* ----------------------------------------------------------
   Transport
   ---------------------------------------------------------- */
async function transport(method, endpoint, { token, body, isFormData }) {
  if (USE_MOCK) {
    // Dynamic import: mockDB.js is not fetched by the browser at
    // all unless USE_MOCK is true. Isolation is structural, not
    // just a runtime "if".
    const { mockFetch } = await import('./mockDB.js');
    return mockFetch(method, endpoint, { token, body });
  }

  const url = `${BASE_URL}${endpoint}`;
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    return await fetch(url, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    // No mock fallback here on purpose — see USE_MOCK comment above.
    throw new ApiError('Network error — could not reach the Emaily API', 0, networkErr);
  }
}

/* ----------------------------------------------------------
   Generic request wrapper
   ---------------------------------------------------------- */
let refreshInFlight = null;

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new ApiError('No refresh token available', 401);

  if (!refreshInFlight) {
    refreshInFlight = transport('POST', '/auth/refresh-token', { body: { refreshToken } })
      .then(async (res) => {
        if (!res.ok) throw new ApiError('Session expired', res.status);
        const data = await res.json().catch(() => ({}));
        tokenStore.setTokens(data.accessToken, data.refreshToken);
        return data;
      })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function request(method, endpoint, { body, auth = true, isRetry = false } = {}) {
  const isFormData = body instanceof FormData;
  const token = auth ? tokenStore.getAccessToken() : null;

  const response = await transport(method, endpoint, { token, body, isFormData });

  if (response.status === 401 && auth && !isRetry && !endpoint.startsWith('/auth/')) {
    try {
      await refreshAccessToken();
      return request(method, endpoint, { body, auth, isRetry: true });
    } catch {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('emaily:session-expired'));
      throw new ApiError('Session expired, please sign in again', 401);
    }
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message = (data && (data.message || data.error)) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

const get = (endpoint, opts) => request('GET', endpoint, opts);
const post = (endpoint, body, opts) => request('POST', endpoint, { ...opts, body });
const put = (endpoint, body, opts) => request('PUT', endpoint, { ...opts, body });
const del = (endpoint, opts) => request('DELETE', endpoint, opts);

/* ============================================================
   AUTH
   ============================================================ */
export const AuthService = {
  register: (payload) => post('/auth/register', payload, { auth: false }),
  login: async (payload) => {
    const data = await post('/auth/login', payload, { auth: false });
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    return data;
  },
  refreshToken: () => refreshAccessToken(),
  logout: async () => {
    const refreshToken = tokenStore.getRefreshToken();
    try { await post('/auth/logout', { refreshToken }); } finally { tokenStore.clear(); }
  },
  forgotPassword: (email) => post('/auth/forgot-password', { email }, { auth: false }),
};

/* ============================================================
   USER
   ============================================================ */
export const UserService = {
  getMe: () => get('/user/me'),
  updateMe: (payload) => put('/user/me', payload),
  // NEW — soft-deletes the caller's own account. See CHANGELOG.txt.
  deleteMe: () => del('/user/me'),
  // NEW — change password. See CHANGELOG.txt.
  changePassword: (currentPassword, newPassword) => put('/user/password', { currentPassword, newPassword }),
  // NEW — remaining email quota for the navbar badge. See CHANGELOG.txt.
  getQuota: () => get('/user/quota'),
};

/* ============================================================
   BILLING
   ============================================================ */
export const BillingService = {
  getPlans: () => get('/billing/plans'),
  getSubscription: () => get('/billing/subscription'),
  subscribe: (planId) => post('/billing/subscribe', { planId }),
  getInvoices: () => get('/billing/invoices'),
};

/* ============================================================
   PROJECTS
   ============================================================ */
export const ProjectService = {
  list: () => get('/projects'),
  create: (payload) => post('/projects', payload),
  getById: (id) => get(`/projects/${id}`),
  update: (id, payload) => put(`/projects/${id}`, payload),
  // NEW — pause/resume toggle, separate from settings edit. See CHANGELOG.txt.
  setStatus: (id, isActive) => put(`/projects/${id}/status`, { isActive }),
  regenerateKeys: (id) => post(`/projects/${id}/keys`),
  remove: (id) => del(`/projects/${id}`), // soft delete (IsDeleted)
};

/* ============================================================
   SERVICES (per-project SMTP / sending services)
   ============================================================ */
export const ServiceService = {
  list: (projectId) => get(`/projects/${projectId}/services`),
  create: (projectId, payload) => post(`/projects/${projectId}/services`, payload),
  update: (serviceId, payload) => put(`/services/${serviceId}`, payload),
  setStatus: (serviceId, isActive) => put(`/services/${serviceId}/status`, { isActive }),
  remove: (serviceId) => del(`/services/${serviceId}`), // soft delete
};

/* ============================================================
   INTEGRATIONS (Telegram bot, Google Sheets, etc.)
   ============================================================ */
export const IntegrationService = {
  list: (projectId) => get(`/projects/${projectId}/integrations`),
  create: (projectId, payload) => post(`/projects/${projectId}/integrations`, payload),
  remove: (integrationId) => del(`/integrations/${integrationId}`),
};

/* ============================================================
   TEMPLATES — full field set (To/CC/BCC/ReplyTo/AppCheck/etc.)
   ============================================================ */
export const TemplateService = {
  list: (projectId) => get(`/projects/${projectId}/templates`),
  create: (projectId, payload) => post(`/projects/${projectId}/templates`, payload),
  update: (templateId, payload) => put(`/templates/${templateId}`, payload),
  setStatus: (templateId, isActive) => put(`/templates/${templateId}/status`, { isActive }),
  remove: (templateId) => del(`/templates/${templateId}`), // soft delete
  addAttachment: (templateId, formData) => post(`/templates/${templateId}/attachments`, formData),
  removeAttachment: (templateId, attachmentId) => del(`/templates/${templateId}/attachments/${attachmentId}`), // NEW
};

/* ============================================================
   SUBMISSIONS
   ============================================================ */
export const SubmissionService = {
  // Public endpoint — no auth header, called from the *client's* form, not this dashboard
  submit: (publicApiKey, formData) => post(`/submit/${publicApiKey}`, formData, { auth: false }),
  listByProject: (projectId, { page = 1, pageSize = 20 } = {}) => get(`/projects/${projectId}/submissions?page=${page}&pageSize=${pageSize}`),
  getById: (submissionId) => get(`/submissions/${submissionId}`),
  retry: (submissionId) => post(`/submissions/${submissionId}/retry`),
};

/* ============================================================
   ANALYTICS — NEW, see CHANGELOG.txt
   ============================================================ */
export const AnalyticsService = {
  getOverview: () => get('/analytics/overview'),
  getProject: (projectId) => get(`/analytics/projects/${projectId}`),
};

/* ============================================================
   ADMIN
   ============================================================ */
export const AdminService = {
  getDashboard: () => get('/admin/dashboard'),
  getAnalytics: () => get('/admin/analytics'),
  listUsers: (query = '') => get(`/admin/users${query}`),
  setUserStatus: (userId, isActive) => put(`/admin/users/${userId}/status`, { isActive }),
  // NOTE: setUserQuota was removed — manual MissingEmails editing is no
  // longer an admin action. See CHANGELOG.txt.
  getUserProjects: (userId) => get(`/admin/users/${userId}/projects`), // NEW
  createOrUpdatePlan: (payload) => post('/admin/plans', payload),
  listBanned: () => get('/admin/banned'),
  addBanned: (payload) => post('/admin/banned', payload),
  reduceBanned: (banId) => put(`/admin/banned/${encodeURIComponent(banId)}/reduce`), // NEW
  removeBanned: (banId) => del(`/admin/banned/${banId}`),
  // NEW — system-wide browse endpoints. No param -> { count }; a size
  // param -> { items } capped at 100. See CHANGELOG.txt.
  listProjects: (pageSize) => get(`/admin/projects${pageSize ? `?p=${pageSize}` : ''}`),
  listProjectTemplates: (projectId) => get(`/admin/projects/${projectId}/templates`),
  listProjectServices: (projectId) => get(`/admin/projects/${projectId}/services`),
  listTemplates: (pageSize) => get(`/admin/templates${pageSize ? `?t=${pageSize}` : ''}`),
  getTemplate: (id) => get(`/admin/templates/${id}`),
  listServices: (pageSize) => get(`/admin/services${pageSize ? `?s=${pageSize}` : ''}`),
  getService: (id) => get(`/admin/services/${id}`),
  listLogs: (pageSize) => get(`/admin/logs${pageSize ? `?l=${pageSize}` : ''}`),
};
