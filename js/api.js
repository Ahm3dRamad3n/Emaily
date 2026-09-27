/* ============================================================
   EMAILY — api.js
   Central API configuration + generic fetch wrapper + services.
   ============================================================ */
//export const BASE_URL = "https://localhost:7104/api";
export const BASE_URL =
  "https://emaily-gec9hbg5hng6a3dx.switzerlandnorth-01.azurewebsites.net/api";

const ACCESS_TOKEN_KEY = "emaily_access_token";
const REFRESH_TOKEN_KEY = "emaily_refresh_token";

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
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/* ----------------------------------------------------------
   Transport
   ---------------------------------------------------------- */
async function transport(method, endpoint, { token, body, isFormData }) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    return await fetch(url, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      "Network error — could not reach the Emaily API",
      0,
      networkErr,
    );
  }
}

/* ----------------------------------------------------------
   Generic request wrapper
   ---------------------------------------------------------- */
let refreshInFlight = null;

async function refreshAccessToken() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) throw new ApiError("No refresh token available", 401);

  if (!refreshInFlight) {
    refreshInFlight = transport("POST", "/auth/refresh-token", {
      body: { Token: refreshToken },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status < 500) {
            tokenStore.clear();
            window.dispatchEvent(new Event("session-expired"));
            throw new ApiError("Session expired", res.status);
          }
          window.dispatchEvent(new Event("server-error"));
          throw new ApiError("Server error during token refresh", res.status);
        } else {
          const data = await res.json().catch(() => ({}));
          tokenStore.setTokens(data.accessToken, data.refreshToken);
          return data;
        }
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function request(
  method,
  endpoint,
  { body, auth = true, isRetry = false } = {},
) {
  const isFormData = body instanceof FormData;
  const token = auth ? tokenStore.getAccessToken() : null;

  const response = await transport(method, endpoint, {
    token,
    body,
    isFormData,
  });

  if (
    response.status === 401 &&
    auth &&
    !isRetry &&
    !endpoint.startsWith("/auth/")
  ) {
    await refreshAccessToken(); // may throw ApiError if refresh fails
    return request(method, endpoint, { body, auth, isRetry: true });
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) ||
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

const get = (endpoint, opts) => request("GET", endpoint, opts);
const post = (endpoint, body, opts) =>
  request("POST", endpoint, { ...opts, body });
const put = (endpoint, body, opts) =>
  request("PUT", endpoint, { ...opts, body });
const del = (endpoint, body, opts) =>
  request("DELETE", endpoint, { ...opts, body });

/* ============================================================
   AUTH
   ============================================================ */
export const AuthService = {
  register: (payload) => post("/auth/register", payload, { auth: false }),
  login: async (payload) => {
    const data = await post("/auth/login", payload, { auth: false });
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    return data;
  },
  refreshToken: () => refreshAccessToken(),
  logout: async () => {
    const refreshToken = tokenStore.getRefreshToken();
    try {
      await post("/auth/logout", { refreshToken });
    } finally {
      tokenStore.clear();
    }
  },
  verifyEmail: (email) =>
    post(`/auth/send-verification-email`, { email }, { auth: false }),
  forgotPassword: (email) =>
    post("/auth/forgot-password", { email }, { auth: false }),
  resetPassword: ({ token, newPassword }) =>
    post("/auth/reset-password", { token, newPassword }, { auth: false }),
};

/* ============================================================
   USER
   ============================================================ */
export const UserService = {
  getMe: () => get("/user/me"),
  updateMe: (payload) => put("/user/me", payload),
  // NEW — soft-deletes the caller's own account. See CHANGELOG.txt.
  deleteMe: () => del("/user/me"),
  // NEW — change password. See CHANGELOG.txt.
  changePassword: (currentPassword, newPassword) =>
    put("/user/password", { currentPassword, newPassword }),
  // NEW — remaining email quota for the navbar badge. See CHANGELOG.txt.
  getQuota: () => get("/user/quota"),
};

/* ============================================================
   BILLING
   ============================================================ */
export const BillingService = {
  getPlans: () => get("/billing/plans"),
  getSubscription: () => get("/billing/subscription"),
  subscribe: (planId) => post("/billing/subscribe", { planId }),
  getInvoices: () => get("/billing/invoices"),
};

/* ============================================================
   PROJECTS
   ============================================================ */
export const ProjectService = {
  list: () => get("/projects"),
  create: (payload) => post("/projects", payload),
  getById: (id) => get(`/projects/${id}`),
  update: (id, payload) => put(`/projects/${id}`, payload),
  changeAccessMode: (id, payload) =>
    put(`/projects/${id}/access-mode`, payload),
  setStatus: (id, isActive) => put(`/projects/${id}/status`, { isActive }),
  regenerateKeys: (id) => post(`/projects/${id}/keys`),
  remove: (id) => del(`/projects/${id}`), // soft delete (IsDeleted)
  getLinkedServices: (projectId) => get(`/projects/${projectId}/services`),
  linkService: (projectId, serviceId) =>
    post(`/projects/${projectId}/services/${serviceId}`),
  unlinkService: (projectId, serviceId) =>
    del(`/projects/${projectId}/services/${serviceId}`),
  unlockProject: (projectId) => put(`/projects/${projectId}/unlock`),
};

/* ============================================================
   SERVICES (per-project SMTP / sending services)
   ============================================================ */
export const ServiceService = {
  list: () => get("/services"),
  create: (data) => post("/services", data),
  update: (id, data) => put(`/services/${id}`, data),
  setStatus: (id, isActive) => put(`/services/${id}/status`, { isActive }),
  remove: (id) => del(`/services/${id}`),
  unlockService: (serviceId) => put(`/services/${serviceId}/unlock`),
};

/* ============================================================
   INTEGRATIONS (Telegram bot, Google Sheets, etc.)
   ============================================================ */
export const IntegrationService = {
  list: (projectId) => get(`/projects/${projectId}/integrations`),
  create: (projectId, payload) =>
    post(`/projects/${projectId}/integrations`, payload),
  update: (integrationId, payload) =>
    put(`/integrations/${integrationId}`, payload),
  remove: (integrationId) => del(`/integrations/${integrationId}`),
  setStatus: (integrationId, isActive) =>
    put(`/integrations/${integrationId}/status`, { isActive }),
};

/* ============================================================
   TEMPLATES — full field set (To/CC/BCC/ReplyTo/AppCheck/etc.)
   ============================================================ */
export const TemplateService = {
  list: (projectId) => get(`/projects/${projectId}/templates`),
  getById: (templateId) => get(`/templates/${templateId}`),
  create: (projectId, payload) =>
    post(`/projects/${projectId}/templates`, payload),
  update: (templateId, payload) => put(`/templates/${templateId}`, payload),
  setStatus: (templateId, isActive) =>
    put(`/templates/${templateId}/status`, { isActive }),
  remove: (templateId) => del(`/templates/${templateId}`), // soft delete
  addAttachment: (templateId, formData) =>
    post(`/templates/${templateId}/attachments`, formData),
  removeAttachment: (templateId, attachmentId) =>
    del(`/templates/${templateId}/attachments/${attachmentId}`),
  unlockTemplate: (templateId) => put(`/templates/${templateId}/unlock`),
};

/* ============================================================
   SUBMISSIONS
   ============================================================ */
export const SubmissionService = {
  // Public endpoint — no auth header, called from the *client's* form, not this dashboard
  submit: (publicApiKey, formData) =>
    post(`/submit/${publicApiKey}`, formData, { auth: false }),
  listByProject: (projectId, page = 1) =>
    get(`/projects/${projectId}/submissions?page=${page}`),
  getById: (submissionId) => get(`/submissions/${submissionId}`),
  retry: (submissionId) => post(`/submissions/${submissionId}/retry`),
};

/* ============================================================
   ANALYTICS — NEW, see CHANGELOG.txt
   ============================================================ */
export const AnalyticsService = {
  getOverview: () => get("/analytics/overview"),
  getProject: (projectId) => get(`/analytics/projects/${projectId}`),
};

/* ============================================================
   ADMIN
   ============================================================ */
export const AdminService = {
  getDashboard: () => get("/admin/dashboard"),
  getAnalytics: () => get("/admin/analytics"),

  // Users
  listUsers: (page) => get(`/admin/users?page=${page}`),
  setUserStatus: (userId, isActive) =>
    put(`/admin/users/${userId}/status`, { isActive }),
  getUserProjects: (userId) => get(`/admin/users/${userId}/projects`),
  searchUsers: (term, page) =>
    get(`/admin/users/search?searchTerm=${term}&page=${page}`),
  getUserDetails: (userId) => get(`/admin/users/${userId}/details`),
  createOrUpdatePlan: (payload) => post("/admin/plans", payload),

  // Banned
  listBanned: (page) => get(`/admin/banned?page=${page}`),
  searchBanned: (term, page) =>
    get(`/admin/banned/search?searchTerm=${term}&page=${page}`),
  banDetails: (IP) => get(`/admin/banned/${IP}`),
  addBanned: (payload) => post("/admin/banned", payload),
  reduceBanned: (payload) => put("/admin/banned", payload),
  removeBanned: (payload) => del("/admin/banned", payload),

  // Projects
  listProjects: (page) => get(`/admin/projects?page=${page}`),
  searchProjects: (term, page) =>
    get(`/admin/projects/search?searchTerm=${term}&page=${page}`),
  listProjectTemplates: (projectId) =>
    get(`/admin/projects/${projectId}/templates`),
  listProjectServices: (projectId) =>
    get(`/admin/projects/${projectId}/services`),

  // Templates
  listTemplates: (page) => get(`/admin/templates?page=${page}`),
  searchTemplates: (term, page) =>
    get(`/admin/templates/search?searchTerm=${term}&page=${page}`),
  getTemplate: (id) => get(`/admin/templates/${id}`),

  // Services
  listServices: (page) => get(`/admin/services?page=${page}`),
  searchServices: (term, page) =>
    get(`/admin/services/search?searchTerm=${term}&page=${page}`),
  getService: (id) => get(`/admin/services/${id}`),

  // Logs
  listLogs: (page) => get(`/admin/logs?page=${page}`),
  searchLogs: (term, page) =>
    get(`/admin/logs/search?searchTerm=${term}&page=${page}`),

  // Subscription
  subscribe: (planId, userId) => post("/admin/subscribe", { planId, userId }),
};
