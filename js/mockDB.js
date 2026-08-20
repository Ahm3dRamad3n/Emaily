/* ============================================================
   EMAILY — mockDB.js
   A temporary, browser-only backend so the UI can be built and
   tested before the real C# API exists. Data lives in
   localStorage and is shaped to match Emaily.sql, EXTENDED per
   CHANGELOG.txt with an IsDeleted column alongside every
   IsActive column, plus several new endpoints. See
   CHANGELOG.txt for the full list of additions.

   ISOLATION: this file is only ever loaded via a dynamic
   import() inside api.js, and only when USE_MOCK is true (see
   api.js). When USE_MOCK is false, this file is never fetched
   by the browser at all — deleting it entirely would not affect
   a real-backend run.

   THIS FILE IS NOT SECURE AND IS NOT A REFERENCE FOR THE REAL
   BACKEND. Passwords are stored in plain text here purely so
   the login form has something to check against in the browser.
   The real C# API must hash passwords, validate everything
   server-side, and never trust the client.

   BUSINESS RULE (per the Aug 16 update):
   - IsActive on Projects / Templates / ConnectedServices /
     Integrations is now USER-CONTROLLED — a pause/resume toggle.
     A paused project still exists and is visible, it just
     rejects incoming submissions.
   - IsActive on Users remains ADMIN-CONTROLLED (suspend/reinstate).
   - IsDeleted (new, on every table that had IsActive) is a soft
     delete. A deleted row is hidden from every list and every
     lookup, everywhere, as if it did not exist. There is no
     "trash/restore" UI — it's gone from the user's perspective.
   ============================================================ */

const DB_KEY = "emaily_mock_db";
const DB_VERSION = 2; // bumped for the IsDeleted migration — old saved DBs are reseeded
const LATENCY_MS = [350, 650]; // simulated network latency range
const ANALYTICS_DAYS = 14;

/* ----------------------------------------------------------
   ID helpers — mirror the SQL defaults
   ---------------------------------------------------------- */
function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const projectId = () => "p_" + uuid();
const serviceId = () => "s_" + uuid();
const templateId = () => "t_" + uuid();

// Built via concatenation rather than a literal 'local@domain' string
// so seed emails are guaranteed distinct — do not inline literal
// email addresses elsewhere in this file, use this helper instead.
const mkEmail = (local, domain) => local + "@" + domain;

function delay() {
  const [min, max] = LATENCY_MS;
  return new Promise((resolve) =>
    setTimeout(resolve, min + Math.random() * (max - min)),
  );
}

/* ----------------------------------------------------------
   Storage load / save
   ---------------------------------------------------------- */
function loadDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed._dbVersion === DB_VERSION) return parsed;
      // Older shape (pre-IsDeleted) — reseed rather than migrate,
      // this is disposable dev/demo data.
    } catch {
      /* fall through to reseed */
    }
  }
  const seeded = seedDb();
  saveDb(seeded);
  return seeded;
}

function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

/* ----------------------------------------------------------
   Seed data
   ---------------------------------------------------------- */
function seedDb() {
  const now = Date.now();
  const daysAgo = (n, hourOffset = 0) =>
    new Date(now - n * 86400000 + hourOffset * 3600000).toISOString();
  const daysFromNow = (n) => new Date(now + n * 86400000).toISOString();

  const adminUserId = uuid();
  const demoUserId = uuid();

  const planFree = uuid();
  const planPro = uuid();
  const planBiz = uuid();

  const demoProjectId = projectId();
  const secondProjectId = projectId();
  const demoServiceId = serviceId();
  const tplContact = templateId();
  const tplWelcome = templateId();
  const demoSubId = uuid();

  const submissions = generateSubmissions(
    demoProjectId,
    tplContact,
    tplWelcome,
    daysAgo,
  );

  return {
    _dbVersion: DB_VERSION,

    // -------- Users -------- (PasswordHash holds a PLAIN password, mock only)
    users: [
      {
        Id: adminUserId,
        FullName: "Emaily Admin",
        Email: mkEmail("admin", "emaily.local"),
        PasswordHash: "admin123",
        DevNotificationEmail: mkEmail("admin", "emaily.local"),
        CreatedAt: daysAgo(120),
        remainingQuota: 0,
        Roles: "Admin",
        IsActive: true,
        IsDeleted: false,
      },
      {
        Id: demoUserId,
        FullName: "Sara Ahmed",
        Email: mkEmail("sara.ahmed", "example.com"),
        PasswordHash: "demo1234",
        DevNotificationEmail: mkEmail("sara.ahmed", "example.com"),
        CreatedAt: daysAgo(40),
        remainingQuota: 3,
        Roles: "User",
        IsActive: true,
        IsDeleted: false,
      },
    ],

    // -------- Plans --------
    plans: [
      {
        Id: planFree,
        Name: "Free",
        MonthlyPrice: 0,
        MaxEmailsPerMonth: 500,
        MaxProjects: 1,
        MaxServices: 1,
        MaxTemplates: 3,
        MaxAttachmentsPerTemplate: 0,
        CanUseGoogleSheets: false,
        CanUseAI: false,
        CanUseTelegramBot: false,
        IsActive: true,
        IsDeleted: false,
      },
      {
        Id: planPro,
        Name: "Pro",
        MonthlyPrice: 19,
        MaxEmailsPerMonth: 10000,
        MaxProjects: 5,
        MaxServices: 5,
        MaxTemplates: 20,
        MaxAttachmentsPerTemplate: 2,
        CanUseGoogleSheets: true,
        CanUseAI: true,
        CanUseTelegramBot: true,
        IsActive: true,
        IsDeleted: false,
      },
      {
        Id: planBiz,
        Name: "Business",
        MonthlyPrice: 79,
        MaxEmailsPerMonth: 100000,
        MaxProjects: 25,
        MaxServices: 20,
        MaxTemplates: 100,
        MaxAttachmentsPerTemplate: 5,
        CanUseGoogleSheets: true,
        CanUseAI: true,
        CanUseTelegramBot: true,
        IsActive: true,
        IsDeleted: false,
      },
    ],

    // -------- Subscriptions --------
    subscriptions: [
      {
        Id: demoSubId,
        UserId: demoUserId,
        PlanId: planPro,
        Status: "Active",
        StartDate: daysAgo(15),
        EndDate: daysFromNow(15),
        CreatedAt: daysAgo(15),
      },
    ],

    // -------- Invoices --------
    invoices: [
      {
        Id: uuid(),
        SubscriptionId: demoSubId,
        Amount: 19,
        Status: "Paid",
        InvoiceDate: daysAgo(15),
        InvoicePdfUrl: "#",
      },
      {
        Id: uuid(),
        SubscriptionId: demoSubId,
        Amount: 19,
        Status: "Paid",
        InvoiceDate: daysAgo(45),
        InvoicePdfUrl: "#",
      },
    ],

    // -------- Projects -------- (AllowNonBrowserApps/RequirePrivateKey are new — see CHANGELOG)
    projects: [
      {
        Id: demoProjectId,
        UserId: demoUserId,
        Name: "Portfolio Site",
        PublicApiKey: "pk_live_demo123",
        PrivateApiKey: "sk_live_demo456",
        RestrictedDomains: "sara-portfolio.dev",
        CreatedAt: daysAgo(38),
        IsActive: true,
        IsDeleted: false,
        AllowNonBrowserApps: false,
        RequirePrivateKey: false,
      },
      {
        Id: secondProjectId,
        UserId: demoUserId,
        Name: "Freelance Landing Page",
        PublicApiKey: "pk_live_demo789",
        PrivateApiKey: "sk_live_demoabc",
        RestrictedDomains: "",
        CreatedAt: daysAgo(10),
        IsActive: false,
        IsDeleted: false,
        AllowNonBrowserApps: true,
        RequirePrivateKey: false,
      },
    ],

    // -------- ConnectedServices --------
    services: [
      {
        Id: demoServiceId,
        ProjectId: demoProjectId,
        ProviderType: "SMTP",
        SmtpHost: "smtp.mailtrap.io",
        SmtpPort: 587,
        Username: "demo_user",
        EncryptedPassword: "••••••••",
        SecretApiKey: null,
        FromEmail: mkEmail("hello", "sara-portfolio.dev"),
        FromName: "Sara's Portfolio",
        IsActive: true,
        IsDeleted: false,
      },
    ],

    // -------- Templates -------- (ServiceId + RecaptchaSiteKey are new — see CHANGELOG)
    templates: [
      {
        Id: tplContact,
        ProjectId: demoProjectId,
        Name: "contact-form",
        Subject: "New message from {{name}}",
        ContentHtml: "<h1>New submission</h1><p>{{message}}</p>",
        DoSaveInHistory: true,
        EnableRecaptchaV2: true,
        RecaptchaSecretKey: null,
        RecaptchaSiteKey: "6Lc_demo_site_key",
        EnableAppCheck: false,
        ToEmail: mkEmail("sara.ahmed", "example.com"),
        ReplyTo: null,
        Bcc: null,
        Cc: null,
        EnableAutoReply: false,
        AutoReplyTemplateId: null,
        ServiceId: demoServiceId,
        CreatedAt: daysAgo(35),
        IsActive: true,
        IsDeleted: false,
      },
      {
        Id: tplWelcome,
        ProjectId: demoProjectId,
        Name: "newsletter-welcome",
        Subject: "Welcome aboard!",
        ContentHtml: "<h1>Thanks for subscribing</h1>",
        DoSaveInHistory: true,
        EnableRecaptchaV2: false,
        RecaptchaSecretKey: null,
        RecaptchaSiteKey: null,
        EnableAppCheck: false,
        ToEmail: null,
        ReplyTo: mkEmail("sara.ahmed", "example.com"),
        Bcc: null,
        Cc: null,
        EnableAutoReply: false,
        AutoReplyTemplateId: null,
        ServiceId: demoServiceId,
        CreatedAt: daysAgo(20),
        IsActive: true,
        IsDeleted: false,
      },
    ],

    attachments: [],

    // -------- Integrations --------
    integrations: [
      {
        Id: uuid(),
        ProjectId: demoProjectId,
        IntegrationType: "Telegram",
        ConfigJson: JSON.stringify({ value: "@sara_alerts" }),
        IsActive: true,
        IsDeleted: false,
      },
    ],

    // -------- Submissions -------- (generated below for a realistic analytics history)
    submissions,

    refreshTokens: [],
    accessTokens: [], // mock-only session table, not part of the SQL schema

    systemLogs: [
      {
        Id: 1,
        LogLevel: "Info",
        Source: "AuthService",
        Message: "User login",
        ExceptionDetails: null,
        UserId: demoUserId,
        ProjectId: null,
        IpAddress: "41.44.12.9",
        CreatedAt: daysAgo(1),
      },
      {
        Id: 2,
        LogLevel: "Warning",
        Source: "SubmissionsAPI",
        Message: "SPF check failed for outbound message",
        ExceptionDetails: null,
        UserId: demoUserId,
        ProjectId: demoProjectId,
        IpAddress: "41.44.12.9",
        CreatedAt: daysAgo(2),
      },
    ],

    // Banned.Id IS the banned IP/email, per schema (VARCHAR(50) PK)
    banned: [
      { Id: "198.51.100.23", violationCount: 5, bannedUntil: daysFromNow(3) },
      {
        Id: mkEmail("spammer", "baddomain.test"),
        violationCount: 8,
        bannedUntil: daysFromNow(30),
      },
    ],
  };
}

function generateSubmissions(demoProjectId, tplContact, tplWelcome, daysAgo) {
  const names = [
    "Omar",
    "Lina",
    "Karim",
    "Yara",
    "Tarek",
    "Mona",
    "Hassan",
    "Dina",
    "Adam",
    "Rana",
  ];
  const out = [];

  for (let day = ANALYTICS_DAYS - 1; day >= 0; day--) {
    const countToday = 1 + Math.floor(Math.random() * 5);
    for (let i = 0; i < countToday; i++) {
      const roll = Math.random();
      const status = roll < 0.82 ? "Sent" : roll < 0.94 ? "Failed" : "Pending";
      const name = names[Math.floor(Math.random() * names.length)];
      const useContact = Math.random() < 0.7;
      const tplId = useContact ? tplContact : tplWelcome;
      const hour = Math.floor(Math.random() * 20);
      out.push({
        Id: uuid(),
        ProjectId: demoProjectId,
        TemplateId: tplId,
        RecipientEmail: `${name.toLowerCase()}@example.com`,
        Subject: useContact ? `New message from ${name}` : "Welcome aboard!",
        PayloadJson: JSON.stringify(
          useContact
            ? { name, message: "Hi there, loved your work!" }
            : { email: `${name.toLowerCase()}@example.com` },
        ),
        RawHtmlBody: null,
        ReceivedAt: daysAgo(day, hour),
        Status: status,
        AiSummary:
          status === "Failed"
            ? "The receiving mail server rejected the message due to an SPF check failure — the sending domain is not authorized for this SMTP relay."
            : null,
        ErrorMessage: status === "Failed" ? "SMTP 550: SPF check failed" : null,
        SentAt: status === "Sent" ? daysAgo(day, hour) : null,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------------
   Mapping helpers: SQL columns -> camelCase API shape
   ---------------------------------------------------------- */
const mapUser = (u) => ({
  id: u.Id,
  name: u.FullName,
  email: u.Email,
  notificationEmail: u.DevNotificationEmail,
  remainingQuota: u.remainingQuota,
  roles: u.Roles,
  isActive: u.IsActive,
  createdAt: u.CreatedAt,
});

const mapPlan = (p) => ({
  id: p.Id,
  name: p.Name,
  price: p.MonthlyPrice,
  maxEmailsPerMonth: p.MaxEmailsPerMonth,
  maxProjects: p.MaxProjects,
  maxServices: p.MaxServices,
  maxTemplates: p.MaxTemplates,
  maxAttachmentsPerTemplate: p.MaxAttachmentsPerTemplate,
  canUseGoogleSheets: p.CanUseGoogleSheets,
  canUseAI: p.CanUseAI,
  canUseTelegramBot: p.CanUseTelegramBot,
  isActive: p.IsActive,
});

const mapProject = (p) => ({
  id: p.Id,
  name: p.Name,
  publicApiKey: p.PublicApiKey,
  privateApiKey: p.PrivateApiKey,
  domains: p.RestrictedDomains
    ? p.RestrictedDomains.split(",")
        .map((d) => d.trim())
        .filter(Boolean)
    : [],
  isActive: p.IsActive,
  createdAt: p.CreatedAt,
  allowNonBrowserApps: !!p.AllowNonBrowserApps,
  requirePrivateKey: !!p.RequirePrivateKey,
});

const mapAdminProject = (p, db) => ({
  ...mapProject(p),
  userId: p.UserId,
  ownerEmail: db.users.find((u) => u.Id === p.UserId)?.Email || null,
});

const mapService = (s) => ({
  id: s.Id,
  provider: s.ProviderType,
  host: s.SmtpHost,
  port: s.SmtpPort,
  username: s.Username,
  apiKeySet: !!s.SecretApiKey,
  fromEmail: s.FromEmail,
  fromName: s.FromName,
  isActive: s.IsActive,
  projectId: s.ProjectId,
});

const mapIntegration = (i) => ({
  id: i.Id,
  type: i.IntegrationType,
  config: (() => {
    try {
      return JSON.parse(i.ConfigJson);
    } catch {
      return {};
    }
  })(),
  isActive: i.IsActive,
});

const mapTemplate = (t, db) => ({
  id: t.Id,
  name: t.Name,
  subject: t.Subject,
  html: t.ContentHtml,
  doSaveInHistory: t.DoSaveInHistory,
  enableRecaptchaV2: t.EnableRecaptchaV2,
  recaptchaSiteKey: t.RecaptchaSiteKey,
  enableAppCheck: t.EnableAppCheck,
  toEmail: t.ToEmail,
  replyTo: t.ReplyTo,
  cc: t.Cc,
  bcc: t.Bcc,
  enableAutoReply: t.EnableAutoReply,
  autoReplyTemplateId: t.AutoReplyTemplateId,
  serviceId: t.ServiceId,
  createdAt: t.CreatedAt,
  isActive: t.IsActive,
  projectId: t.ProjectId,
  attachments: (db?.attachments || [])
    .filter((a) => a.TemplateId === t.Id)
    .map((a) => ({
      id: a.Id,
      fileName: a.FileName,
      fileSizeInBytes: a.FileSizeInBytes,
    })),
});

const mapSubmission = (s) => ({
  id: s.Id,
  status: s.Status,
  recipient: s.RecipientEmail,
  subject: s.Subject,
  templateId: s.TemplateId,
  fields: (() => {
    try {
      return JSON.parse(s.PayloadJson);
    } catch {
      return {};
    }
  })(),
  createdAt: s.ReceivedAt,
  sentAt: s.SentAt,
  errorMessage: s.ErrorMessage,
  aiSummary: s.AiSummary,
});

const mapSubscription = (sub, plan) => ({
  id: sub.Id,
  planId: sub.PlanId,
  planName: plan?.Name,
  status: sub.Status,
  startDate: sub.StartDate,
  endDate: sub.EndDate,
});

const mapInvoice = (inv) => ({
  id: inv.Id,
  date: inv.InvoiceDate,
  amount: inv.Amount,
  status: inv.Status,
  pdfUrl: inv.InvoicePdfUrl || "#",
});

const mapBanned = (b) => ({
  id: b.Id,
  violationCount: b.violationCount,
  bannedUntil: b.bannedUntil,
});

/* ----------------------------------------------------------
   Auth helpers
   ---------------------------------------------------------- */
class MockError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function issueTokens(db, userId) {
  const accessToken = `mock_access_${userId}_${uuid()}`;
  const refreshToken = `mock_refresh_${userId}_${uuid()}`;
  db.accessTokens.push({
    token: accessToken,
    userId,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });
  db.refreshTokens.push({
    Id: uuid(),
    UserId: userId,
    Token: refreshToken,
    JwtId: null,
    IsUsed: false,
    IsRevoked: false,
    CreatedAt: new Date().toISOString(),
    ExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  return { accessToken, refreshToken };
}

function requireAuth(db, token) {
  if (!token) throw new MockError(401, "Unauthorized");
  const session = db.accessTokens.find((t) => t.token === token);
  if (!session || session.expiresAt < Date.now())
    throw new MockError(401, "Session expired");
  const user = db.users.find((u) => u.Id === session.userId);
  if (!user || user.IsDeleted)
    throw new MockError(401, "Account no longer exists");
  if (!user.IsActive) throw new MockError(403, "Account is suspended");
  return user;
}

function requireAdmin(db, token) {
  const user = requireAuth(db, token);
  if (String(user.Roles).toLowerCase() !== "admin")
    throw new MockError(403, "Admin access required");
  return user;
}

function requireOwnedProject(db, user, projId) {
  const project = db.projects.find(
    (p) => p.Id === projId && p.UserId === user.Id && !p.IsDeleted,
  );
  if (!project) throw new MockError(404, "Project not found");
  return project;
}

function currentPlan(db, user) {
  const sub = db.subscriptions.find(
    (s) => s.UserId === user.Id && s.Status === "Active",
  );
  return (
    db.plans.find((p) => p.Id === sub?.PlanId) ||
    db.plans.find((p) => p.Name === "Free")
  );
}

function groupByDay(items, dateField, days = ANALYTICS_DAYS) {
  const buckets = new Map();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, sent: 0, failed: 0, pending: 0 });
  }
  items.forEach((item) => {
    const key = String(item[dateField] || "").slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) return;
    const status = (item.Status || "").toLowerCase();
    if (status === "sent" || status === "resent") bucket.sent += 1;
    else if (status === "failed") bucket.failed += 1;
    else bucket.pending += 1;
  });
  return Array.from(buckets.values());
}

function successRateOf(items) {
  if (!items.length) return 0;
  const sent = items.filter((s) =>
    ["sent", "resent"].includes((s.Status || "").toLowerCase()),
  ).length;
  return Math.round((sent / items.length) * 1000) / 10;
}

/* ----------------------------------------------------------
   Tiny path router
   ---------------------------------------------------------- */
function pathToRegex(path) {
  const names = [];
  const pattern = path.replace(/:[^/]+/g, (m) => {
    names.push(m.slice(1));
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${pattern}$`), names };
}

const routes = [];
function route(method, path, handler) {
  routes.push({ method, ...pathToRegex(path), handler });
}

/* ============================================================
   AUTH routes
   ============================================================ */
route("POST", "/auth/register", (db, { body }) => {
  const { name, email, password } = body || {};
  if (!name || !email || !password)
    throw new MockError(400, "Name, email, and password are required.");
  if (
    db.users.some(
      (u) =>
        u.Email.toLowerCase() === String(email).toLowerCase() && !u.IsDeleted,
    )
  ) {
    throw new MockError(409, "An account with that email already exists.");
  }
  const user = {
    Id: uuid(),
    FullName: name,
    Email: email,
    PasswordHash: password,
    DevNotificationEmail: email,
    CreatedAt: new Date().toISOString(),
    remainingQuota: 0,
    Roles: "User",
    IsActive: true,
    IsDeleted: false,
  };
  db.users.push(user);
  return { status: 201, data: mapUser(user) };
});

route("POST", "/auth/login", (db, { body }) => {
  const { email, password } = body || {};
  const user = db.users.find(
    (u) =>
      u.Email.toLowerCase() === String(email || "").toLowerCase() &&
      !u.IsDeleted,
  );
  if (!user || user.PasswordHash !== password)
    throw new MockError(401, "Invalid email or password.");
  if (!user.IsActive)
    throw new MockError(403, "This account has been suspended.");
  const tokens = issueTokens(db, user.Id);
  return { status: 200, data: { ...tokens, user: mapUser(user) } };
});

route("POST", "/auth/refresh-token", (db, { body }) => {
  const { refreshToken } = body || {};
  const record = db.refreshTokens.find((r) => r.Token === refreshToken);
  if (
    !record ||
    record.IsRevoked ||
    record.IsUsed ||
    new Date(record.ExpiresAt) < new Date()
  ) {
    throw new MockError(401, "Refresh token is invalid or expired.");
  }
  record.IsUsed = true;
  const tokens = issueTokens(db, record.UserId);
  return { status: 200, data: tokens };
});

route("POST", "/auth/logout", (db, { token, body }) => {
  db.accessTokens = db.accessTokens.filter((t) => t.token !== token);
  const record = db.refreshTokens.find((r) => r.Token === body?.refreshToken);
  if (record) record.IsRevoked = true;
  return { status: 200, data: { success: true } };
});

route("POST", "/auth/forgot-password", () => ({
  status: 200,
  data: { message: "If that email exists, a reset link is on its way." },
}));

/* ============================================================
   USER routes
   ============================================================ */
route("GET", "/user/me", (db, { token }) => ({
  status: 200,
  data: mapUser(requireAuth(db, token)),
}));

route("PUT", "/user/me", (db, { token, body }) => {
  const user = requireAuth(db, token);
  if (body?.name) user.FullName = body.name;
  if (body?.notificationEmail)
    user.DevNotificationEmail = body.notificationEmail;
  return { status: 200, data: mapUser(user) };
});

// NEW — see CHANGELOG.txt. Soft-deletes the caller's own account and
// revokes every active session for it.
route("DELETE", "/user/me", (db, { token }) => {
  const user = requireAuth(db, token);
  user.IsDeleted = true;
  db.accessTokens = db.accessTokens.filter((t) => t.userId !== user.Id);
  db.refreshTokens
    .filter((r) => r.UserId === user.Id)
    .forEach((r) => {
      r.IsRevoked = true;
    });
  return { status: 200, data: { success: true } };
});

// NEW — change password. See CHANGELOG.txt.
route("PUT", "/user/password", (db, { token, body }) => {
  const user = requireAuth(db, token);
  if (!body?.currentPassword || !body?.newPassword)
    throw new MockError(400, "Current and new password are required.");
  if (user.PasswordHash !== body.currentPassword)
    throw new MockError(401, "Current password is incorrect.");
  if (String(body.newPassword).length < 8)
    throw new MockError(400, "New password must be at least 8 characters.");
  user.PasswordHash = body.newPassword;
  return { status: 200, data: { success: true } };
});

// NEW — remaining email quota for the navbar badge. See CHANGELOG.txt.
// limit = plan.MaxEmailsPerMonth + any manually-granted remainingQuota
// credit; used = Sent/Resent submissions since the 1st of this month
// across the user's non-deleted projects.
route("GET", "/user/quota", (db, { token }) => {
  const user = requireAuth(db, token);
  const plan = currentPlan(db, user);
  const projectIds = new Set(
    db.projects
      .filter((p) => p.UserId === user.Id && !p.IsDeleted)
      .map((p) => p.Id),
  );
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const used = db.submissions.filter(
    (s) =>
      projectIds.has(s.ProjectId) &&
      ["Sent", "Resent"].includes(s.Status) &&
      new Date(s.ReceivedAt) >= periodStart,
  ).length;
  const limit = plan.MaxEmailsPerMonth + (user.remainingQuota || 0);
  return {
    status: 200,
    data: {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      planName: plan.Name,
      periodStart: periodStart.toISOString(),
    },
  };
});

/* ============================================================
   BILLING routes
   ============================================================ */
route("GET", "/billing/plans", (db, { token }) => {
  requireAuth(db, token);
  return {
    status: 200,
    data: db.plans.filter((p) => p.IsActive && !p.IsDeleted).map(mapPlan),
  };
});

route("GET", "/billing/subscription", (db, { token }) => {
  const user = requireAuth(db, token);
  const sub = db.subscriptions.find((s) => s.UserId === user.Id);
  if (!sub) return { status: 200, data: null };
  const plan = db.plans.find((p) => p.Id === sub.PlanId);
  return { status: 200, data: mapSubscription(sub, plan) };
});

route("POST", "/billing/subscribe", (db, { token, body }) => {
  const user = requireAuth(db, token);
  const plan = db.plans.find((p) => p.Id === body?.planId);
  if (!plan) throw new MockError(404, "Plan not found.");
  let sub = db.subscriptions.find((s) => s.UserId === user.Id);
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86400000);
  if (sub) {
    sub.PlanId = plan.Id;
    sub.Status = "Active";
    sub.StartDate = now.toISOString();
    sub.EndDate = end.toISOString();
  } else {
    sub = {
      Id: uuid(),
      UserId: user.Id,
      PlanId: plan.Id,
      Status: "Active",
      StartDate: now.toISOString(),
      EndDate: end.toISOString(),
      CreatedAt: now.toISOString(),
    };
    db.subscriptions.push(sub);
  }
  db.invoices.push({
    Id: uuid(),
    SubscriptionId: sub.Id,
    Amount: plan.MonthlyPrice,
    Status: "Paid",
    InvoiceDate: now.toISOString(),
    InvoicePdfUrl: "#",
  });
  return { status: 200, data: mapSubscription(sub, plan) };
});

route("GET", "/billing/invoices", (db, { token }) => {
  const user = requireAuth(db, token);
  const sub = db.subscriptions.find((s) => s.UserId === user.Id);
  const invoices = sub
    ? db.invoices.filter((i) => i.SubscriptionId === sub.Id)
    : [];
  return {
    status: 200,
    data: invoices
      .sort((a, b) => new Date(b.InvoiceDate) - new Date(a.InvoiceDate))
      .map(mapInvoice),
  };
});

/* ============================================================
   PROJECTS routes
   ============================================================ */
route("GET", "/projects", (db, { token }) => {
  const user = requireAuth(db, token);
  return {
    status: 200,
    data: db.projects
      .filter((p) => p.UserId === user.Id && !p.IsDeleted)
      .map(mapProject),
  };
});

route("POST", "/projects", (db, { token, body }) => {
  const user = requireAuth(db, token);
  const plan = currentPlan(db, user);
  const activeCount = db.projects.filter(
    (p) => p.UserId === user.Id && !p.IsDeleted,
  ).length;
  if (activeCount >= plan.MaxProjects)
    throw new MockError(
      403,
      `Your ${plan.Name} plan allows up to ${plan.MaxProjects} project(s).`,
    );
  if (!body?.name) throw new MockError(400, "Project name is required.");
  const project = {
    Id: projectId(),
    UserId: user.Id,
    Name: body.name,
    PublicApiKey: "pk_live_" + uuid().slice(0, 12),
    PrivateApiKey: "sk_live_" + uuid().slice(0, 12),
    RestrictedDomains: (body.domains || []).join(","),
    CreatedAt: new Date().toISOString(),
    IsActive: true,
    IsDeleted: false,
  };
  db.projects.push(project);
  return { status: 201, data: mapProject(project) };
});

route("GET", "/projects/:id", (db, { token, params }) => ({
  status: 200,
  data: mapProject(requireOwnedProject(db, requireAuth(db, token), params.id)),
}));

route("PUT", "/projects/:id", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  if (body?.name) project.Name = body.name;
  if (body?.domains) project.RestrictedDomains = body.domains.join(",");
  if (body?.allowNonBrowserApps !== undefined)
    project.AllowNonBrowserApps = !!body.allowNonBrowserApps;
  if (body?.requirePrivateKey !== undefined)
    project.RequirePrivateKey = !!body.requirePrivateKey;
  return { status: 200, data: mapProject(project) };
});

// NEW — dedicated pause/resume toggle, kept separate from PUT (settings edit)
route("PUT", "/projects/:id/status", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  project.IsActive = !!body?.isActive;
  return { status: 200, data: mapProject(project) };
});

route("POST", "/projects/:id/keys", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  project.PublicApiKey = "pk_live_" + uuid().slice(0, 12);
  project.PrivateApiKey = "sk_live_" + uuid().slice(0, 12);
  return { status: 200, data: mapProject(project) };
});

route("DELETE", "/projects/:id", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  project.IsDeleted = true; // soft delete — see CHANGELOG.txt
  return { status: 200, data: { success: true } };
});

/* ============================================================
   SERVICES routes
   ============================================================ */
route("GET", "/projects/:id/services", (db, { token, params }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  return {
    status: 200,
    data: db.services
      .filter((s) => s.ProjectId === params.id && !s.IsDeleted)
      .map(mapService),
  };
});

route("POST", "/projects/:id/services", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const plan = currentPlan(db, user);
  const activeCount = db.services.filter(
    (s) => s.ProjectId === params.id && !s.IsDeleted,
  ).length;
  if (activeCount >= plan.MaxServices)
    throw new MockError(
      403,
      `Your ${plan.Name} plan allows up to ${plan.MaxServices} service(s) per project.`,
    );
  const service = {
    Id: serviceId(),
    ProjectId: params.id,
    ProviderType: body?.provider || "SMTP",
    SmtpHost: body?.host || null,
    SmtpPort: body?.port || null,
    Username: body?.username || null,
    EncryptedPassword: body?.password ? "••••••••" : null,
    SecretApiKey: body?.apiKey || null,
    FromEmail: body?.fromEmail || "",
    FromName: body?.fromName || "",
    IsActive: true,
    IsDeleted: false,
  };
  db.services.push(service);
  return { status: 201, data: mapService(service) };
});

route("PUT", "/services/:serviceId", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const service = db.services.find(
    (s) => s.Id === params.serviceId && !s.IsDeleted,
  );
  if (!service) throw new MockError(404, "Service not found.");
  requireOwnedProject(db, user, service.ProjectId);
  if (body?.provider) service.ProviderType = body.provider;
  if (body?.host) service.SmtpHost = body.host;
  if (body?.port) service.SmtpPort = body.port;
  if (body?.username) service.Username = body.username;
  if (body?.password) service.EncryptedPassword = "••••••••";
  if (body?.apiKey) service.SecretApiKey = body.apiKey;
  if (body?.fromEmail) service.FromEmail = body.fromEmail;
  if (body?.fromName) service.FromName = body.fromName;
  return { status: 200, data: mapService(service) };
});

// NEW — pause/resume toggle
route("PUT", "/services/:serviceId/status", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const service = db.services.find(
    (s) => s.Id === params.serviceId && !s.IsDeleted,
  );
  if (!service) throw new MockError(404, "Service not found.");
  requireOwnedProject(db, user, service.ProjectId);
  service.IsActive = !!body?.isActive;
  return { status: 200, data: mapService(service) };
});

route("DELETE", "/services/:serviceId", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const service = db.services.find(
    (s) => s.Id === params.serviceId && !s.IsDeleted,
  );
  if (!service) throw new MockError(404, "Service not found.");
  requireOwnedProject(db, user, service.ProjectId);
  service.IsDeleted = true;
  return { status: 200, data: { success: true } };
});

/* ============================================================
   INTEGRATIONS routes
   ============================================================ */
route("GET", "/projects/:id/integrations", (db, { token, params }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  return {
    status: 200,
    data: db.integrations
      .filter((i) => i.ProjectId === params.id && !i.IsDeleted)
      .map(mapIntegration),
  };
});

route("POST", "/projects/:id/integrations", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const plan = currentPlan(db, user);
  if (
    (body?.type || "").toLowerCase() === "telegram" &&
    !plan.CanUseTelegramBot
  )
    throw new MockError(
      403,
      `Your ${plan.Name} plan does not include the Telegram integration.`,
    );
  const integration = {
    Id: uuid(),
    ProjectId: params.id,
    IntegrationType: body?.type || "Telegram",
    ConfigJson: JSON.stringify(body?.config || {}),
    IsActive: true,
    IsDeleted: false,
  };
  db.integrations.push(integration);
  return { status: 201, data: mapIntegration(integration) };
});

route("DELETE", "/integrations/:intId", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const integration = db.integrations.find(
    (i) => i.Id === params.intId && !i.IsDeleted,
  );
  if (!integration) throw new MockError(404, "Integration not found.");
  requireOwnedProject(db, user, integration.ProjectId);
  integration.IsDeleted = true;
  return { status: 200, data: { success: true } };
});

/* ============================================================
   TEMPLATES routes — full field set per CHANGELOG.txt
   ============================================================ */
route("GET", "/projects/:id/templates", (db, { token, params }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  return {
    status: 200,
    data: db.templates
      .filter((t) => t.ProjectId === params.id && !t.IsDeleted)
      .map((t) => mapTemplate(t, db)),
  };
});

route("POST", "/projects/:id/templates", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const plan = currentPlan(db, user);
  const activeCount = db.templates.filter(
    (t) => t.ProjectId === params.id && !t.IsDeleted,
  ).length;
  if (activeCount >= plan.MaxTemplates)
    throw new MockError(
      403,
      `Your ${plan.Name} plan allows up to ${plan.MaxTemplates} template(s) per project.`,
    );
  if (!body?.name) throw new MockError(400, "Template name is required.");
  const tpl = {
    Id: templateId(),
    ProjectId: params.id,
    Name: body.name,
    Subject: body.subject || "",
    ContentHtml: body.html || "",
    DoSaveInHistory: body.doSaveInHistory !== false,
    EnableRecaptchaV2: !!body.enableRecaptchaV2,
    RecaptchaSecretKey: null,
    RecaptchaSiteKey: body.enableRecaptchaV2
      ? body.recaptchaSiteKey || null
      : null,
    EnableAppCheck: !!body.enableAppCheck,
    ToEmail: body.toEmail || null,
    ReplyTo: body.replyTo || null,
    Bcc: body.bcc || null,
    Cc: body.cc || null,
    EnableAutoReply: !!body.enableAutoReply,
    AutoReplyTemplateId: body.autoReplyTemplateId || null,
    ServiceId: body.serviceId || null,
    CreatedAt: new Date().toISOString(),
    IsActive: true,
    IsDeleted: false,
  };
  db.templates.push(tpl);
  return { status: 201, data: mapTemplate(tpl, db) };
});

route("PUT", "/templates/:id", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id && !t.IsDeleted);
  if (!tpl) throw new MockError(404, "Template not found.");
  requireOwnedProject(db, user, tpl.ProjectId);
  if (body?.name) tpl.Name = body.name;
  if (body?.subject !== undefined) tpl.Subject = body.subject;
  if (body?.html !== undefined) tpl.ContentHtml = body.html;
  if (body?.toEmail !== undefined) tpl.ToEmail = body.toEmail;
  if (body?.replyTo !== undefined) tpl.ReplyTo = body.replyTo;
  if (body?.cc !== undefined) tpl.Cc = body.cc;
  if (body?.bcc !== undefined) tpl.Bcc = body.bcc;
  if (body?.doSaveInHistory !== undefined)
    tpl.DoSaveInHistory = !!body.doSaveInHistory;
  if (body?.enableRecaptchaV2 !== undefined) {
    tpl.EnableRecaptchaV2 = !!body.enableRecaptchaV2;
    if (!tpl.EnableRecaptchaV2) tpl.RecaptchaSiteKey = null;
  }
  if (body?.recaptchaSiteKey !== undefined && tpl.EnableRecaptchaV2)
    tpl.RecaptchaSiteKey = body.recaptchaSiteKey || null;
  if (body?.enableAppCheck !== undefined)
    tpl.EnableAppCheck = !!body.enableAppCheck;
  if (body?.enableAutoReply !== undefined)
    tpl.EnableAutoReply = !!body.enableAutoReply;
  if (body?.autoReplyTemplateId !== undefined)
    tpl.AutoReplyTemplateId = body.autoReplyTemplateId || null;
  if (body?.serviceId !== undefined) tpl.ServiceId = body.serviceId || null;
  return { status: 200, data: mapTemplate(tpl, db) };
});

// NEW — pause/resume toggle
route("PUT", "/templates/:id/status", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id && !t.IsDeleted);
  if (!tpl) throw new MockError(404, "Template not found.");
  requireOwnedProject(db, user, tpl.ProjectId);
  tpl.IsActive = !!body?.isActive;
  return { status: 200, data: mapTemplate(tpl, db) };
});

route("DELETE", "/templates/:id", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id && !t.IsDeleted);
  if (!tpl) throw new MockError(404, "Template not found.");
  requireOwnedProject(db, user, tpl.ProjectId);
  tpl.IsDeleted = true;
  return { status: 200, data: { success: true } };
});

route("POST", "/templates/:id/attachments", (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id && !t.IsDeleted);
  if (!tpl) throw new MockError(404, "Template not found.");
  requireOwnedProject(db, user, tpl.ProjectId);
  const plan = currentPlan(db, user);
  const existing = db.attachments.filter((a) => a.TemplateId === tpl.Id);
  if (existing.length >= plan.MaxAttachmentsPerTemplate) {
    throw new MockError(
      403,
      `Your ${plan.Name} plan allows up to ${plan.MaxAttachmentsPerTemplate} attachment(s) per template.`,
    );
  }
  const fileName = (body && body.get && body.get("fileName")) || "attachment";
  const fileSize = Number(body && body.get && body.get("fileSize")) || 0;
  const attachment = {
    Id: uuid(),
    TemplateId: tpl.Id,
    FileName: fileName,
    FileUrl: "blob:mock/" + uuid(),
    FileSizeInBytes: fileSize,
  };
  db.attachments.push(attachment);
  return {
    status: 201,
    data: {
      id: attachment.Id,
      fileName: attachment.FileName,
      fileUrl: attachment.FileUrl,
      fileSizeInBytes: attachment.FileSizeInBytes,
    },
  };
});

// NEW — remove a single attachment (needed so users can stay under their
// plan's attachment limit without deleting the whole template).
route(
  "DELETE",
  "/templates/:id/attachments/:attId",
  (db, { token, params }) => {
    const user = requireAuth(db, token);
    const tpl = db.templates.find((t) => t.Id === params.id && !t.IsDeleted);
    if (!tpl) throw new MockError(404, "Template not found.");
    requireOwnedProject(db, user, tpl.ProjectId);
    db.attachments = db.attachments.filter(
      (a) => !(a.Id === params.attId && a.TemplateId === tpl.Id),
    );
    return { status: 200, data: { success: true } };
  },
);

/* ============================================================
   SUBMISSIONS routes
   ============================================================ */
route("POST", "/submit/:publicApiKey", (db, { params, body }) => {
  const project = db.projects.find(
    (p) => p.PublicApiKey === params.publicApiKey && !p.IsDeleted,
  );
  if (!project) throw new MockError(404, "Invalid API key.");
  if (!project.IsActive)
    throw new MockError(
      403,
      "This project is paused and not accepting submissions.",
    );
  // NEW — "Use Private Key (recommended)" project setting: when on, every
  // request must include the project's private key, browser or not.
  if (project.RequirePrivateKey && body?.privateKey !== project.PrivateApiKey) {
    throw new MockError(
      403,
      "This project requires the private key on every request.",
    );
  }
  // NEW — "Allow EmailyAPI for non-browser applications": when on, a real
  // backend would skip AppCheck/reCAPTCHA verification here for this
  // project. The mock has no real bot-check to bypass, so this is a no-op
  // beyond persisting the flag — see CHANGELOG.txt.
  const template = db.templates.find(
    (t) => t.Id === body?.templateId && !t.IsDeleted,
  );
  const submission = {
    Id: uuid(),
    ProjectId: project.Id,
    TemplateId: template?.Id || null,
    RecipientEmail: body?.to || template?.ToEmail || "unknown",
    Subject: body?.subject || template?.Subject || "New submission",
    PayloadJson: JSON.stringify(body?.fields || body || {}),
    RawHtmlBody: null,
    ReceivedAt: new Date().toISOString(),
    Status: "Pending",
    AiSummary: null,
    ErrorMessage: null,
    SentAt: null,
  };
  db.submissions.push(submission);
  saveDb(db);
  setTimeout(() => {
    const liveDb = loadDb();
    const s = liveDb.submissions.find((x) => x.Id === submission.Id);
    if (!s) return;
    if (Math.random() < 0.15) {
      s.Status = "Failed";
      s.ErrorMessage = "SMTP 421: temporary delivery failure";
    } else {
      s.Status = "Sent";
      s.SentAt = new Date().toISOString();
    }
    saveDb(liveDb);
  }, 2000);
  return {
    status: 202,
    data: { id: submission.Id, status: submission.Status },
  };
});

route("GET", "/projects/:id/submissions", (db, { token, params, query }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const page = Math.max(1, Number(query.get("page")) || 1);
  const pageSize = Math.max(1, Number(query.get("pageSize")) || 20);
  const all = db.submissions
    .filter((s) => s.ProjectId === params.id)
    .sort((a, b) => new Date(b.ReceivedAt) - new Date(a.ReceivedAt));
  const start = (page - 1) * pageSize;
  return {
    status: 200,
    data: {
      items: all.slice(start, start + pageSize).map(mapSubmission),
      page,
      pageSize,
      total: all.length,
    },
  };
});

route("GET", "/submissions/:id", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const submission = db.submissions.find((s) => s.Id === params.id);
  if (!submission) throw new MockError(404, "Submission not found.");
  requireOwnedProject(db, user, submission.ProjectId);
  return { status: 200, data: mapSubmission(submission) };
});

route("POST", "/submissions/:id/retry", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const submission = db.submissions.find((s) => s.Id === params.id);
  if (!submission) throw new MockError(404, "Submission not found.");
  requireOwnedProject(db, user, submission.ProjectId);
  if (submission.Status !== "Failed")
    throw new MockError(
      400,
      "Only submissions with status 'Failed' can be retried.",
    );
  submission.Status = "Pending";
  submission.ErrorMessage = null;
  saveDb(db);
  setTimeout(() => {
    const liveDb = loadDb();
    const s = liveDb.submissions.find((x) => x.Id === submission.Id);
    if (!s) return;
    s.Status = "Resent";
    s.SentAt = new Date().toISOString();
    saveDb(liveDb);
  }, 1500);
  return { status: 200, data: mapSubmission(submission) };
});

/* ============================================================
   ANALYTICS routes — NEW, see CHANGELOG.txt
   ============================================================ */
route("GET", "/analytics/overview", (db, { token }) => {
  const user = requireAuth(db, token);
  const projects = db.projects.filter(
    (p) => p.UserId === user.Id && !p.IsDeleted,
  );
  const projectIds = new Set(projects.map((p) => p.Id));
  const submissions = db.submissions.filter((s) => projectIds.has(s.ProjectId));

  const byProject = projects.map((p) => {
    const items = submissions.filter((s) => s.ProjectId === p.Id);
    return {
      projectId: p.Id,
      projectName: p.Name,
      total: items.length,
      sent: items.filter((s) => ["Sent", "Resent"].includes(s.Status)).length,
      failed: items.filter((s) => s.Status === "Failed").length,
      successRate: successRateOf(items),
    };
  });

  return {
    status: 200,
    data: {
      totalSent: submissions.filter((s) =>
        ["Sent", "Resent"].includes(s.Status),
      ).length,
      totalFailed: submissions.filter((s) => s.Status === "Failed").length,
      totalPending: submissions.filter((s) => s.Status === "Pending").length,
      total: submissions.length,
      successRate: successRateOf(submissions),
      volumeByDay: groupByDay(submissions, "ReceivedAt"),
      byProject,
    },
  };
});

route("GET", "/analytics/projects/:id", (db, { token, params }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  const submissions = db.submissions.filter((s) => s.ProjectId === project.Id);
  const templates = db.templates.filter(
    (t) => t.ProjectId === project.Id && !t.IsDeleted,
  );

  const byTemplate = templates.map((t) => {
    const items = submissions.filter((s) => s.TemplateId === t.Id);
    return {
      templateId: t.Id,
      templateName: t.Name,
      total: items.length,
      sent: items.filter((s) => ["Sent", "Resent"].includes(s.Status)).length,
      failed: items.filter((s) => s.Status === "Failed").length,
      successRate: successRateOf(items),
    };
  });

  return {
    status: 200,
    data: {
      projectId: project.Id,
      projectName: project.Name,
      totalSent: submissions.filter((s) =>
        ["Sent", "Resent"].includes(s.Status),
      ).length,
      totalFailed: submissions.filter((s) => s.Status === "Failed").length,
      totalPending: submissions.filter((s) => s.Status === "Pending").length,
      total: submissions.length,
      successRate: successRateOf(submissions),
      volumeByDay: groupByDay(submissions, "ReceivedAt"),
      byTemplate,
    },
  };
});

route("GET", "/admin/analytics", (db, { token }) => {
  requireAdmin(db, token);
  const activeUsers = db.users.filter((u) => !u.IsDeleted && u.IsActive);
  const suspendedUsers = db.users.filter((u) => !u.IsDeleted && !u.IsActive);
  const projects = db.projects.filter((p) => !p.IsDeleted);
  const submissions = db.submissions;

  const activeSubs = db.subscriptions.filter((s) => s.Status === "Active");
  const revenueByPlan = db.plans
    .filter((p) => !p.IsDeleted)
    .map((plan) => {
      const subscribers = activeSubs.filter((s) => s.PlanId === plan.Id).length;
      return {
        planName: plan.Name,
        subscriberCount: subscribers,
        mrr: subscribers * plan.MonthlyPrice,
      };
    });

  return {
    status: 200,
    data: {
      totalUsers: activeUsers.length + suspendedUsers.length,
      activeUsers: activeUsers.length,
      suspendedUsers: suspendedUsers.length,
      totalProjects: projects.length,
      totalEmailsSent: submissions.filter((s) =>
        ["Sent", "Resent"].includes(s.Status),
      ).length,
      totalEmailsFailed: submissions.filter((s) => s.Status === "Failed")
        .length,
      overallSuccessRate: successRateOf(submissions),
      volumeByDay: groupByDay(submissions, "ReceivedAt"),
      revenueByPlan,
      totalMRR: revenueByPlan.reduce((sum, p) => sum + p.mrr, 0),
      systemHealth: {
        status: "Healthy",
        queueDepth: submissions.filter((s) => s.Status === "Pending").length,
        avgDeliveryTimeMs: 842,
      },
    },
  };
});

/* ============================================================
   ADMIN routes
   ============================================================ */
route("GET", "/admin/dashboard", (db, { token }) => {
  requireAdmin(db, token);
  return {
    status: 200,
    data: {
      totalUsers: db.users.filter((u) => !u.IsDeleted).length,
      activeUsers: db.users.filter((u) => !u.IsDeleted && u.IsActive).length,
      totalProjects: db.projects.filter((p) => !p.IsDeleted).length,
      totalRevenue: db.invoices
        .filter((i) => i.Status === "Paid")
        .reduce((sum, i) => sum + i.Amount, 0),
      pendingSubmissions: db.submissions.filter((s) => s.Status === "Pending")
        .length,
      failedSubmissions: db.submissions.filter((s) => s.Status === "Failed")
        .length,
    },
  };
});

route("GET", "/admin/users", (db, { token, query }) => {
  requireAdmin(db, token);
  const search = (query.get("search") || "").toLowerCase();
  const users = db.users.filter(
    (u) =>
      !u.IsDeleted &&
      (!search ||
        u.FullName.toLowerCase().includes(search) ||
        u.Email.toLowerCase().includes(search)),
  );
  return { status: 200, data: users.map(mapUser) };
});

route("PUT", "/admin/users/:id/status", (db, { token, params, body }) => {
  requireAdmin(db, token);
  const user = db.users.find((u) => u.Id === params.id && !u.IsDeleted);
  if (!user) throw new MockError(404, "User not found.");
  user.IsActive = !!body?.isActive;
  return { status: 200, data: mapUser(user) };
});

// REMOVED — PUT /admin/users/{id}/quota (manual remainingQuota editing).
// Per the Aug 17 update this is no longer allowed as an admin action.
// See CHANGELOG.txt.

// NEW — a specific user's projects, for the admin Users drill-down. See CHANGELOG.txt.
route("GET", "/admin/users/:id/projects", (db, { token, params }) => {
  requireAdmin(db, token);
  const list = db.projects
    .filter((p) => p.UserId === params.id && !p.IsDeleted)
    .map((p) => mapProject(p));
  return { status: 200, data: list };
});

route("POST", "/admin/plans", (db, { token, body }) => {
  requireAdmin(db, token);
  if (body?.id) {
    const plan = db.plans.find((p) => p.Id === body.id);
    if (!plan) throw new MockError(404, "Plan not found.");
    Object.assign(plan, {
      Name: body.name ?? plan.Name,
      MonthlyPrice: body.price ?? plan.MonthlyPrice,
      MaxEmailsPerMonth: body.maxEmailsPerMonth ?? plan.MaxEmailsPerMonth,
      MaxProjects: body.maxProjects ?? plan.MaxProjects,
      MaxServices: body.maxServices ?? plan.MaxServices,
      MaxTemplates: body.maxTemplates ?? plan.MaxTemplates,
      MaxAttachmentsPerTemplate:
        body.maxAttachmentsPerTemplate ?? plan.MaxAttachmentsPerTemplate,
      CanUseGoogleSheets: body.canUseGoogleSheets ?? plan.CanUseGoogleSheets,
      CanUseAI: body.canUseAI ?? plan.CanUseAI,
      CanUseTelegramBot: body.canUseTelegramBot ?? plan.CanUseTelegramBot,
      IsActive: body.isActive ?? plan.IsActive,
    });
    return { status: 200, data: mapPlan(plan) };
  }
  const plan = {
    Id: uuid(),
    Name: body?.name || "New plan",
    MonthlyPrice: body?.price || 0,
    MaxEmailsPerMonth: body?.maxEmailsPerMonth || 0,
    MaxProjects: body?.maxProjects || 1,
    MaxServices: body?.maxServices || 1,
    MaxTemplates: body?.maxTemplates || 1,
    MaxAttachmentsPerTemplate: body?.maxAttachmentsPerTemplate || 0,
    CanUseGoogleSheets: !!body?.canUseGoogleSheets,
    CanUseAI: !!body?.canUseAI,
    CanUseTelegramBot: !!body?.canUseTelegramBot,
    IsActive: true,
    IsDeleted: false,
  };
  db.plans.push(plan);
  return { status: 201, data: mapPlan(plan) };
});

route("GET", "/admin/banned", (db, { token }) => {
  requireAdmin(db, token);
  return { status: 200, data: db.banned.map(mapBanned) };
});

route("POST", "/admin/banned", (db, { token, body }) => {
  requireAdmin(db, token);
  const { value, violationCount, bannedUntil } = body || {};
  if (!value) throw new MockError(400, "An IP address or email is required.");
  if (violationCount < 1 || violationCount > 8)
    throw new MockError(400, "violationCount must be between 1 and 8.");
  const entry = {
    Id: value,
    violationCount: Number(violationCount) || 1,
    bannedUntil:
      bannedUntil || new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  db.banned = db.banned.filter((b) => b.Id !== value);
  db.banned.push(entry);
  return { status: 201, data: mapBanned(entry) };
});

// NEW — decrement violationCount by 1 (e.g. after a manual review finds a
// false positive); auto-removes the ban once it reaches zero. See CHANGELOG.txt.
route("PUT", "/admin/banned/:id/reduce", (db, { token, params }) => {
  requireAdmin(db, token);
  const id = decodeURIComponent(params.id);
  const entry = db.banned.find((b) => b.Id === id);
  if (!entry) throw new MockError(404, "Ban entry not found.");
  entry.violationCount -= 1;
  if (entry.violationCount <= 0) {
    db.banned = db.banned.filter((b) => b.Id !== id);
    return { status: 200, data: { removed: true } };
  }
  return { status: 200, data: mapBanned(entry) };
});

route("DELETE", "/admin/banned/:id", (db, { token, params }) => {
  requireAdmin(db, token);
  db.banned = db.banned.filter((b) => b.Id !== decodeURIComponent(params.id));
  return { status: 200, data: { success: true } };
});

/* ============================================================
   NEW — system-wide browse endpoints (Projects/Templates/Services/Logs)
   Shared "count vs capped list" behavior: no query param returns
   { count }; a query param returns { items } capped at 100. See
   CHANGELOG.txt.
   ============================================================ */
function countOrList(query, paramName, allItems, mapFn, maxSize = 100) {
  const raw = query.get(paramName);
  if (raw === null) return { count: allItems.length };
  const size = Math.max(1, Math.min(maxSize, Number(raw) || maxSize));
  return { items: allItems.slice(0, size).map(mapFn) };
}

route("GET", "/admin/projects", (db, { token, query }) => {
  requireAdmin(db, token);
  const all = db.projects
    .filter((p) => !p.IsDeleted)
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  return {
    status: 200,
    data: countOrList(query, "p", all, (p) => mapAdminProject(p, db)),
  };
});

route("GET", "/admin/projects/:id/templates", (db, { token, params }) => {
  requireAdmin(db, token);
  const list = db.templates
    .filter((t) => t.ProjectId === params.id && !t.IsDeleted)
    .map((t) => mapTemplate(t, db));
  return { status: 200, data: list };
});

route("GET", "/admin/projects/:id/services", (db, { token, params }) => {
  requireAdmin(db, token);
  const list = db.services
    .filter((s) => s.ProjectId === params.id && !s.IsDeleted)
    .map(mapService);
  return { status: 200, data: list };
});

route("GET", "/admin/templates", (db, { token, query }) => {
  requireAdmin(db, token);
  const all = db.templates
    .filter((t) => !t.IsDeleted)
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  return {
    status: 200,
    data: countOrList(query, "t", all, (t) => mapTemplate(t, db)),
  };
});

route("GET", "/admin/templates/:id", (db, { token, params }) => {
  requireAdmin(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id && !t.IsDeleted);
  if (!tpl) throw new MockError(404, "Template not found.");
  return { status: 200, data: mapTemplate(tpl, db) };
});

route("GET", "/admin/services", (db, { token, query }) => {
  requireAdmin(db, token);
  const all = db.services.filter((s) => !s.IsDeleted);
  return { status: 200, data: countOrList(query, "s", all, mapService) };
});

route("GET", "/admin/services/:id", (db, { token, params }) => {
  requireAdmin(db, token);
  const svc = db.services.find((s) => s.Id === params.id && !s.IsDeleted);
  if (!svc) throw new MockError(404, "Service not found.");
  return { status: 200, data: mapService(svc) };
});

route("GET", "/admin/logs", (db, { token, query }) => {
  requireAdmin(db, token);
  const all = [...db.systemLogs].sort(
    (a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt),
  );
  const mapLog = (l) => ({
    id: l.Id,
    level: l.LogLevel,
    source: l.Source,
    message: l.Message,
    userId: l.UserId,
    projectId: l.ProjectId,
    ip: l.IpAddress,
    createdAt: l.CreatedAt,
  });
  return { status: 200, data: countOrList(query, "l", all, mapLog) };
});

/* ============================================================
   Router entry point — mimics a fetch() Response
   ============================================================ */
export async function mockFetch(method, endpoint, { token, body } = {}) {
  await delay();

  const [pathname, queryString] = endpoint.split("?");
  const query = new URLSearchParams(queryString || "");
  const match = routes.find(
    (r) => r.method === method && r.regex.test(pathname),
  );

  const db = loadDb();

  const respond = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h) =>
        h.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

  if (!match)
    return respond(404, { message: `No mock route for ${method} ${pathname}` });

  const groups = match.regex.exec(pathname).slice(1);
  const params = {};
  match.names.forEach((name, i) => {
    params[name] = groups[i];
  });

  try {
    const result = match.handler(db, { token, body, params, query });
    saveDb(db);
    return respond(result.status, result.data);
  } catch (err) {
    if (err instanceof MockError)
      return respond(err.status, { message: err.message });
    console.error("[Emaily mock] Unexpected error:", err);
    return respond(500, { message: "Unexpected mock server error." });
  }
}

/* ----------------------------------------------------------
   Dev convenience: reset the mock database from the console
   with `resetEmailyMockDb()`.
   ---------------------------------------------------------- */
if (typeof window !== "undefined") {
  window.resetEmailyMockDb = () => {
    localStorage.removeItem(DB_KEY);
    console.log("[Emaily mock] Database reset. Reload the page.");
  };
}
