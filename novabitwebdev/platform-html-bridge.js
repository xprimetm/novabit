(function () {
  const RECENT_SIGNUP_KEY = 'novabit_recent_signup';
  const PENDING_SIGNUP_VERIFICATION_KEY =
    'novabit_pending_signup_verification';
  const VERIFIED_SIGNUP_READY_KEY = 'novabit_verified_signup_ready';
  const REGISTER_DRAFT_KEY = 'novabit_register_draft_v1';
  const AUTHENTICATED_USER_KEY = 'novabit_authenticated_user';
  const DASHBOARD_ACTIVITY_KEY = 'novabit_dashboard_last_activity';
  const DASHBOARD_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
  const DASHBOARD_TRACK_THROTTLE_MS = 5 * 1000;
  const REGISTER_VERIFICATION_RESEND_DELAY_MS = 60 * 1000;
  const dashboardTrackCooldown = new Map();
  let registerVerificationRequestToken = 0;
  let registerVerificationInFlight = false;
  let registerResendCountdownTimer = 0;
  let dashboardTrackingBound = false;

  function resolveApiUrl() {
    const configuredUrl =
      typeof window.NOVABIT_API_URL === 'string'
        ? window.NOVABIT_API_URL.trim()
        : '';

    if (configuredUrl) {
      return configuredUrl;
    }

    if (!window.location || window.location.protocol === 'file:') {
      return 'http://localhost:4000/api/v1';
    }

    return `${window.location.origin}/api/v1`;
  }

  const API_URL = resolveApiUrl().replace(/\/+$/, '');

  function resolvePostLoginUrl() {
    const configured =
      typeof window.NOVABIT_POST_LOGIN_URL === 'string' && window.NOVABIT_POST_LOGIN_URL.trim()
        ? window.NOVABIT_POST_LOGIN_URL.trim()
        : 'dashboard.html';

    if (configured.includes('#')) {
      return configured;
    }

    return `${configured}#overview`;
  }

  function replaceLocation(url) {
    if (window.location && typeof window.location.replace === 'function') {
      window.location.replace(url);
      return;
    }

    window.location.href = url;
  }

  function msg(payload, fallback) {
    if (!payload || typeof payload !== 'object') return fallback;
    if (Array.isArray(payload.message)) return payload.message.join(' ');
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
    return fallback;
  }

  function panel(el, type, title, message, detail) {
    if (!el) return;
    const map = {
      success: 'border-emerald-300 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/80 dark:border-emerald-500/40 dark:bg-emerald-500/12 dark:text-emerald-50 dark:ring-emerald-400/20',
      error: 'border-red-300 bg-red-50 text-red-950 ring-1 ring-red-200/90 dark:border-red-500/40 dark:bg-red-500/12 dark:text-red-50 dark:ring-red-400/20',
      info: 'border-blue-300 bg-blue-50 text-blue-950 ring-1 ring-blue-200/90 dark:border-blue-500/40 dark:bg-blue-500/12 dark:text-blue-50 dark:ring-blue-400/20',
    };
    const accent = {
      success: 'text-emerald-700 dark:text-emerald-300',
      error: 'text-red-700 dark:text-red-300',
      info: 'text-blue-700 dark:text-blue-300',
    };
    el.className = `mb-6 rounded-3xl border px-5 py-4 text-sm shadow-xl backdrop-blur-sm ${map[type] || map.info}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    el.tabIndex = -1;
    el.innerHTML =
      `<p class="font-bold uppercase tracking-[0.18em] ${accent[type] || accent.info}">${title}</p>` +
      `<p class="mt-2 text-[15px] font-semibold leading-relaxed">${message}</p>` +
      (detail ? `<p class="mt-2 text-xs font-medium leading-relaxed ${accent[type] || accent.info}">${detail}</p>` : '');
    el.classList.remove('hidden');
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function clear(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.innerHTML = '';
    el.removeAttribute('role');
    el.removeAttribute('aria-live');
  }

  function rememberRecentSignup(user) {
    if (!user) return;
    const payload = {
      username: typeof user.username === 'string' ? user.username.trim() : '',
      email: typeof user.email === 'string' ? user.email.trim() : '',
      name: typeof user.name === 'string' ? user.name.trim() : '',
      createdAt: Date.now(),
    };

    if (!payload.username && !payload.email) return;

    try {
      window.sessionStorage.setItem(RECENT_SIGNUP_KEY, JSON.stringify(payload));
    } catch {}
  }

  function readRecentSignup() {
    try {
      const raw = window.sessionStorage.getItem(RECENT_SIGNUP_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const createdAt =
        typeof parsed.createdAt === 'number' ? parsed.createdAt : 0;

      if (createdAt && Date.now() - createdAt > 30 * 60 * 1000) {
        window.sessionStorage.removeItem(RECENT_SIGNUP_KEY);
        return null;
      }

      return {
        username:
          typeof parsed.username === 'string' ? parsed.username.trim() : '',
        email: typeof parsed.email === 'string' ? parsed.email.trim() : '',
        name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
      };
    } catch {
      return null;
    }
  }

  function clearRecentSignup() {
    try {
      window.sessionStorage.removeItem(RECENT_SIGNUP_KEY);
    } catch {}
  }

  function clearRegisterDraftState() {
    try {
      window.localStorage.removeItem(REGISTER_DRAFT_KEY);
    } catch {}
  }

  function normalizePendingSignupVerification(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const pendingRegistrationId =
      typeof payload.pendingRegistrationId === 'string'
        ? payload.pendingRegistrationId.trim()
        : '';
    const destination =
      typeof payload.destination === 'string' ? payload.destination.trim() : '';
    const channel = payload.channel === 'phone' ? 'phone' : 'email';
    const expiresAt =
      typeof payload.expiresAt === 'string' && payload.expiresAt.trim()
        ? payload.expiresAt.trim()
        : null;

    if (!pendingRegistrationId || !destination) {
      return null;
    }

    if (expiresAt) {
      const expiresAtMs = Date.parse(expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return null;
      }
    }

    return {
      pendingRegistrationId,
      channel,
      destination,
      expiresAt,
      resendAvailableAt:
        typeof payload.resendAvailableAt === 'number' &&
        Number.isFinite(payload.resendAvailableAt)
          ? payload.resendAvailableAt
          : 0,
      deliveryMode:
        typeof payload.deliveryMode === 'string'
          ? payload.deliveryMode.trim()
          : 'log',
      redirectTo:
        typeof payload.redirectTo === 'string' ? payload.redirectTo.trim() : '',
      devCode:
        typeof payload.devCode === 'string' ? payload.devCode.trim() : '',
      username:
        typeof payload.username === 'string' ? payload.username.trim() : '',
      email: typeof payload.email === 'string' ? payload.email.trim() : '',
      phone: typeof payload.phone === 'string' ? payload.phone.trim() : '',
      name: typeof payload.name === 'string' ? payload.name.trim() : '',
      createdAt:
        typeof payload.createdAt === 'number' &&
        Number.isFinite(payload.createdAt)
          ? payload.createdAt
          : Date.now(),
    };
  }

  function rememberPendingSignupVerification(payload) {
    const normalized = normalizePendingSignupVerification(payload);
    if (!normalized) {
      clearPendingSignupVerification();
      return;
    }

    try {
      window.localStorage.setItem(
        PENDING_SIGNUP_VERIFICATION_KEY,
        JSON.stringify(normalized),
      );
    } catch {}
  }

  function readPendingSignupVerification() {
    try {
      const raw = window.localStorage.getItem(PENDING_SIGNUP_VERIFICATION_KEY);
      if (!raw) return null;

      const normalized = normalizePendingSignupVerification(JSON.parse(raw));
      if (!normalized) {
        window.localStorage.removeItem(PENDING_SIGNUP_VERIFICATION_KEY);
        return null;
      }

      return normalized;
    } catch {
      return null;
    }
  }

  function clearPendingSignupVerification() {
    try {
      window.localStorage.removeItem(PENDING_SIGNUP_VERIFICATION_KEY);
    } catch {}
  }

  function normalizeVerifiedSignupReady(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const redirectTo =
      typeof payload.redirectTo === 'string' ? payload.redirectTo.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';

    if (!redirectTo && !email) {
      return null;
    }

    return {
      redirectTo,
      email,
      createdAt:
        typeof payload.createdAt === 'number' &&
        Number.isFinite(payload.createdAt)
          ? payload.createdAt
          : Date.now(),
    };
  }

  function rememberVerifiedSignupReady(payload) {
    const normalized = normalizeVerifiedSignupReady(payload);
    if (!normalized) {
      clearVerifiedSignupReady();
      return;
    }

    try {
      window.localStorage.setItem(
        VERIFIED_SIGNUP_READY_KEY,
        JSON.stringify(normalized),
      );
    } catch {}
  }

  function readVerifiedSignupReady() {
    try {
      const raw = window.localStorage.getItem(VERIFIED_SIGNUP_READY_KEY);
      if (!raw) return null;

      const normalized = normalizeVerifiedSignupReady(JSON.parse(raw));
      if (!normalized) {
        window.localStorage.removeItem(VERIFIED_SIGNUP_READY_KEY);
        return null;
      }

      return normalized;
    } catch {
      return null;
    }
  }

  function clearVerifiedSignupReady() {
    try {
      window.localStorage.removeItem(VERIFIED_SIGNUP_READY_KEY);
    } catch {}
  }

  function writeDashboardActivity(value) {
    const stamp = Number(value);
    if (!Number.isFinite(stamp) || stamp <= 0) return;
    try {
      window.localStorage.setItem(DASHBOARD_ACTIVITY_KEY, String(stamp));
    } catch {}
  }

  function readDashboardActivity() {
    try {
      const raw = window.localStorage.getItem(DASHBOARD_ACTIVITY_KEY);
      const value = Number(raw);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function rememberAuthenticatedUser(user) {
    try {
      window.localStorage.setItem(
        AUTHENTICATED_USER_KEY,
        JSON.stringify(user || null),
      );
    } catch {}
    writeDashboardActivity(Date.now());
  }

  function clearAuthenticatedUserHint() {
    try {
      window.localStorage.removeItem(AUTHENTICATED_USER_KEY);
      window.localStorage.removeItem(DASHBOARD_ACTIVITY_KEY);
    } catch {}
  }

  function hasFreshDashboardActivity() {
    const lastActivity = readDashboardActivity();
    if (!lastActivity) return false;

    if (Date.now() - lastActivity > DASHBOARD_IDLE_TIMEOUT_MS) {
      clearAuthenticatedUserHint();
      return false;
    }

    return true;
  }

  function recentSignupOptions(recentSignup) {
    if (!recentSignup) return [];

    return [recentSignup.email, recentSignup.username].filter(function (value, index, values) {
      return typeof value === 'string' && value && values.indexOf(value) === index;
    });
  }

  function describeLoginFailure(error) {
    const message =
      error instanceof Error ? error.message : 'Unable to sign in.';
    const normalized = message.trim().toLowerCase();
    const recentSignup = readRecentSignup();
    const options = recentSignupOptions(recentSignup);

    if (normalized.includes('invalid email, username, or password')) {
      return {
        message:
          'We could not match that email address or username with the password entered.',
        detail:
          options.length > 1
            ? `Try signing in with ${options[0]} or ${options[1]}. Display names do not work here.`
            : options.length === 1
              ? `Try signing in with ${options[0]}. Display names do not work here.`
              : 'Use the email address or profile username from signup. Display names do not work here.',
      };
    }

    if (normalized.includes('security verification')) {
      return {
        message,
        detail:
          'Complete the verification box, then submit the form again.',
      };
    }

    if (
      normalized.includes('verify your email') ||
      normalized.includes('verify your phone') ||
      normalized.includes('verify your email address or phone number')
    ) {
      return {
        message,
        detail:
          'Use the verification code sent during signup, or return to the signup form and request a new code.',
      };
    }

    if (normalized.includes('too many login attempts')) {
      return {
        message,
        detail:
          'Wait for the cooldown to expire before trying again.',
      };
    }

    return {
      message,
      detail:
        window.location.protocol === 'file:'
          ? 'Open the site on http://127.0.0.1:8080 or http://localhost:8080.'
          : '',
    };
  }

  async function request(path, method, data) {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: data ? JSON.stringify(data) : undefined,
      });
    } catch {
      throw new Error(`The HTML site could not reach the Novabit API at ${API_URL}. Start the API and try again.`);
    }
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { message: text }; }
    }
    if (!response.ok) throw new Error(msg(payload, `Request failed with status ${response.status}.`));
    return payload || {};
  }

  function isDashboardPage() {
    const pathname =
      window.location && typeof window.location.pathname === 'string'
        ? window.location.pathname.toLowerCase()
        : '';

    return (
      pathname.endsWith('/dashboard.html') ||
      pathname.endsWith('/dashboard-dark-backup.html') ||
      Boolean(document.querySelector('[data-dashboard-panel]'))
    );
  }

  function normalizeDashboardLabel(value, fallback) {
    const normalized =
      typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    return normalized ? normalized.slice(0, 100) : fallback;
  }

  function normalizeDashboardPanel(panel) {
    return typeof panel === 'string'
      ? panel.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
      : '';
  }

  function formatDashboardPanelLabel(panel) {
    const normalized = normalizeDashboardPanel(panel);
    if (!normalized) return 'dashboard';
    return normalized.replace(/[-_]+/g, ' ');
  }

  function resolveDashboardPanelTarget(target) {
    if (!target || !(target instanceof Element)) {
      return normalizeDashboardPanel(
        window.location && typeof window.location.hash === 'string'
          ? window.location.hash.replace(/^#/, '')
          : 'overview',
      );
    }

    const openTarget =
      typeof target.getAttribute === 'function'
        ? target.getAttribute('data-dashboard-open')
        : '';
    if (openTarget) {
      return normalizeDashboardPanel(openTarget);
    }

    if (typeof target.getAttribute === 'function') {
      const href = target.getAttribute('href') || '';
      if (href.startsWith('#')) {
        return normalizeDashboardPanel(href.slice(1));
      }
    }

    const panel = target.closest('[data-dashboard-panel]');
    if (panel && panel.id) {
      return normalizeDashboardPanel(panel.id);
    }

    return normalizeDashboardPanel(
      window.location && typeof window.location.hash === 'string'
        ? window.location.hash.replace(/^#/, '')
        : 'overview',
    );
  }

  function classifyDashboardCategory(panel) {
    if (
      panel === 'deposit-funds' ||
      panel === 'withdraw-funds' ||
      panel === 'portfolio' ||
      panel === 'plans' ||
      panel === 'investments'
    ) {
      return 'investment';
    }

    if (panel === 'verification' || panel === 'kyc') {
      return 'security';
    }

    if (panel === 'profile' || panel === 'settings') {
      return 'profile';
    }

    if (panel === 'support' || panel === 'help') {
      return 'support';
    }

    return 'dashboard';
  }

  function buildDashboardPagePath(panel) {
    const pathname =
      window.location && typeof window.location.pathname === 'string'
        ? window.location.pathname
        : '/dashboard.html';
    const normalizedPanel = normalizeDashboardPanel(panel);
    const hash = normalizedPanel
      ? `#${normalizedPanel}`
      : window.location && typeof window.location.hash === 'string'
        ? window.location.hash
        : '';
    return `${pathname}${hash || ''}`.slice(0, 180);
  }

  function shouldThrottleDashboardTrack(signature, force) {
    if (force) {
      return false;
    }

    const now = Date.now();
    const previous = dashboardTrackCooldown.get(signature) || 0;
    if (now - previous < DASHBOARD_TRACK_THROTTLE_MS) {
      return true;
    }

    dashboardTrackCooldown.set(signature, now);
    if (dashboardTrackCooldown.size > 120) {
      const entries = Array.from(dashboardTrackCooldown.entries())
        .sort(function (left, right) {
          return left[1] - right[1];
        })
        .slice(0, 20);
      entries.forEach(function (entry) {
        dashboardTrackCooldown.delete(entry[0]);
      });
    }

    return false;
  }

  async function trackUserActivity(payload, options) {
    if (!isDashboardPage()) {
      return { tracked: false };
    }

    const settings = options || {};
    const activityType = normalizeDashboardLabel(
      payload && payload.activityType,
      'dashboard_click',
    )
      .toLowerCase()
      .replace(/[^a-z0-9_:-]/g, '_');
    const panel = normalizeDashboardPanel(
      (payload && payload.panel) ||
        (payload && payload.pagePath && String(payload.pagePath).split('#')[1]) ||
        '',
    );
    const pagePath =
      payload && typeof payload.pagePath === 'string' && payload.pagePath.trim()
        ? payload.pagePath.trim().slice(0, 180)
        : buildDashboardPagePath(panel);
    const activityLabel = normalizeDashboardLabel(
      payload && payload.activityLabel,
      activityType === 'dashboard_view'
        ? `Viewed ${formatDashboardPanelLabel(panel || 'overview')}`
        : 'Dashboard interaction',
    );
    const activityCategory = normalizeDashboardLabel(
      payload && payload.activityCategory,
      classifyDashboardCategory(panel),
    )
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const signature = [
      activityType,
      activityCategory,
      pagePath,
      activityLabel,
      JSON.stringify((payload && payload.details) || {}),
    ].join('|');

    if (shouldThrottleDashboardTrack(signature, Boolean(settings.force))) {
      return { tracked: false, throttled: true };
    }

    try {
      return await request('/activity/track', 'POST', {
        activityType: activityType,
        activityCategory: activityCategory,
        activityLabel: activityLabel,
        severity:
          payload && typeof payload.severity === 'string'
            ? payload.severity
            : 'info',
        details:
          payload && payload.details && typeof payload.details === 'object'
            ? payload.details
            : {},
        pagePath: pagePath,
      });
    } catch {
      return { tracked: false };
    }
  }

  function buildDashboardClickPayload(target) {
    const panel = resolveDashboardPanelTarget(target);
    const label = normalizeDashboardLabel(
      (typeof target.getAttribute === 'function' &&
        (target.getAttribute('aria-label') || target.getAttribute('title'))) ||
        target.textContent,
      `Opened ${formatDashboardPanelLabel(panel || 'dashboard')}`,
    );

    return {
      activityType: 'dashboard_click',
      activityCategory: classifyDashboardCategory(panel),
      activityLabel: label,
      pagePath: buildDashboardPagePath(panel),
      panel: panel,
      details: {
        elementId: target.id || '',
        elementType: target.tagName ? target.tagName.toLowerCase() : '',
        href:
          typeof target.getAttribute === 'function'
            ? target.getAttribute('href') || ''
            : '',
      },
    };
  }

  function bindDashboardActivityTracking() {
    if (!isDashboardPage() || dashboardTrackingBound) {
      return;
    }

    dashboardTrackingBound = true;
    window.setTimeout(function () {
      const panel = resolveDashboardPanelTarget(null);
      void trackUserActivity(
        {
          activityType: 'dashboard_view',
          activityCategory: classifyDashboardCategory(panel),
          activityLabel: `Viewed ${formatDashboardPanelLabel(panel || 'overview')}`,
          pagePath: buildDashboardPagePath(panel),
          panel: panel,
          details: {
            hash:
              window.location && typeof window.location.hash === 'string'
                ? window.location.hash
                : '',
          },
        },
        { force: true },
      );
    }, 1200);

    window.addEventListener('hashchange', function () {
      const panel = resolveDashboardPanelTarget(null);
      void trackUserActivity(
        {
          activityType: 'dashboard_view',
          activityCategory: classifyDashboardCategory(panel),
          activityLabel: `Viewed ${formatDashboardPanelLabel(panel || 'overview')}`,
          pagePath: buildDashboardPagePath(panel),
          panel: panel,
          details: {
            hash:
              window.location && typeof window.location.hash === 'string'
                ? window.location.hash
                : '',
          },
        },
        { force: true },
      );
    });

    document.addEventListener(
      'click',
      function (event) {
        const target =
          event.target instanceof Element
            ? event.target.closest('button,a,[role="button"]')
            : null;
        if (!target) {
          return;
        }

        if (!target.closest('.user-shell,.user-content,.user-sidebar')) {
          return;
        }

        if (target.matches('[data-dashboard-logout]')) {
          return;
        }

        void trackUserActivity(buildDashboardClickPayload(target));
      },
      true,
    );

    document.addEventListener(
      'submit',
      function (event) {
        const form =
          event.target instanceof HTMLFormElement ? event.target : null;
        if (!form || !form.closest('.user-shell,.user-content')) {
          return;
        }

        const panel = resolveDashboardPanelTarget(form);
        const category = classifyDashboardCategory(panel);
        const formId = normalizeDashboardLabel(form.id || '', 'dashboard-form');
        let activityType = 'dashboard_submit';
        let activityLabel = `${formatDashboardPanelLabel(panel || 'dashboard')} form submitted`;

        if (formId === 'kyc-form' || panel === 'verification') {
          activityType = 'security_event';
          activityLabel = 'KYC form submitted';
        } else if (category === 'profile') {
          activityType = 'profile_updated';
          activityLabel = 'Profile settings submitted';
        } else if (category === 'investment') {
          activityType = 'investment_form_submitted';
          activityLabel = 'Investment form submitted';
        }

        void trackUserActivity(
          {
            activityType: activityType,
            activityCategory: category,
            activityLabel: activityLabel,
            pagePath: buildDashboardPagePath(panel),
            panel: panel,
            details: {
              formId: formId,
            },
          },
          { force: true },
        );
      },
      true,
    );
  }

  function resolveDashboardRedirect(target) {
    if (typeof target === 'string' && target.trim()) {
      const normalized = target.trim();
      if (normalized === '/dashboard') {
        return resolvePostLoginUrl();
      }
      return normalized;
    }

    return resolvePostLoginUrl();
  }

  function isSmsVerificationAvailable() {
    return window.NOVABIT_SMS_VERIFICATION_AVAILABLE === true;
  }

  function configureRegisterVerificationOptions() {
    const emailOption = document.querySelector(
      '[data-register-verification-option="email"]',
    );
    const phoneOption = document.querySelector(
      '[data-register-verification-option="phone"]',
    );
    const emailInput = document.querySelector(
      'input[name="verification_method"][value="email"]',
    );
    const phoneInput = document.querySelector(
      'input[name="verification_method"][value="phone"]',
    );

    if (!emailInput || !phoneInput || !phoneOption) {
      return;
    }

    const smsAvailable = isSmsVerificationAvailable();
    phoneInput.disabled = !smsAvailable;
    phoneOption.classList.toggle('hidden', !smsAvailable);

    if (!smsAvailable) {
      phoneInput.checked = false;
      emailInput.checked = true;
      if (emailOption) {
        emailOption.classList.remove('sm:col-span-1');
        emailOption.classList.add('sm:col-span-2');
      }
      return;
    }

    if (emailOption) {
      emailOption.classList.remove('sm:col-span-2');
      emailOption.classList.add('sm:col-span-1');
    }
  }

  function redirectAuthenticatedLoginView() {
    if (!document.getElementById('login-form')) return;

    if (!hasFreshDashboardActivity()) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(AUTHENTICATED_USER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
    } catch {
      return;
    }

    replaceLocation(resolvePostLoginUrl());
  }

  function busy(btn, on, html) {
    if (!btn) return;
    if (!btn.dataset.originalMarkup) btn.dataset.originalMarkup = btn.innerHTML;
    btn.disabled = on;
    btn.innerHTML = on ? html : btn.dataset.originalMarkup;
  }

  function token(form) {
    const field = form.querySelector('[name="cf-turnstile-response"]');
    return field ? field.value.trim() : '';
  }

  function writeToken(form, value) {
    const field = form.querySelector('[name="cf-turnstile-response"]');
    if (field) field.value = value;
  }

  function renderTurnstile(form) {
    const holder = form.querySelector('[data-turnstile-widget]');
    const shell = form.querySelector('[data-turnstile-shell]');
    const siteKey = typeof window.NOVABIT_TURNSTILE_SITEKEY === 'string' ? window.NOVABIT_TURNSTILE_SITEKEY.trim() : '';
    if (!holder || holder.dataset.mounted === 'true' || !siteKey) return;
    if (!window.turnstile || typeof window.turnstile.render !== 'function') {
      window.setTimeout(function () { renderTurnstile(form); }, 250);
      return;
    }
    holder.dataset.mounted = 'true';
    const mark = function (valid) {
      if (!shell) return;
      shell.classList.remove('border-red-500/60', 'border-emerald-500/60', 'ring-2', 'ring-red-500/20', 'ring-emerald-500/20');
      shell.classList.add(valid ? 'border-emerald-500/60' : 'border-red-500/60', 'ring-2', valid ? 'ring-emerald-500/20' : 'ring-red-500/20');
    };
    const widgetId = window.turnstile.render(holder, {
      sitekey: siteKey,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      callback(value) { writeToken(form, value); mark(true); },
      'expired-callback'() { writeToken(form, ''); mark(false); },
      'timeout-callback'() { writeToken(form, ''); mark(false); },
      'error-callback'() { writeToken(form, ''); mark(false); },
    });
    holder.dataset.widgetId = String(widgetId);
  }

  function resetTurnstile(form) {
    const holder = form.querySelector('[data-turnstile-widget]');
    writeToken(form, '');
    if (holder && holder.dataset.widgetId && window.turnstile && typeof window.turnstile.reset === 'function') {
      window.turnstile.reset(holder.dataset.widgetId);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getRegisterVerificationUi() {
    return {
      emailRow: document.getElementById('register-verification-email-row'),
      emailLine: document.getElementById('register-verification-email'),
      sentBadge: document.getElementById('register-verification-sent'),
      sentMailIcon: document.getElementById('register-verification-sent-mail'),
      sentVerifiedIcon: document.getElementById('register-verification-sent-verified'),
      sentText: document.getElementById('register-verification-sent-text'),
      codeEntry: document.getElementById('register-verification-entry'),
      codeInput: document.getElementById('register-verification-code'),
      devCode: document.getElementById('register-verification-devcode'),
      sendButton: document.getElementById('register-send-code-button'),
      resendButton: document.getElementById('register-resend-code'),
      submitButton: document.getElementById('register-submit-button'),
      submitLabel: document.getElementById('register-submit-label'),
    };
  }

  function getRegisterEmailAddress() {
    const emailField = document.getElementById('email');
    return emailField ? String(emailField.value || '').trim() : '';
  }

  function setRegisterVerificationCodeFeedback(type, message) {
    const codeInput = document.getElementById('register-verification-code');
    const feedback = document.getElementById(
      'register-verification-code-feedback',
    );

    if (!codeInput || !feedback) {
      return;
    }

    codeInput.classList.remove(
      'border-red-300',
      'ring-2',
      'ring-red-500/10',
      'border-emerald-300',
      'ring-emerald-500/10',
    );
    feedback.classList.add('hidden');
    feedback.textContent = '';
    feedback.classList.remove('is-valid', 'is-invalid', 'is-neutral');

    if (!message) {
      return;
    }

    feedback.textContent = message;
    feedback.classList.remove('hidden');

    if (type === 'success') {
      feedback.classList.add('is-valid');
      codeInput.classList.add('border-emerald-300', 'ring-2', 'ring-emerald-500/10');
      return;
    }

    if (type === 'error') {
      feedback.classList.add('is-invalid');
      codeInput.classList.add('border-red-300', 'ring-2', 'ring-red-500/10');
      return;
    }

    feedback.classList.add('is-neutral');
  }

  function setRegisterVerificationStatus(state, message) {
    const ui = getRegisterVerificationUi();
    if (!ui.sentBadge || !ui.sentText) {
      return;
    }

    if (!state || !message) {
      ui.sentBadge.classList.add('hidden');
      ui.sentText.textContent = '';
      if (ui.sentMailIcon) {
        ui.sentMailIcon.classList.remove('hidden');
      }
      if (ui.sentVerifiedIcon) {
        ui.sentVerifiedIcon.classList.add('hidden');
      }
      return;
    }

    ui.sentBadge.classList.remove('hidden');
    ui.sentText.textContent = message;
    if (ui.sentMailIcon) {
      ui.sentMailIcon.classList.toggle('hidden', state === 'verified');
    }
    if (ui.sentVerifiedIcon) {
      ui.sentVerifiedIcon.classList.toggle('hidden', state !== 'verified');
    }
  }

  function clearRegisterResendCountdown() {
    if (registerResendCountdownTimer) {
      window.clearInterval(registerResendCountdownTimer);
      registerResendCountdownTimer = 0;
    }
  }

  function setRegisterSendButtonState(label, disabled) {
    const ui = getRegisterVerificationUi();
    if (!ui.sendButton) {
      return;
    }

    const labelNode = ui.sendButton.querySelector('[data-register-send-code-label]');
    if (labelNode) {
      labelNode.textContent = label;
    } else {
      ui.sendButton.textContent = label;
    }
    ui.sendButton.hidden = false;
    ui.sendButton.disabled = !!disabled;
  }

  function getRegisterResendCountdownMs(pendingVerification) {
    if (!pendingVerification || !pendingVerification.resendAvailableAt) {
      return 0;
    }

    return Math.max(0, pendingVerification.resendAvailableAt - Date.now());
  }

  function startRegisterResendCountdown() {
    clearRegisterResendCountdown();

    const tick = function () {
      const pendingVerification = readPendingSignupVerification();
      if (!pendingVerification || readVerifiedSignupReady()) {
        clearRegisterResendCountdown();
        return;
      }

      const remainingMs = getRegisterResendCountdownMs(pendingVerification);
      if (remainingMs <= 0) {
        setRegisterSendButtonState('Resend Code', false);
        clearRegisterResendCountdown();
        return;
      }

      setRegisterSendButtonState(
        `Resend Code ${Math.ceil(remainingMs / 1000)}s`,
        true,
      );
    };

    tick();
    registerResendCountdownTimer = window.setInterval(tick, 1000);
  }

  async function resendRegisterVerificationCode() {
    const ui = getRegisterVerificationUi();
    const activePendingVerification = readPendingSignupVerification();
    if (!ui.sendButton || !activePendingVerification) {
      return false;
    }

    if (getRegisterResendCountdownMs(activePendingVerification) > 0) {
      startRegisterResendCountdown();
      return false;
    }

    setRegisterSendButtonState('Sending...', true);
    setRegisterVerificationCodeFeedback('neutral', 'Sending a new code...');

    try {
      const result = await request('/auth/resend-contact-verification', 'POST', {
        pendingRegistrationId: activePendingVerification.pendingRegistrationId,
        channel: activePendingVerification.channel,
        email:
          activePendingVerification.channel === 'email'
            ? activePendingVerification.destination
            : '',
        phone:
          activePendingVerification.channel === 'phone'
            ? activePendingVerification.destination
            : '',
      });

      const refreshedVerification = normalizePendingSignupVerification({
        ...activePendingVerification,
        ...(result.verification || {}),
        resendAvailableAt: Date.now() + REGISTER_VERIFICATION_RESEND_DELAY_MS,
      });

      if (!refreshedVerification) {
        throw new Error('Unable to refresh the verification code.');
      }

      rememberPendingSignupVerification(refreshedVerification);
      syncRegisterVerificationUi(refreshedVerification);
      setRegisterVerificationCodeFeedback(
        'neutral',
        'A new verification code was sent to your email.',
      );
      return true;
    } catch (error) {
      setRegisterSendButtonState('Resend Code', false);
      setRegisterVerificationCodeFeedback(
        'error',
        error instanceof Error
          ? error.message
          : 'Unable to resend the verification code.',
      );
      return false;
    }
  }

  async function continueVerifiedSignup(options) {
    const cfg = options || {};
    const btn = cfg.submitButton || null;
    const verifiedReady = readVerifiedSignupReady();
    if (!verifiedReady) {
      return { ok: false };
    }

    busy(
      btn,
      true,
      '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i>Opening Dashboard...',
    );

    try {
      clearVerifiedSignupReady();
      replaceLocation(
        resolveDashboardRedirect(
          verifiedReady.redirectTo || cfg.redirectTo || resolvePostLoginUrl(),
        ),
      );
      return { ok: true };
    } finally {
      busy(btn, false);
    }
  }

  function syncRegisterVerificationUi(pendingVerification) {
    const ui = getRegisterVerificationUi();
    if (!ui.codeInput) {
      return false;
    }

    const verifiedReady = !pendingVerification
      ? readVerifiedSignupReady()
      : null;

    if (verifiedReady) {
      if (ui.emailRow) {
        ui.emailRow.classList.add('hidden');
      }
      if (ui.emailLine) {
        ui.emailLine.textContent =
          verifiedReady.email || getRegisterEmailAddress() || '';
      }
      setRegisterVerificationStatus('verified', 'Your email has been verified');
      if (ui.devCode) {
        ui.devCode.textContent = '';
        ui.devCode.classList.add('hidden');
      }
      if (ui.codeEntry) {
        ui.codeEntry.classList.add('hidden');
      }
      if (ui.sendButton) {
        clearRegisterResendCountdown();
        ui.sendButton.hidden = true;
        ui.sendButton.disabled = false;
      }
      if (ui.resendButton) {
        ui.resendButton.hidden = true;
        ui.resendButton.disabled = false;
      }
      if (ui.submitLabel) {
        ui.submitLabel.textContent = 'Continue';
      }
      if (ui.submitButton) {
        ui.submitButton.hidden = false;
        ui.submitButton.disabled = false;
        ui.submitButton.dataset.originalMarkup = ui.submitButton.innerHTML;
      }
      ui.codeInput.value = '';
      ui.codeInput.placeholder = '';
      ui.codeInput.disabled = true;
      registerVerificationInFlight = false;
      setRegisterVerificationCodeFeedback('', '');
      return true;
    }

    if (pendingVerification) {
      if (ui.emailRow) {
        ui.emailRow.classList.remove('hidden');
      }
      if (ui.emailLine) {
        ui.emailLine.textContent = pendingVerification.destination;
      }
      if (ui.codeEntry) {
        ui.codeEntry.classList.remove('hidden');
      }
      setRegisterVerificationStatus(
        'sent',
        'Verification code has been sent to your email',
      );
      if (ui.devCode) {
        if (pendingVerification.devCode) {
          ui.devCode.textContent = `Local code: ${pendingVerification.devCode}`;
          ui.devCode.classList.remove('hidden');
        } else {
          ui.devCode.textContent = '';
          ui.devCode.classList.add('hidden');
        }
      }
      if (ui.sendButton) {
        ui.sendButton.hidden = false;
      }
      if (ui.resendButton) {
        ui.resendButton.hidden = true;
        ui.resendButton.disabled = true;
      }
      startRegisterResendCountdown();
      if (ui.submitLabel) {
        ui.submitLabel.textContent = 'Continue';
      }
      if (ui.submitButton) {
        ui.submitButton.hidden = false;
        ui.submitButton.disabled = true;
        ui.submitButton.dataset.originalMarkup = ui.submitButton.innerHTML;
      }
      ui.codeInput.placeholder = '';
      ui.codeInput.disabled = false;
      if (!ui.codeInput.value.trim()) {
        setRegisterVerificationCodeFeedback('', '');
      }
      ui.codeInput.focus();
      ui.codeInput.select();
      return true;
    }

    const emailAddress = getRegisterEmailAddress();
    if (ui.emailRow) {
      ui.emailRow.classList.remove('hidden');
    }
    if (ui.emailLine) {
      ui.emailLine.textContent = emailAddress || '';
    }
    if (ui.codeEntry) {
      ui.codeEntry.classList.remove('hidden');
    }
    setRegisterVerificationStatus('', '');
    if (ui.devCode) {
      ui.devCode.textContent = '';
      ui.devCode.classList.add('hidden');
    }
    if (ui.sendButton) {
      clearRegisterResendCountdown();
      setRegisterSendButtonState('Send Code', false);
    }
    if (ui.resendButton) {
      ui.resendButton.hidden = true;
      ui.resendButton.disabled = false;
    }
    if (ui.submitLabel) {
      ui.submitLabel.textContent = 'Continue';
    }
    if (ui.submitButton) {
      ui.submitButton.hidden = false;
      ui.submitButton.disabled = true;
      ui.submitButton.dataset.originalMarkup = ui.submitButton.innerHTML;
    }
    ui.codeInput.value = '';
    ui.codeInput.placeholder = '';
    ui.codeInput.disabled = false;
    registerVerificationInFlight = false;
    setRegisterVerificationCodeFeedback('', '');
    return true;
  }

  async function autoVerifyRegisterCode() {
    const ui = getRegisterVerificationUi();
    if (!ui.codeInput) {
      return false;
    }

    const verifiedReady = readVerifiedSignupReady();
    if (verifiedReady) {
      return true;
    }

    const pendingVerification = readPendingSignupVerification();
    if (!pendingVerification) {
      setRegisterVerificationCodeFeedback('', '');
      return false;
    }

    const code = String(ui.codeInput.value || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (ui.codeInput.value !== code) {
      ui.codeInput.value = code;
    }

    if (code.length === 0) {
      setRegisterVerificationCodeFeedback('', '');
      return false;
    }

    if (code.length < 6) {
      setRegisterVerificationCodeFeedback('neutral', 'Enter the full 6-digit code.');
      return false;
    }

    if (registerVerificationInFlight) {
      return false;
    }

    registerVerificationInFlight = true;
    const requestToken = ++registerVerificationRequestToken;
    setRegisterVerificationCodeFeedback('neutral', 'Checking code...');
    ui.codeInput.disabled = true;
    if (ui.resendButton) {
      ui.resendButton.disabled = true;
    }
    if (ui.submitButton) {
      ui.submitButton.disabled = true;
    }

    try {
      const result = await request('/auth/verify-contact', 'POST', {
        pendingRegistrationId: pendingVerification.pendingRegistrationId,
        channel: pendingVerification.channel,
        email:
          pendingVerification.channel === 'email'
            ? pendingVerification.destination
            : '',
        phone:
          pendingVerification.channel === 'phone'
            ? pendingVerification.destination
            : '',
        code,
      });

      if (requestToken !== registerVerificationRequestToken) {
        return false;
      }

      clearPendingSignupVerification();
      clearRegisterDraftState();
      clearRecentSignup();
      rememberAuthenticatedUser(result.user || null);
      rememberVerifiedSignupReady({
        redirectTo:
          result.redirectTo ||
          pendingVerification.redirectTo ||
          resolvePostLoginUrl(),
        email: pendingVerification.destination,
      });
      clear(document.getElementById('register-feedback'));
      syncRegisterVerificationUi(null);
      return true;
    } catch (error) {
      if (requestToken !== registerVerificationRequestToken) {
        return false;
      }

      ui.codeInput.disabled = false;
      if (ui.resendButton) {
        ui.resendButton.disabled = false;
      }
      if (ui.submitButton) {
        ui.submitButton.disabled = true;
      }
      ui.codeInput.focus();
      ui.codeInput.select();
      setRegisterVerificationCodeFeedback(
        'error',
        error instanceof Error ? error.message : 'Invalid verification code.',
      );
      return false;
    } finally {
      if (requestToken === registerVerificationRequestToken) {
        registerVerificationInFlight = false;
      }
    }
  }

  function renderVerificationPrompt(feedback, verification, redirectTo) {
    if (!feedback) return;
    const pendingVerification = normalizePendingSignupVerification(
      verification || {},
    );
    if (!pendingVerification) {
      return;
    }

    rememberPendingSignupVerification({
      ...pendingVerification,
      resendAvailableAt:
        pendingVerification.resendAvailableAt ||
        Date.now() + REGISTER_VERIFICATION_RESEND_DELAY_MS,
      redirectTo: redirectTo || pendingVerification.redirectTo || '',
    });

    const channel =
      pendingVerification.channel === 'phone' ? 'phone' : 'email';
    const safeDestination = pendingVerification.destination;
    const title = channel === 'phone' ? 'Verify Phone' : 'Verify Email';
    const actionLabel = channel === 'phone' ? 'Verify Phone' : 'Verify Email';
    const destinationLabel =
      channel === 'phone' ? 'phone number' : 'email address';
    const devCode = pendingVerification.devCode;

    if (syncRegisterVerificationUi(pendingVerification)) {
      clear(feedback);

      const ui = getRegisterVerificationUi();
      clear(feedback);
      return;
    }

    feedback.className = 'mb-6 rounded-3xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-950 ring-1 ring-emerald-200/80 dark:border-emerald-500/40 dark:bg-emerald-500/12 dark:text-emerald-50 dark:ring-emerald-400/20';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.innerHTML =
      '<p class="font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">' + escapeHtml(title) + '</p>' +
      '<p class="mt-2 text-[15px] font-semibold leading-relaxed">Enter the 6-digit code sent to ' + escapeHtml(safeDestination) + ' to finish creating your account.</p>' +
      (devCode ? '<p class="mt-2 rounded-2xl bg-white/70 px-3 py-2 text-xs font-bold text-emerald-800 dark:bg-white/10 dark:text-emerald-100">Local dev code: ' + escapeHtml(devCode) + '</p>' : '') +
      '<form class="mt-4 grid gap-3" data-contact-verification-form>' +
        '<input type="hidden" name="pendingRegistrationId" value="' + escapeHtml(pendingVerification.pendingRegistrationId) + '">' +
        '<input type="hidden" name="channel" value="' + escapeHtml(channel) + '">' +
        '<input type="hidden" name="' + escapeHtml(channel === 'phone' ? 'phone' : 'email') + '" value="' + escapeHtml(safeDestination) + '">' +
        '<label class="grid gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">Verification Code' +
          '<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required placeholder="123456" class="mt-1 h-12 rounded-2xl border border-emerald-200 bg-white px-4 text-base font-bold tracking-[0.24em] text-gray-950 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 dark:border-emerald-500/30 dark:bg-gray-950 dark:text-white">' +
        '</label>' +
        '<div class="flex flex-wrap gap-2">' +
          '<button type="submit" class="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">' + escapeHtml(actionLabel) + '</button>' +
          '<button type="button" class="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm font-bold text-emerald-700 dark:bg-white/10 dark:text-emerald-100" data-contact-verification-resend>Resend Code</button>' +
        '</div>' +
      '</form>';
    feedback.classList.remove('hidden');

    const form = feedback.querySelector('[data-contact-verification-form]');
    const resendButton = feedback.querySelector('[data-contact-verification-resend]');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      busy(btn, true, 'Verifying...');
      try {
        const result = await request('/auth/verify-contact', 'POST', {
          pendingRegistrationId: String(
            data.get('pendingRegistrationId') || '',
          ).trim(),
          channel: String(data.get('channel') || '').trim(),
          email: String(data.get('email') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          code: String(data.get('code') || '').trim(),
        });
        clearPendingSignupVerification();
        clearRegisterDraftState();
        clearRecentSignup();
        rememberAuthenticatedUser(result.user || null);
        panel(
          feedback,
          'success',
          'Verification Complete',
          'Your account has been verified successfully.',
          'Redirecting to your dashboard.',
        );
        window.setTimeout(function () {
          replaceLocation(
            resolveDashboardRedirect(
              (result && result.redirectTo) ||
                redirectTo ||
                pendingVerification.redirectTo,
            ),
          );
        }, 900);
      } catch (error) {
        panel(feedback, 'error', 'Verification Failed', error instanceof Error ? error.message : 'Unable to verify that code.', 'Check the code sent to your ' + destinationLabel + ' and try again.');
      } finally {
        busy(btn, false);
      }
    });

    if (resendButton) {
      resendButton.addEventListener('click', async function () {
        busy(resendButton, true, 'Sending...');
        try {
          const result = await request('/auth/resend-contact-verification', 'POST', {
            pendingRegistrationId: pendingVerification.pendingRegistrationId,
            channel: channel,
            email: channel === 'email' ? safeDestination : '',
            phone: channel === 'phone' ? safeDestination : '',
          });
          renderVerificationPrompt(
            feedback,
            Object.assign({}, pendingVerification, result.verification || {}),
            redirectTo,
          );
        } catch (error) {
          panel(feedback, 'error', 'Resend Failed', error instanceof Error ? error.message : 'Unable to resend the verification code.');
        } finally {
          busy(resendButton, false);
        }
      });
    }
  }

  function renderEmailVerificationPrompt(feedback, email, verification, redirectTo) {
    renderVerificationPrompt(
      feedback,
      Object.assign(
        {
          channel: 'email',
          destination: String(email || '').trim(),
        },
        verification || {},
      ),
      redirectTo,
    );
  }

  function buildRegisterPhoneValue(form, data) {
    const formData = data || new FormData(form);
    const currentPhone = String(formData.get('phone') || '').trim();
    if (currentPhone) {
      return currentPhone;
    }

    const dialCode = String(formData.get('phone_country_code') || '').trim();
    const rawPhone = String(formData.get('phone_local') || '').trim();

    if (!rawPhone) {
      return '';
    }

    let normalizedPhone = '';
    if (rawPhone.startsWith('+')) {
      const digits = rawPhone.replace(/\D/g, '');
      normalizedPhone = digits ? `+${digits}` : '';
    } else {
      const digits = rawPhone.replace(/\D/g, '').replace(/^0+/, '');
      normalizedPhone = dialCode && digits ? `${dialCode}${digits}` : '';
    }

    const phoneField = form.querySelector('#phone');
    if (phoneField) {
      phoneField.value = normalizedPhone;
    }

    return normalizedPhone;
  }

  async function submitRegisterForm(form, options) {
    const cfg = options || {};
    const feedback = document.getElementById(cfg.feedbackId || 'register-feedback');
    const btn = cfg.submitButton || form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const verifiedReady = readVerifiedSignupReady();
    const existingPendingVerification = readPendingSignupVerification();
    clear(feedback);
    busy(
      btn,
      true,
      verifiedReady
        ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i>Opening Dashboard...'
        : existingPendingVerification
        ? '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i>Verifying Code...'
        : '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i>Sending Code...',
    );
    try {
      if (verifiedReady) {
        clearVerifiedSignupReady();
        replaceLocation(
          resolveDashboardRedirect(
            verifiedReady.redirectTo || cfg.redirectTo || resolvePostLoginUrl(),
          ),
        );
        return {
          ok: true,
          state: 'authenticated',
        };
      }

      if (existingPendingVerification) {
        const code = String(data.get('verification_code') || '').trim();
        if (!/^\d{6}$/.test(code)) {
          throw new Error('Enter the 6-digit verification code sent to your email.');
        }

        const result = await request('/auth/verify-contact', 'POST', {
          pendingRegistrationId: existingPendingVerification.pendingRegistrationId,
          channel: existingPendingVerification.channel,
          email:
            existingPendingVerification.channel === 'email'
              ? existingPendingVerification.destination
              : '',
          phone:
            existingPendingVerification.channel === 'phone'
              ? existingPendingVerification.destination
              : '',
          code,
        });

        clearPendingSignupVerification();
        clearRegisterDraftState();
        clearRecentSignup();
        rememberAuthenticatedUser(result.user || null);
        rememberVerifiedSignupReady({
          redirectTo:
            result.redirectTo || cfg.redirectTo || resolvePostLoginUrl(),
          email: existingPendingVerification.destination,
        });
        syncRegisterVerificationUi(null);
        panel(
          feedback,
          'success',
          'Verified',
          'Email verified successfully.',
          'Click Continue to open your dashboard.',
        );

        return {
          ok: true,
          state: 'verified-ready',
        };
      }

      const firstName = String(data.get('first_name') || '').trim();
      const lastName = String(data.get('last_name') || '').trim();
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const verificationMethod = String(
        data.get('verification_method') || data.get('verificationMethod') || 'email',
      ).trim();
      const phoneValue = buildRegisterPhoneValue(form, data);
      const result = await request('/auth/register', 'POST', {
        firstName: firstName,
        lastName: lastName,
        username: String(data.get('username') || '').trim(),
        name: fullName,
        email: String(data.get('email') || '').trim(),
        phone: phoneValue,
        country: String(data.get('country') || '').trim(),
        password: String(data.get('password') || ''),
        passwordConfirmation: String(data.get('password_confirmation') || ''),
        agree: data.get('agree') !== null,
        coupon: String(data.get('coupon') || '').trim(),
        verificationMethod: verificationMethod || 'email',
        turnstileToken: token(form),
      });
      rememberRecentSignup({
        username: String(data.get('username') || '').trim(),
        email: String(data.get('email') || '').trim(),
        name: fullName,
      });
      const verification = result.verification || result.emailVerification || null;
      if (verification && verification.required) {
        const pendingVerification = Object.assign(
          {
            pendingRegistrationId: String(
              result.pendingRegistrationId ||
                verification.pendingRegistrationId ||
                '',
            ).trim(),
            channel: verificationMethod === 'phone' ? 'phone' : 'email',
            destination:
              verificationMethod === 'phone'
                ? phoneValue
                : String(data.get('email') || '').trim(),
            redirectTo: cfg.redirectTo || resolvePostLoginUrl(),
            username: String(data.get('username') || '').trim(),
            email: String(data.get('email') || '').trim(),
            phone: phoneValue,
            name: fullName,
            resendAvailableAt: Date.now() + REGISTER_VERIFICATION_RESEND_DELAY_MS,
          },
          verification,
        );
        rememberPendingSignupVerification(pendingVerification);
        renderVerificationPrompt(
          feedback,
          pendingVerification,
          cfg.redirectTo || resolvePostLoginUrl(),
        );
        resetTurnstile(form);
        return {
          ok: true,
          state: 'pending-verification',
        };
      }
      clearPendingSignupVerification();
      clearRegisterDraftState();
      rememberAuthenticatedUser(result.user || null);
      panel(feedback, 'success', 'Account Ready', 'Your Novabit account has been created successfully.', 'Redirecting to your dashboard.');
      form.reset();
      window.setTimeout(function () {
        replaceLocation(
          resolveDashboardRedirect(result.redirectTo || cfg.redirectTo),
        );
      }, 1400);
      return {
        ok: true,
        state: 'authenticated',
      };
    } catch (error) {
      panel(feedback, 'error', 'Registration Failed', error instanceof Error ? error.message : 'Registration failed.', window.location.protocol === 'file:' ? 'Use http://localhost for reliable session-based flows.' : '');
      return {
        ok: false,
      };
    } finally {
      busy(btn, false);
      syncRegisterVerificationUi(readPendingSignupVerification());
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function restorePendingSignupVerification(options) {
    const cfg = options || {};
    const feedback = document.getElementById(cfg.feedbackId || 'register-feedback');
    const pendingVerification = readPendingSignupVerification();
    if (!feedback || !pendingVerification) {
      return null;
    }

    renderVerificationPrompt(
      feedback,
      pendingVerification,
      cfg.redirectTo || pendingVerification.redirectTo || resolvePostLoginUrl(),
    );

    return pendingVerification;
  }

  async function checkRegistrationAvailability(payload) {
    return request('/auth/register-availability', 'POST', payload || {});
  }

  function bindLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    const feedback = document.getElementById('login-feedback');
    const identityField = form.querySelector('[name="email"]');
    const recentSignup = readRecentSignup();
    const options = recentSignupOptions(recentSignup);

    if (identityField && !String(identityField.value || '').trim() && options.length) {
      identityField.value = options[0];
    }

    if (feedback && recentSignup && options.length) {
      panel(
        feedback,
        'info',
        'Account Ready',
        recentSignup.name
          ? `${recentSignup.name}, your account is ready for sign-in.`
          : 'Your account is ready for sign-in.',
        options.length > 1
          ? `Use ${options[0]} or ${options[1]} to sign in.`
          : `Use ${options[0]} to sign in.`,
      );
    }

    request('/auth/me', 'GET')
      .then(function (result) {
        if (!result || !result.authenticated) {
          clearAuthenticatedUserHint();
          return;
        }
        rememberAuthenticatedUser(result.user || null);
        replaceLocation(resolvePostLoginUrl());
      })
      .catch(function () {});

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      clear(feedback);
      busy(btn, true, '<i data-lucide="loader-2" class="h-5 w-5 animate-spin"></i><span>Verifying Access...</span>');
      try {
        const result = await request('/auth/login', 'POST', {
          emailOrUsername: String(data.get('email') || '').trim(),
          password: String(data.get('password') || ''),
          remember: data.get('remember') !== null,
          turnstileToken: token(form),
        });
        clearRecentSignup();
        rememberAuthenticatedUser(result.user || null);
        panel(feedback, 'success', 'Access Granted', 'Your credentials were verified successfully.', window.location.origin.startsWith('http') ? 'Redirecting to your HTML dashboard.' : 'Use http://localhost so the session cookie can be reused.');
        window.setTimeout(function () { replaceLocation(resolvePostLoginUrl()); }, 900);
      } catch (error) {
        const failure = describeLoginFailure(error);
        panel(feedback, 'error', 'Sign-In Failed', failure.message, failure.detail);
        resetTurnstile(form);
      } finally {
        busy(btn, false);
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  function bindForgot() {
    const form = document.getElementById('forgot-password-form');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const feedback = document.getElementById('forgot-password-feedback');
      const btn = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      clear(feedback);
      busy(btn, true, '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Sending Request...</span>');
      try {
        const result = await request('/auth/forgot-password', 'POST', {
          email: String(data.get('email') || '').trim(),
          turnstileToken: token(form),
        });
        panel(feedback, 'success', 'Reset Request Queued', result.message || 'Your request has been accepted.', result.reference ? `Reference: ${result.reference}` : '');
        form.reset();
        resetTurnstile(form);
      } catch (error) {
        panel(feedback, 'error', 'Request Failed', error instanceof Error ? error.message : 'Unable to queue the reset request.');
        resetTurnstile(form);
      } finally {
        busy(btn, false);
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    });
  }

  function bindContact() {
    document.querySelectorAll('#contact-form').forEach(function (form) {
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const feedback = document.getElementById('contact-feedback');
        const btn = form.querySelector('button[type="submit"]');
        const data = new FormData(form);
        clear(feedback);
        busy(btn, true, '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-opacity="0.25" stroke-width="4"></circle><path d="M22 12a10 10 0 0 1-10 10" stroke-width="4"></path></svg><span>Routing Message...</span>');
        try {
          const result = await request('/contact', 'POST', {
            topic: String(data.get('question') || data.get('topic') || '').trim(),
            name: String(data.get('name') || '').trim(),
            email: String(data.get('email') || '').trim(),
            message: String(data.get('message') || '').trim(),
            turnstileToken: token(form),
          });
          panel(feedback, 'success', 'Message Received', result.message || 'Your message has been delivered to support.', result.reference ? `Reference: ${result.reference} - Estimated response: ${result.estimatedResponseWindow}` : '');
          form.reset();
          resetTurnstile(form);
        } catch (error) {
          panel(feedback, 'error', 'Message Not Sent', error instanceof Error ? error.message : 'Unable to send your message.');
          resetTurnstile(form);
        } finally {
          busy(btn, false);
        }
      });
    });
  }

  function init() {
    redirectAuthenticatedLoginView();
    configureRegisterVerificationOptions();
    bindDashboardActivityTracking();
    syncRegisterVerificationUi(readPendingSignupVerification());
    bindLogin();
    bindForgot();
    bindContact();
    document.querySelectorAll('form[data-platform-form]').forEach(renderTurnstile);
  }

  window.NovabitHtmlPlatform = {
    submitRegisterForm: submitRegisterForm,
    continueVerifiedSignup: continueVerifiedSignup,
    checkRegistrationAvailability: checkRegistrationAvailability,
    restorePendingSignupVerification: restorePendingSignupVerification,
    isSmsVerificationAvailable: isSmsVerificationAvailable,
    autoVerifyRegisterCode: autoVerifyRegisterCode,
    resendRegisterVerificationCode: resendRegisterVerificationCode,
    trackUserActivity: trackUserActivity,
    syncRegisterVerificationStage: function () {
      return syncRegisterVerificationUi(readPendingSignupVerification());
    },
  };
  window.addEventListener('pageshow', function () {
    redirectAuthenticatedLoginView();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
