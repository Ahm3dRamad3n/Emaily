/* ============================================================
   EMAILY — mockDB.js
   A temporary, browser-only backend so the UI can be built and
   tested before the real C# API exists. Data lives in
   localStorage and is shaped to match Emaily.sql exactly:
   table names, column names, ID formats, and IsActive soft
   deletes. Swap USE_MOCK to false in api.js when the real API
   is ready — nothing else in the app needs to change.

   THIS FILE IS NOT SECURE AND IS NOT A REFERENCE FOR THE REAL
   BACKEND. Passwords are stored in plain text here purely so
   the login form has something to check against in the browser.
   The real C# API must hash passwords, validate everything
   server-side, and never trust the client.
   ============================================================ */

const DB_KEY = 'emaily_mock_db';
const LATENCY_MS = [350, 650]; // simulated network latency range

/* ----------------------------------------------------------
   ID helpers — mirror the SQL defaults
   ---------------------------------------------------------- */
function uuid() {
  // RFC4122-ish v4, good enough for a mock UNIQUEIDENTIFIER
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const projectId = () => 'p_' + uuid();
const serviceId = () => 's_' + uuid();
const templateId = () => 't_' + uuid();

function delay() {
  const [min, max] = LATENCY_MS;
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

/* ----------------------------------------------------------
   Storage load / save
   ---------------------------------------------------------- */
function loadDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through to reseed */ }
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
   Tables: Users, Plans, Subscriptions, Invoices, Projects,
   ConnectedServices, Templates, TemplateAttachments,
   Integrations, Submissions, RefreshTokens, AccessTokens
   (mock-only session table), SystemLogs, Banned
   ---------------------------------------------------------- */
function seedDb() {
  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
  const daysFromNow = (n) => new Date(now + n * 86400000).toISOString();

  const adminUserId = uuid();
  const demoUserId = uuid();

  const planFree = uuid();
  const planPro = uuid();
  const planBiz = uuid();

  const demoProjectId = projectId();
  const demoServiceId = serviceId();
  const tplContact = templateId();
  const tplWelcome = templateId();
  const demoSubId = uuid();

  return {
    // -------- Users --------
    // NOTE: PasswordHash holds a PLAIN password in this mock only.
    users: [
      {
        Id: adminUserId,
        FullName: 'Emaily Admin',
        Email: '[email protected]',
        PasswordHash: 'admin123',
        DevNotificationEmail: '[email protected]',
        CreatedAt: daysAgo(120),
        MissingEmails: 0,
        Roles: 'Admin',
        IsActive: true,
      },
      {
        Id: demoUserId,
        FullName: 'Sara Ahmed',
        Email: '[email protected]',
        PasswordHash: 'demo1234',
        DevNotificationEmail: '[email protected]',
        CreatedAt: daysAgo(40),
        MissingEmails: 3,
        Roles: 'User',
        IsActive: true,
      },
    ],

    // -------- Plans --------
    plans: [
      { Id: planFree, Name: 'Free', MonthlyPrice: 0, MaxEmailsPerMonth: 500, MaxProjects: 1, MaxServices: 1, MaxTemplates: 3, CanUseGoogleSheets: false, CanUseAI: false, CanUseTelegramBot: false, IsActive: true },
      { Id: planPro, Name: 'Pro', MonthlyPrice: 19, MaxEmailsPerMonth: 10000, MaxProjects: 5, MaxServices: 5, MaxTemplates: 20, CanUseGoogleSheets: true, CanUseAI: true, CanUseTelegramBot: true, IsActive: true },
      { Id: planBiz, Name: 'Business', MonthlyPrice: 79, MaxEmailsPerMonth: 100000, MaxProjects: 25, MaxServices: 20, MaxTemplates: 100, CanUseGoogleSheets: true, CanUseAI: true, CanUseTelegramBot: true, IsActive: true },
    ],

    // -------- Subscriptions --------
    subscriptions: [
      { Id: demoSubId, UserId: demoUserId, PlanId: planPro, Status: 'Active', StartDate: daysAgo(15), EndDate: daysFromNow(15), CreatedAt: daysAgo(15) },
    ],

    // -------- Invoices --------
    invoices: [
      { Id: uuid(), SubscriptionId: demoSubId, Amount: 19, Status: 'Paid', InvoiceDate: daysAgo(15), InvoicePdfUrl: '#' },
      { Id: uuid(), SubscriptionId: demoSubId, Amount: 19, Status: 'Paid', InvoiceDate: daysAgo(45), InvoicePdfUrl: '#' },
    ],

    // -------- Projects --------
    projects: [
      {
        Id: demoProjectId,
        UserId: demoUserId,
        Name: 'Portfolio Site',
        PublicApiKey: 'pk_live_demo123',
        PrivateApiKey: 'sk_live_demo456',
        RestrictedDomains: 'sara-portfolio.dev',
        CreatedAt: daysAgo(38),
        IsActive: true,
      },
    ],

    // -------- ConnectedServices --------
    services: [
      {
        Id: demoServiceId,
        ProjectId: demoProjectId,
        ProviderType: 'SMTP',
        SmtpHost: 'smtp.mailtrap.io',
        SmtpPort: 587,
        Username: 'demo_user',
        EncryptedPassword: '••••••••',
        SecretApiKey: null,
        FromEmail: '[email protected]',
        FromName: "Sara's Portfolio",
        IsActive: true,
      },
    ],

    // -------- Templates --------
    templates: [
      {
        Id: tplContact,
        ProjectId: demoProjectId,
        Name: 'contact-form',
        Subject: 'New message from {{name}}',
        ContentHtml: '<h1>New submission</h1><p>{{message}}</p>',
        DoSaveInHistory: true,
        EnableRecaptchaV2: true,
        RecaptchaSecretKey: null,
        EnableAppCheck: false,
        ToEmail: '[email protected]',
        ReplyTo: null,
        Bcc: null,
        Cc: null,
        EnableAutoReply: false,
        AutoReplyTemplateId: null,
        CreatedAt: daysAgo(35),
        IsActive: true,
      },
      {
        Id: tplWelcome,
        ProjectId: demoProjectId,
        Name: 'newsletter-welcome',
        Subject: 'Welcome aboard!',
        ContentHtml: '<h1>Thanks for subscribing</h1>',
        DoSaveInHistory: true,
        EnableRecaptchaV2: false,
        RecaptchaSecretKey: null,
        EnableAppCheck: false,
        ToEmail: null,
        ReplyTo: null,
        Bcc: null,
        Cc: null,
        EnableAutoReply: false,
        AutoReplyTemplateId: null,
        CreatedAt: daysAgo(20),
        IsActive: true,
      },
    ],

    attachments: [],

    // -------- Integrations --------
    integrations: [
      { Id: uuid(), ProjectId: demoProjectId, IntegrationType: 'Telegram', ConfigJson: JSON.stringify({ chatId: '@sara_alerts' }), IsActive: true },
    ],

    // -------- Submissions --------
    submissions: [
      { Id: uuid(), ProjectId: demoProjectId, TemplateId: tplContact, RecipientEmail: '[email protected]', Subject: 'New message from Omar', PayloadJson: JSON.stringify({ name: 'Omar', message: 'Loved your work!' }), RawHtmlBody: null, ReceivedAt: daysAgo(1), Status: 'Sent', AiSummary: null, ErrorMessage: null, SentAt: daysAgo(1) },
      { Id: uuid(), ProjectId: demoProjectId, TemplateId: tplContact, RecipientEmail: '[email protected]', Subject: 'New message from Lina', PayloadJson: JSON.stringify({ name: 'Lina', message: 'Are you available for freelance?' }), RawHtmlBody: null, ReceivedAt: daysAgo(2), Status: 'Failed', AiSummary: 'The receiving mail server rejected the message due to an SPF check failure — the sending domain is not authorized for this SMTP relay.', ErrorMessage: 'SMTP 550: SPF check failed', SentAt: null },
      { Id: uuid(), ProjectId: demoProjectId, TemplateId: tplContact, RecipientEmail: '[email protected]', Subject: 'New message from Karim', PayloadJson: JSON.stringify({ name: 'Karim', message: 'Great portfolio!' }), RawHtmlBody: null, ReceivedAt: daysAgo(3), Status: 'Sent', AiSummary: null, ErrorMessage: null, SentAt: daysAgo(3) },
      { Id: uuid(), ProjectId: demoProjectId, TemplateId: tplWelcome, RecipientEmail: '[email protected]', Subject: 'Welcome aboard!', PayloadJson: JSON.stringify({ email: '[email protected]' }), RawHtmlBody: null, ReceivedAt: daysAgo(4), Status: 'Sent', AiSummary: null, ErrorMessage: null, SentAt: daysAgo(4) },
      { Id: uuid(), ProjectId: demoProjectId, TemplateId: tplContact, RecipientEmail: '[email protected]', Subject: 'New message from Yara', PayloadJson: JSON.stringify({ name: 'Yara', message: 'Question about pricing' }), RawHtmlBody: null, ReceivedAt: daysAgo(5), Status: 'Pending', AiSummary: null, ErrorMessage: null, SentAt: null },
      { Id: uuid(), ProjectId: demoProjectId, TemplateId: tplContact, RecipientEmail: '[email protected]', Subject: 'New message from Tarek', PayloadJson: JSON.stringify({ name: 'Tarek', message: 'Bug on your site' }), RawHtmlBody: null, ReceivedAt: daysAgo(7), Status: 'Resent', AiSummary: null, ErrorMessage: null, SentAt: daysAgo(6) },
    ],

    // -------- RefreshTokens --------
    refreshTokens: [],

    // -------- AccessTokens (mock session table — not in the SQL schema,
    // exists here only so this browser-only mock can resolve "who is
    // calling" without a real JWT library) --------
    accessTokens: [],

    // -------- SystemLogs --------
    systemLogs: [
      { Id: 1, LogLevel: 'Info', Source: 'AuthService', Message: 'User login', ExceptionDetails: null, UserId: demoUserId, ProjectId: null, IpAddress: '41.44.12.9', CreatedAt: daysAgo(1) },
      { Id: 2, LogLevel: 'Warning', Source: 'SubmissionsAPI', Message: 'SPF check failed for outbound message', ExceptionDetails: null, UserId: demoUserId, ProjectId: demoProjectId, IpAddress: '41.44.12.9', CreatedAt: daysAgo(2) },
    ],

    // -------- Banned (Id IS the banned IP/email, per schema) --------
    banned: [
      { Id: '198.51.100.23', violationCount: 5, bannedUntil: daysFromNow(3) },
      { Id: '[email protected]', violationCount: 8, bannedUntil: daysFromNow(30) },
    ],

    _seq: 3, // next SystemLogs Id
  };
}

/* ----------------------------------------------------------
   Mapping helpers: SQL columns -> camelCase API shape
   (matches what ASP.NET Core's default System.Text.Json would
   produce, and what app.js already expects)
   ---------------------------------------------------------- */
const mapUser = (u) => ({
  id: u.Id,
  name: u.FullName,
  email: u.Email,
  notificationEmail: u.DevNotificationEmail,
  missingEmails: u.MissingEmails,
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
  domains: p.RestrictedDomains ? p.RestrictedDomains.split(',').map((d) => d.trim()).filter(Boolean) : [],
  isActive: p.IsActive,
  createdAt: p.CreatedAt,
});

const mapService = (s) => ({
  id: s.Id,
  provider: s.ProviderType,
  host: s.SmtpHost,
  port: s.SmtpPort,
  username: s.Username,
  fromEmail: s.FromEmail,
  fromName: s.FromName,
  isActive: s.IsActive,
});

const mapIntegration = (i) => ({
  id: i.Id,
  type: i.IntegrationType,
  config: (() => { try { return JSON.parse(i.ConfigJson); } catch { return {}; } })(),
  isActive: i.IsActive,
});

const mapTemplate = (t) => ({
  id: t.Id,
  name: t.Name,
  subject: t.Subject,
  html: t.ContentHtml,
  enableRecaptchaV2: t.EnableRecaptchaV2,
  enableAppCheck: t.EnableAppCheck,
  toEmail: t.ToEmail,
  replyTo: t.ReplyTo,
  cc: t.Cc,
  bcc: t.Bcc,
  enableAutoReply: t.EnableAutoReply,
  createdAt: t.CreatedAt,
  isActive: t.IsActive,
});

const mapSubmission = (s) => ({
  id: s.Id,
  status: s.Status,
  recipient: s.RecipientEmail,
  subject: s.Subject,
  fields: (() => { try { return JSON.parse(s.PayloadJson); } catch { return {}; } })(),
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
  pdfUrl: inv.InvoicePdfUrl || '#',
});

const mapBanned = (b) => ({ id: b.Id, violationCount: b.violationCount, bannedUntil: b.bannedUntil });

/* ----------------------------------------------------------
   Auth helpers
   ---------------------------------------------------------- */
class MockError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function issueTokens(db, userId) {
  const accessToken = `mock_access_${userId}_${uuid()}`;
  const refreshToken = `mock_refresh_${userId}_${uuid()}`;
  db.accessTokens.push({ token: accessToken, userId, expiresAt: Date.now() + 30 * 60 * 1000 });
  db.refreshTokens.push({ Id: uuid(), UserId: userId, Token: refreshToken, JwtId: null, IsUsed: false, IsRevoked: false, CreatedAt: new Date().toISOString(), ExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  return { accessToken, refreshToken };
}

function requireAuth(db, token) {
  if (!token) throw new MockError(401, 'Unauthorized');
  const session = db.accessTokens.find((t) => t.token === token);
  if (!session || session.expiresAt < Date.now()) throw new MockError(401, 'Session expired');
  const user = db.users.find((u) => u.Id === session.userId);
  if (!user || !user.IsActive) throw new MockError(401, 'Account is not active');
  return user;
}

function requireAdmin(db, token) {
  const user = requireAuth(db, token);
  if (user.Roles !== 'Admin') throw new MockError(403, 'Admin access required');
  return user;
}

function requireOwnedProject(db, user, projId) {
  const project = db.projects.find((p) => p.Id === projId && p.UserId === user.Id);
  if (!project) throw new MockError(404, 'Project not found');
  return project;
}

function currentPlan(db, user) {
  const sub = db.subscriptions.find((s) => s.UserId === user.Id && s.Status === 'Active');
  return db.plans.find((p) => p.Id === sub?.PlanId) || db.plans.find((p) => p.Name === 'Free');
}

/* ----------------------------------------------------------
   Tiny path router
   ---------------------------------------------------------- */
function pathToRegex(path) {
  const names = [];
  const pattern = path.replace(/:[^/]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; });
  return { regex: new RegExp(`^${pattern}$`), names };
}

const routes = [];
function route(method, path, handler) {
  routes.push({ method, ...pathToRegex(path), handler });
}

/* ============================================================
   AUTH routes
   ============================================================ */
route('POST', '/auth/register', (db, { body }) => {
  const { name, email, password } = body || {};
  if (!name || !email || !password) throw new MockError(400, 'Name, email, and password are required.');
  if (db.users.some((u) => u.Email.toLowerCase() === String(email).toLowerCase())) {
    throw new MockError(409, 'An account with that email already exists.');
  }
  const user = {
    Id: uuid(), FullName: name, Email: email, PasswordHash: password,
    DevNotificationEmail: email, CreatedAt: new Date().toISOString(),
    MissingEmails: 0, Roles: 'User', IsActive: true,
  };
  db.users.push(user);
  return { status: 201, data: mapUser(user) };
});

route('POST', '/auth/login', (db, { body }) => {
  const { email, password } = body || {};
  const user = db.users.find((u) => u.Email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || user.PasswordHash !== password) throw new MockError(401, 'Invalid email or password.');
  if (!user.IsActive) throw new MockError(403, 'This account has been suspended.');
  const tokens = issueTokens(db, user.Id);
  return { status: 200, data: { ...tokens, user: mapUser(user) } };
});

route('POST', '/auth/refresh-token', (db, { body }) => {
  const { refreshToken } = body || {};
  const record = db.refreshTokens.find((r) => r.Token === refreshToken);
  if (!record || record.IsRevoked || record.IsUsed || new Date(record.ExpiresAt) < new Date()) {
    throw new MockError(401, 'Refresh token is invalid or expired.');
  }
  record.IsUsed = true;
  const tokens = issueTokens(db, record.UserId);
  return { status: 200, data: tokens };
});

route('POST', '/auth/logout', (db, { token, body }) => {
  db.accessTokens = db.accessTokens.filter((t) => t.token !== token);
  const record = db.refreshTokens.find((r) => r.Token === body?.refreshToken);
  if (record) record.IsRevoked = true;
  return { status: 200, data: { success: true } };
});

route('POST', '/auth/forgot-password', () => ({
  status: 200, data: { message: 'If that email exists, a reset link is on its way.' },
}));

/* ============================================================
   USER routes
   ============================================================ */
route('GET', '/user/me', (db, { token }) => ({ status: 200, data: mapUser(requireAuth(db, token)) }));

route('PUT', '/user/me', (db, { token, body }) => {
  const user = requireAuth(db, token);
  if (body?.name) user.FullName = body.name;
  if (body?.notificationEmail) user.DevNotificationEmail = body.notificationEmail;
  return { status: 200, data: mapUser(user) };
});

/* ============================================================
   BILLING routes
   ============================================================ */
route('GET', '/billing/plans', (db, { token }) => {
  requireAuth(db, token);
  return { status: 200, data: db.plans.filter((p) => p.IsActive).map(mapPlan) };
});

route('GET', '/billing/subscription', (db, { token }) => {
  const user = requireAuth(db, token);
  const sub = db.subscriptions.find((s) => s.UserId === user.Id);
  if (!sub) return { status: 200, data: null };
  const plan = db.plans.find((p) => p.Id === sub.PlanId);
  return { status: 200, data: mapSubscription(sub, plan) };
});

route('POST', '/billing/subscribe', (db, { token, body }) => {
  const user = requireAuth(db, token);
  const plan = db.plans.find((p) => p.Id === body?.planId);
  if (!plan) throw new MockError(404, 'Plan not found.');
  let sub = db.subscriptions.find((s) => s.UserId === user.Id);
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 86400000);
  if (sub) {
    sub.PlanId = plan.Id; sub.Status = 'Active'; sub.StartDate = now.toISOString(); sub.EndDate = end.toISOString();
  } else {
    sub = { Id: uuid(), UserId: user.Id, PlanId: plan.Id, Status: 'Active', StartDate: now.toISOString(), EndDate: end.toISOString(), CreatedAt: now.toISOString() };
    db.subscriptions.push(sub);
  }
  db.invoices.push({ Id: uuid(), SubscriptionId: sub.Id, Amount: plan.MonthlyPrice, Status: 'Paid', InvoiceDate: now.toISOString(), InvoicePdfUrl: '#' });
  return { status: 200, data: mapSubscription(sub, plan) };
});

route('GET', '/billing/invoices', (db, { token }) => {
  const user = requireAuth(db, token);
  const sub = db.subscriptions.find((s) => s.UserId === user.Id);
  const invoices = sub ? db.invoices.filter((i) => i.SubscriptionId === sub.Id) : [];
  return { status: 200, data: invoices.sort((a, b) => new Date(b.InvoiceDate) - new Date(a.InvoiceDate)).map(mapInvoice) };
});

/* ============================================================
   PROJECTS routes
   ============================================================ */
route('GET', '/projects', (db, { token }) => {
  const user = requireAuth(db, token);
  return { status: 200, data: db.projects.filter((p) => p.UserId === user.Id && p.IsActive).map(mapProject) };
});

route('POST', '/projects', (db, { token, body }) => {
  const user = requireAuth(db, token);
  const plan = currentPlan(db, user);
  const activeCount = db.projects.filter((p) => p.UserId === user.Id && p.IsActive).length;
  if (activeCount >= plan.MaxProjects) throw new MockError(403, `Your ${plan.Name} plan allows up to ${plan.MaxProjects} project(s).`);
  if (!body?.name) throw new MockError(400, 'Project name is required.');
  const project = {
    Id: projectId(), UserId: user.Id, Name: body.name,
    PublicApiKey: 'pk_live_' + uuid().slice(0, 12),
    PrivateApiKey: 'sk_live_' + uuid().slice(0, 12),
    RestrictedDomains: (body.domains || []).join(','),
    CreatedAt: new Date().toISOString(), IsActive: true,
  };
  db.projects.push(project);
  return { status: 201, data: mapProject(project) };
});

route('GET', '/projects/:id', (db, { token, params }) => {
  const user = requireAuth(db, token);
  return { status: 200, data: mapProject(requireOwnedProject(db, user, params.id)) };
});

route('PUT', '/projects/:id', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  if (body?.name) project.Name = body.name;
  if (body?.domains) project.RestrictedDomains = body.domains.join(',');
  return { status: 200, data: mapProject(project) };
});

route('POST', '/projects/:id/keys', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  project.PublicApiKey = 'pk_live_' + uuid().slice(0, 12);
  project.PrivateApiKey = 'sk_live_' + uuid().slice(0, 12);
  return { status: 200, data: mapProject(project) };
});

route('DELETE', '/projects/:id', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const project = requireOwnedProject(db, user, params.id);
  project.IsActive = false;
  return { status: 200, data: { success: true } };
});

/* ============================================================
   SERVICES routes
   ============================================================ */
route('GET', '/projects/:id/services', (db, { token, params }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  return { status: 200, data: db.services.filter((s) => s.ProjectId === params.id && s.IsActive).map(mapService) };
});

route('POST', '/projects/:id/services', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const plan = currentPlan(db, user);
  const activeCount = db.services.filter((s) => s.ProjectId === params.id && s.IsActive).length;
  if (activeCount >= plan.MaxServices) throw new MockError(403, `Your ${plan.Name} plan allows up to ${plan.MaxServices} service(s) per project.`);
  const service = {
    Id: serviceId(), ProjectId: params.id, ProviderType: body?.provider || 'SMTP',
    SmtpHost: body?.host || null, SmtpPort: body?.port || null,
    Username: body?.username || null, EncryptedPassword: body?.password ? '••••••••' : null,
    SecretApiKey: body?.apiKey || null, FromEmail: body?.fromEmail || '', FromName: body?.fromName || '',
    IsActive: true,
  };
  db.services.push(service);
  return { status: 201, data: mapService(service) };
});

route('PUT', '/services/:serviceId', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const service = db.services.find((s) => s.Id === params.serviceId);
  if (!service) throw new MockError(404, 'Service not found.');
  requireOwnedProject(db, user, service.ProjectId);
  if (body?.host) service.SmtpHost = body.host;
  if (body?.port) service.SmtpPort = body.port;
  if (body?.username) service.Username = body.username;
  if (body?.password) service.EncryptedPassword = '••••••••';
  if (body?.fromEmail) service.FromEmail = body.fromEmail;
  if (body?.fromName) service.FromName = body.fromName;
  return { status: 200, data: mapService(service) };
});

route('DELETE', '/services/:serviceId', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const service = db.services.find((s) => s.Id === params.serviceId);
  if (!service) throw new MockError(404, 'Service not found.');
  requireOwnedProject(db, user, service.ProjectId);
  service.IsActive = false;
  return { status: 200, data: { success: true } };
});

/* ============================================================
   INTEGRATIONS routes
   ============================================================ */
route('GET', '/projects/:id/integrations', (db, { token, params }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  return { status: 200, data: db.integrations.filter((i) => i.ProjectId === params.id && i.IsActive).map(mapIntegration) };
});

route('POST', '/projects/:id/integrations', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const plan = currentPlan(db, user);
  if ((body?.type || '').toLowerCase() === 'telegram' && !plan.CanUseTelegramBot) {
    throw new MockError(403, `Your ${plan.Name} plan does not include the Telegram integration.`);
  }
  const integration = { Id: uuid(), ProjectId: params.id, IntegrationType: body?.type || 'Telegram', ConfigJson: JSON.stringify(body?.config || {}), IsActive: true };
  db.integrations.push(integration);
  return { status: 201, data: mapIntegration(integration) };
});

route('DELETE', '/integrations/:intId', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const integration = db.integrations.find((i) => i.Id === params.intId);
  if (!integration) throw new MockError(404, 'Integration not found.');
  requireOwnedProject(db, user, integration.ProjectId);
  integration.IsActive = false;
  return { status: 200, data: { success: true } };
});

/* ============================================================
   TEMPLATES routes
   ============================================================ */
route('GET', '/projects/:id/templates', (db, { token, params }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  return { status: 200, data: db.templates.filter((t) => t.ProjectId === params.id && t.IsActive).map(mapTemplate) };
});

route('POST', '/projects/:id/templates', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const plan = currentPlan(db, user);
  const activeCount = db.templates.filter((t) => t.ProjectId === params.id && t.IsActive).length;
  if (activeCount >= plan.MaxTemplates) throw new MockError(403, `Your ${plan.Name} plan allows up to ${plan.MaxTemplates} template(s) per project.`);
  if (!body?.name) throw new MockError(400, 'Template name is required.');
  const tpl = {
    Id: templateId(), ProjectId: params.id, Name: body.name, Subject: body.subject || '',
    ContentHtml: body.html || '', DoSaveInHistory: true, EnableRecaptchaV2: !!body.enableRecaptchaV2,
    RecaptchaSecretKey: null, EnableAppCheck: !!body.enableAppCheck, ToEmail: body.toEmail || null,
    ReplyTo: body.replyTo || null, Bcc: body.bcc || null, Cc: body.cc || null,
    EnableAutoReply: false, AutoReplyTemplateId: null, CreatedAt: new Date().toISOString(), IsActive: true,
  };
  db.templates.push(tpl);
  return { status: 201, data: mapTemplate(tpl) };
});

route('PUT', '/templates/:id', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id);
  if (!tpl) throw new MockError(404, 'Template not found.');
  requireOwnedProject(db, user, tpl.ProjectId);
  if (body?.name) tpl.Name = body.name;
  if (body?.subject !== undefined) tpl.Subject = body.subject;
  if (body?.html !== undefined) tpl.ContentHtml = body.html;
  if (body?.enableRecaptchaV2 !== undefined) tpl.EnableRecaptchaV2 = !!body.enableRecaptchaV2;
  if (body?.enableAppCheck !== undefined) tpl.EnableAppCheck = !!body.enableAppCheck;
  return { status: 200, data: mapTemplate(tpl) };
});

route('DELETE', '/templates/:id', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id);
  if (!tpl) throw new MockError(404, 'Template not found.');
  requireOwnedProject(db, user, tpl.ProjectId);
  tpl.IsActive = false;
  return { status: 200, data: { success: true } };
});

route('POST', '/templates/:id/attachments', (db, { token, params, body }) => {
  const user = requireAuth(db, token);
  const tpl = db.templates.find((t) => t.Id === params.id);
  if (!tpl) throw new MockError(404, 'Template not found.');
  requireOwnedProject(db, user, tpl.ProjectId);
  const fileName = (body && body.get && body.get('fileName')) || 'attachment';
  const attachment = { Id: uuid(), TemplateId: tpl.Id, FileName: fileName, FileUrl: 'blob:mock/' + uuid(), FileSizeInBytes: 0 };
  db.attachments.push(attachment);
  return { status: 201, data: { id: attachment.Id, fileName: attachment.FileName, fileUrl: attachment.FileUrl } };
});

/* ============================================================
   SUBMISSIONS routes
   ============================================================ */
route('POST', '/submit/:publicApiKey', (db, { params, body }) => {
  const project = db.projects.find((p) => p.PublicApiKey === params.publicApiKey && p.IsActive);
  if (!project) throw new MockError(404, 'Invalid API key.');
  const template = db.templates.find((t) => t.Id === body?.templateId && t.IsActive);
  const submission = {
    Id: uuid(), ProjectId: project.Id, TemplateId: template?.Id || null,
    RecipientEmail: body?.to || template?.ToEmail || 'unknown',
    Subject: body?.subject || template?.Subject || 'New submission',
    PayloadJson: JSON.stringify(body?.fields || body || {}), RawHtmlBody: null,
    ReceivedAt: new Date().toISOString(), Status: 'Pending', AiSummary: null, ErrorMessage: null, SentAt: null,
  };
  db.submissions.push(submission);
  saveDb(db);
  // Simulate async delivery so History pages show a realistic transition.
  setTimeout(() => {
    const liveDb = loadDb();
    const s = liveDb.submissions.find((x) => x.Id === submission.Id);
    if (!s) return;
    if (Math.random() < 0.15) {
      s.Status = 'Failed';
      s.ErrorMessage = 'SMTP 421: temporary delivery failure';
    } else {
      s.Status = 'Sent';
      s.SentAt = new Date().toISOString();
    }
    saveDb(liveDb);
  }, 2000);
  return { status: 202, data: { id: submission.Id, status: submission.Status } };
});

route('GET', '/projects/:id/submissions', (db, { token, params, query }) => {
  const user = requireAuth(db, token);
  requireOwnedProject(db, user, params.id);
  const page = Math.max(1, Number(query.get('page')) || 1);
  const pageSize = Math.max(1, Number(query.get('pageSize')) || 20);
  const all = db.submissions.filter((s) => s.ProjectId === params.id).sort((a, b) => new Date(b.ReceivedAt) - new Date(a.ReceivedAt));
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize).map(mapSubmission);
  return { status: 200, data: { items, page, pageSize, total: all.length } };
});

route('GET', '/submissions/:id', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const submission = db.submissions.find((s) => s.Id === params.id);
  if (!submission) throw new MockError(404, 'Submission not found.');
  requireOwnedProject(db, user, submission.ProjectId);
  return { status: 200, data: mapSubmission(submission) };
});

route('POST', '/submissions/:id/retry', (db, { token, params }) => {
  const user = requireAuth(db, token);
  const submission = db.submissions.find((s) => s.Id === params.id);
  if (!submission) throw new MockError(404, 'Submission not found.');
  requireOwnedProject(db, user, submission.ProjectId);
  if (submission.Status !== 'Failed') throw new MockError(400, "Only submissions with status 'Failed' can be retried.");
  submission.Status = 'Pending';
  submission.ErrorMessage = null;
  saveDb(db);
  setTimeout(() => {
    const liveDb = loadDb();
    const s = liveDb.submissions.find((x) => x.Id === submission.Id);
    if (!s) return;
    s.Status = 'Resent';
    s.SentAt = new Date().toISOString();
    saveDb(liveDb);
  }, 1500);
  return { status: 200, data: mapSubmission(submission) };
});

/* ============================================================
   ADMIN routes
   ============================================================ */
route('GET', '/admin/dashboard', (db, { token }) => {
  requireAdmin(db, token);
  return {
    status: 200,
    data: {
      totalUsers: db.users.length,
      activeUsers: db.users.filter((u) => u.IsActive).length,
      totalProjects: db.projects.filter((p) => p.IsActive).length,
      totalRevenue: db.invoices.filter((i) => i.Status === 'Paid').reduce((sum, i) => sum + i.Amount, 0),
      pendingSubmissions: db.submissions.filter((s) => s.Status === 'Pending').length,
      failedSubmissions: db.submissions.filter((s) => s.Status === 'Failed').length,
    },
  };
});

route('GET', '/admin/users', (db, { token, query }) => {
  requireAdmin(db, token);
  const search = (query.get('search') || '').toLowerCase();
  const users = db.users.filter((u) => !search || u.FullName.toLowerCase().includes(search) || u.Email.toLowerCase().includes(search));
  return { status: 200, data: users.map(mapUser) };
});

route('PUT', '/admin/users/:id/status', (db, { token, params, body }) => {
  requireAdmin(db, token);
  const user = db.users.find((u) => u.Id === params.id);
  if (!user) throw new MockError(404, 'User not found.');
  user.IsActive = !!body?.isActive;
  return { status: 200, data: mapUser(user) };
});

route('PUT', '/admin/users/:id/quota', (db, { token, params, body }) => {
  requireAdmin(db, token);
  const user = db.users.find((u) => u.Id === params.id);
  if (!user) throw new MockError(404, 'User not found.');
  user.MissingEmails = Number(body?.missingEmails) || 0;
  return { status: 200, data: mapUser(user) };
});

route('POST', '/admin/plans', (db, { token, body }) => {
  requireAdmin(db, token);
  if (body?.id) {
    const plan = db.plans.find((p) => p.Id === body.id);
    if (!plan) throw new MockError(404, 'Plan not found.');
    Object.assign(plan, {
      Name: body.name ?? plan.Name, MonthlyPrice: body.price ?? plan.MonthlyPrice,
      MaxEmailsPerMonth: body.maxEmailsPerMonth ?? plan.MaxEmailsPerMonth,
      MaxProjects: body.maxProjects ?? plan.MaxProjects, MaxServices: body.maxServices ?? plan.MaxServices,
      MaxTemplates: body.maxTemplates ?? plan.MaxTemplates,
      CanUseGoogleSheets: body.canUseGoogleSheets ?? plan.CanUseGoogleSheets,
      CanUseAI: body.canUseAI ?? plan.CanUseAI, CanUseTelegramBot: body.canUseTelegramBot ?? plan.CanUseTelegramBot,
      IsActive: body.isActive ?? plan.IsActive,
    });
    return { status: 200, data: mapPlan(plan) };
  }
  const plan = {
    Id: uuid(), Name: body?.name || 'New plan', MonthlyPrice: body?.price || 0,
    MaxEmailsPerMonth: body?.maxEmailsPerMonth || 0, MaxProjects: body?.maxProjects || 1,
    MaxServices: body?.maxServices || 1, MaxTemplates: body?.maxTemplates || 1,
    CanUseGoogleSheets: !!body?.canUseGoogleSheets, CanUseAI: !!body?.canUseAI,
    CanUseTelegramBot: !!body?.canUseTelegramBot, IsActive: true,
  };
  db.plans.push(plan);
  return { status: 201, data: mapPlan(plan) };
});

route('GET', '/admin/banned', (db, { token }) => {
  requireAdmin(db, token);
  return { status: 200, data: db.banned.map(mapBanned) };
});

route('POST', '/admin/banned', (db, { token, body }) => {
  requireAdmin(db, token);
  const { value, violationCount, bannedUntil } = body || {};
  if (!value) throw new MockError(400, 'An IP address or email is required.');
  if (violationCount < 1 || violationCount > 8) throw new MockError(400, 'violationCount must be between 1 and 8.');
  const entry = { Id: value, violationCount: Number(violationCount) || 1, bannedUntil: bannedUntil || new Date(Date.now() + 7 * 86400000).toISOString() };
  db.banned = db.banned.filter((b) => b.Id !== value);
  db.banned.push(entry);
  return { status: 201, data: mapBanned(entry) };
});

route('DELETE', '/admin/banned/:id', (db, { token, params }) => {
  requireAdmin(db, token);
  db.banned = db.banned.filter((b) => b.Id !== decodeURIComponent(params.id));
  return { status: 200, data: { success: true } };
});

/* ============================================================
   Router entry point — mimics a fetch() Response
   ============================================================ */
export async function mockFetch(method, endpoint, { token, body } = {}) {
  await delay();

  const [pathname, queryString] = endpoint.split('?');
  const query = new URLSearchParams(queryString || '');
  const match = routes.find((r) => r.method === method && r.regex.test(pathname));

  const db = loadDb();

  const respond = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

  if (!match) return respond(404, { message: `No mock route for ${method} ${pathname}` });

  const groups = match.regex.exec(pathname).slice(1);
  const params = {};
  match.names.forEach((name, i) => { params[name] = groups[i]; });

  try {
    const result = match.handler(db, { token, body, params, query });
    saveDb(db);
    return respond(result.status, result.data);
  } catch (err) {
    if (err instanceof MockError) return respond(err.status, { message: err.message });
    console.error('[Emaily mock] Unexpected error:', err);
    return respond(500, { message: 'Unexpected mock server error.' });
  }
}

/* ----------------------------------------------------------
   Dev convenience: reset the mock database from the console
   with `resetEmailyMockDb()`.
   ---------------------------------------------------------- */
if (typeof window !== 'undefined') {
  window.resetEmailyMockDb = () => {
    localStorage.removeItem(DB_KEY);
    console.log('[Emaily mock] Database reset. Reload the page.');
  };
}
