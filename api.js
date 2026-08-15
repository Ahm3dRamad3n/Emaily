/* ============================================================
   EMAILY — api.js
   Central API configuration + generic fetch wrapper + services.

   TO POINT THE FRONTEND AT A DIFFERENT BACKEND, CHANGE THIS
   ONE LINE:
   ============================================================ */
export const BASE_URL = 'http://localhost:5000/api';
/* ============================================================ */

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
   ApiError — thrown for any non-2xx response
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
   Generic request wrapper
   - Prepends BASE_URL
   - Attaches Authorization: Bearer <token> when auth !== false
   - Sends/parses JSON automatically, or passes FormData through
   - On 401, attempts a single silent refresh-token retry before
     giving up (skipped for the refresh/login/register calls
     themselves to avoid loops)
   ---------------------------------------------------------- */
let refreshInFlight = null;

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new ApiError('No refresh token available', 401);

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError('Session expired', res.status);
        const data = await res.json().catch(() => ({}));
        tokenStore.setTokens(data.accessToken, data.refreshToken);
        return data;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function request(method, endpoint, { body, auth = true, isRetry = false } = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {};
  const isFormData = body instanceof FormData;

  if (!isFormData) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = tokenStore.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError('Network error — could not reach Emaily API', 0, networkErr);
  }

  // Silent refresh-and-retry once on 401 for authenticated calls
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
    try {
      await post('/auth/logout', { refreshToken });
    } finally {
      tokenStore.clear();
    }
  },

  forgotPassword: (email) => post('/auth/forgot-password', { email }, { auth: false }),
};

/* ============================================================
   USER
   ============================================================ */
export const UserService = {
  getMe: () => get('/user/me'),
  updateMe: (payload) => put('/user/me', payload),
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
  regenerateKeys: (id) => post(`/projects/${id}/keys`),
  remove: (id) => del(`/projects/${id}`),
};

/* ============================================================
   SERVICES (per-project SMTP / sending services)
   ============================================================ */
export const ServiceService = {
  list: (projectId) => get(`/projects/${projectId}/services`),
  create: (projectId, payload) => post(`/projects/${projectId}/services`, payload),
  update: (serviceId, payload) => put(`/services/${serviceId}`, payload),
  remove: (serviceId) => del(`/services/${serviceId}`),
};

/* ============================================================
   INTEGRATIONS (Telegram bot, Google Sheets, etc.)
   ============================================================ */
export const IntegrationService = {
  create: (projectId, payload) => post(`/projects/${projectId}/integrations`, payload),
  remove: (integrationId) => del(`/integrations/${integrationId}`),
};

/* ============================================================
   TEMPLATES
   ============================================================ */
export const TemplateService = {
  list: (projectId) => get(`/projects/${projectId}/templates`),
  create: (projectId, payload) => post(`/projects/${projectId}/templates`, payload),
  update: (templateId, payload) => put(`/templates/${templateId}`, payload),
  remove: (templateId) => del(`/templates/${templateId}`),
  addAttachment: (templateId, formData) => post(`/templates/${templateId}/attachments`, formData),
};

/* ============================================================
   SUBMISSIONS
   ============================================================ */
export const SubmissionService = {
  // Public endpoint — no auth header, called from the *client's* form, not this dashboard
  submit: (publicApiKey, formData) =>
    post(`/submit/${publicApiKey}`, formData, { auth: false }),

  listByProject: (projectId, { page = 1, pageSize = 20 } = {}) =>
    get(`/projects/${projectId}/submissions?page=${page}&pageSize=${pageSize}`),

  getById: (submissionId) => get(`/submissions/${submissionId}`),
  retry: (submissionId) => post(`/submissions/${submissionId}/retry`),
};

/* ============================================================
   ADMIN
   (Wired for completeness — no admin UI is built in this SPA;
   these are ready to call from a separate admin surface.)
   ============================================================ */
export const AdminService = {
  getDashboard: () => get('/admin/dashboard'),
  listUsers: (query = '') => get(`/admin/users${query}`),
  setUserStatus: (userId, isActive) => put(`/admin/users/${userId}/status`, { isActive }),
  setUserQuota: (userId, missingEmails) => put(`/admin/users/${userId}/quota`, { missingEmails }),
  createOrUpdatePlan: (payload) => post('/admin/plans', payload),
  listBanned: () => get('/admin/banned'),
  addBanned: (payload) => post('/admin/banned', payload),
  removeBanned: (banId) => del(`/admin/banned/${banId}`),
};
