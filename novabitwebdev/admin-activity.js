(function () {
  const API_URL = resolveApiUrl();
  const state = {
    authUser: null,
    activities: [],
    alerts: [],
    stats: null,
    selectedActivity: null,
    stream: null,
    reconnectTimer: 0,
    reloadTimer: 0,
    filters: {
      hours: 24,
      from: '',
      to: '',
      userId: '',
      activityType: '',
      reviewState: 'all',
      search: '',
      limit: 120,
    },
  };

  const elements = {
    gate: document.getElementById('gate'),
    shell: document.getElementById('shell'),
    loginForm: document.getElementById('login-form'),
    loginId: document.getElementById('login-id'),
    loginPass: document.getElementById('login-pass'),
    loginBtn: document.getElementById('login-btn'),
    loginStatus: document.getElementById('login-status'),
    logoutBtn: document.getElementById('logout-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    applyFilterBtn: document.getElementById('apply-filter-btn'),
    clearFilterBtn: document.getElementById('clear-filter-btn'),
    clearUserFilterBtn: document.getElementById('clear-user-filter-btn'),
    status: document.getElementById('activity-status'),
    count: document.getElementById('activity-count'),
    feedBody: document.getElementById('activity-feed-body'),
    alerts: document.getElementById('activity-alerts'),
    liveChip: document.getElementById('live-chip'),
    streamStatus: document.getElementById('stream-status'),
    streamRefresh: document.getElementById('stream-refresh'),
    statTotal: document.getElementById('stat-total'),
    statLogins: document.getElementById('stat-logins'),
    statSecurity: document.getElementById('stat-security'),
    statInvestments: document.getElementById('stat-investments'),
    statInteractions: document.getElementById('stat-interactions'),
    statFlagged: document.getElementById('stat-flagged'),
    filterType: document.getElementById('filter-type'),
    filterReview: document.getElementById('filter-review'),
    filterHours: document.getElementById('filter-hours'),
    filterSearch: document.getElementById('filter-search'),
    filterFrom: document.getElementById('filter-from'),
    filterTo: document.getElementById('filter-to'),
    userFilterBar: document.getElementById('user-filter-bar'),
    userFilterLabel: document.getElementById('user-filter-label'),
    userFilterCopy: document.getElementById('user-filter-copy'),
    modal: document.getElementById('activity-modal'),
    modalTitle: document.getElementById('activity-modal-title'),
    modalCopy: document.getElementById('activity-modal-copy'),
    modalUser: document.getElementById('modal-user'),
    modalMeta: document.getElementById('modal-meta'),
    modalLocation: document.getElementById('modal-location'),
    modalDevice: document.getElementById('modal-device'),
    modalDetails: document.getElementById('modal-details'),
    modalHistory: document.getElementById('modal-history'),
    modalNote: document.getElementById('modal-note'),
    modalContactBtn: document.getElementById('modal-contact-btn'),
    modalFlagBtn: document.getElementById('modal-flag-btn'),
    modalReviewBtn: document.getElementById('modal-review-btn'),
    modalActionBtn: document.getElementById('modal-action-btn'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
  };

  function resolveApiUrl() {
    const configured =
      typeof window.NOVABIT_API_URL === 'string'
        ? window.NOVABIT_API_URL.trim()
        : '';

    if (configured) {
      return configured.replace(/\/+$/, '');
    }

    if (!window.location || window.location.protocol === 'file:') {
      return 'http://localhost:4000/api/v1';
    }

    return `${window.location.origin}/api/v1`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(target, message, type) {
    if (!target) return;
    target.textContent = message;
    target.classList.remove('error', 'success');
    if (type === 'error' || type === 'success') {
      target.classList.add(type);
    }
  }

  function parsePayload(text) {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  function readMessage(payload, fallback) {
    if (payload && typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }

    if (payload && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }

    return fallback;
  }

  async function request(path, options) {
    const settings = options || {};
    const response = await fetch(`${API_URL}${path}`, {
      method: settings.method || 'GET',
      credentials: 'include',
      headers: Object.assign(
        { Accept: 'application/json' },
        settings.body ? { 'Content-Type': 'application/json' } : {},
      ),
      body: settings.body ? JSON.stringify(settings.body) : undefined,
    });
    const payload = parsePayload(await response.text());

    if (!response.ok) {
      throw new Error(
        readMessage(payload, `Request failed with status ${response.status}.`),
      );
    }

    return payload;
  }

  function formatDateTime(value) {
    if (!value) return 'Unknown';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unknown';
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatRelative(value) {
    if (!value) return 'Just now';
    const parsed = new Date(value).getTime();
    if (!Number.isFinite(parsed)) return 'Just now';
    const diffMinutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h ago`;
    return `${Math.round(diffMinutes / 1440)}d ago`;
  }

  function formatReviewState(value) {
    const normalized = String(value || 'new').trim().toLowerCase();
    if (normalized === 'reviewed') return 'Reviewed';
    if (normalized === 'flagged') return 'Flagged';
    if (normalized === 'actioned') return 'Actioned';
    return 'New';
  }

  function formatToken(value, fallback) {
    const normalized = String(value || '').replace(/[_-]+/g, ' ').trim();
    return normalized || fallback;
  }

  function setAuthenticatedState(user) {
    state.authUser = user || null;
    if (elements.gate) elements.gate.hidden = Boolean(state.authUser);
    if (elements.shell) elements.shell.hidden = !state.authUser;
  }

  function syncFilters() {
    elements.filterType.value = state.filters.activityType || '';
    elements.filterReview.value = state.filters.reviewState || 'all';
    elements.filterHours.value = String(state.filters.hours || 24);
    elements.filterSearch.value = state.filters.search || '';
    elements.filterFrom.value = state.filters.from || '';
    elements.filterTo.value = state.filters.to || '';
    const hasUserFilter = Boolean(state.filters.userId);
    elements.userFilterBar.hidden = !hasUserFilter;
    elements.clearUserFilterBtn.hidden = !hasUserFilter;
  }

  function collectFilters() {
    state.filters.activityType = elements.filterType.value.trim();
    state.filters.reviewState = elements.filterReview.value.trim() || 'all';
    state.filters.hours = Number(elements.filterHours.value) || 24;
    state.filters.search = elements.filterSearch.value.trim();
    state.filters.from = elements.filterFrom.value.trim();
    state.filters.to = elements.filterTo.value.trim();
  }

  function buildQuery() {
    const params = new URLSearchParams();
    params.set('hours', String(state.filters.hours || 24));
    params.set('limit', String(state.filters.limit || 120));
    if (state.filters.activityType) params.set('activityType', state.filters.activityType);
    if (state.filters.reviewState) params.set('reviewState', state.filters.reviewState);
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.userId) params.set('userId', state.filters.userId);
    if (state.filters.from) params.set('from', new Date(state.filters.from).toISOString());
    if (state.filters.to) params.set('to', new Date(state.filters.to).toISOString());
    return params.toString();
  }

  function renderStats() {
    const stats = state.stats || {};
    elements.statTotal.textContent = String(stats.total || 0);
    elements.statLogins.textContent = String(stats.logins || 0);
    elements.statSecurity.textContent = String(stats.security || 0);
    elements.statInvestments.textContent = String(stats.investments || 0);
    elements.statInteractions.textContent = String(stats.interactions || 0);
    elements.statFlagged.textContent = String(stats.flagged || 0);
  }

  function renderAlerts() {
    const alerts = Array.isArray(state.alerts) ? state.alerts : [];
    if (!alerts.length) {
      elements.alerts.innerHTML =
        '<div class="empty">No alerts in the current window.</div>';
      return;
    }

    elements.alerts.innerHTML = alerts
      .map(function (alert) {
        return `<article class="activity-alert-card ${escapeHtml(alert.severity || 'info')}">
          <strong>${escapeHtml(alert.title || 'Alert')}</strong>
          <p>${escapeHtml(alert.copy || '')}</p>
          <p>${escapeHtml(alert.userLabel || 'Unknown user')} · ${escapeHtml(formatRelative(alert.createdAt))}</p>
        </article>`;
      })
      .join('');
  }

  function renderFeed() {
    const activities = Array.isArray(state.activities) ? state.activities : [];
    elements.count.textContent = `${activities.length} activities`;

    if (!activities.length) {
      elements.feedBody.innerHTML =
        '<tr><td colspan="7"><div class="empty">No activity matched the current filters.</div></td></tr>';
      return;
    }

    elements.feedBody.innerHTML = activities
      .map(function (activity) {
        const userLabel =
          activity.userName ||
          activity.userUsername ||
          activity.userEmail ||
          'Unknown user';
        const locationLabel =
          [activity.city, activity.country].filter(Boolean).join(', ') ||
          activity.ipAddress ||
          'Unknown';
        const deviceLabel =
          [activity.browser, activity.platform, activity.deviceType]
            .filter(Boolean)
            .join(' · ') || 'Unknown';

        return `<tr>
          <td>
            <strong>${escapeHtml(activity.activityLabel || formatToken(activity.activityType, 'Activity'))}</strong>
            <div class="activity-badges">
              <span class="badge ${escapeHtml(activity.severity || 'info')}">${escapeHtml(activity.severity || 'info')}</span>
              <span class="badge ${escapeHtml(activity.reviewedState || 'new')}">${escapeHtml(formatReviewState(activity.reviewedState))}</span>
            </div>
          </td>
          <td>
            <strong>${escapeHtml(userLabel)}</strong>
            ${activity.userId ? `<div class="activity-user-badges"><button type="button" class="activity-user-trigger" data-user-filter="${escapeHtml(activity.userId)}" data-activity-id="${escapeHtml(activity.id)}">Only this user</button></div>` : ''}
          </td>
          <td><strong>${escapeHtml(locationLabel)}</strong><span>${escapeHtml(activity.ipAddress || 'Unknown IP')}</span></td>
          <td><strong>${escapeHtml(deviceLabel)}</strong><span>${escapeHtml(activity.pagePath || 'No page path')}</span></td>
          <td><strong>${escapeHtml(formatRelative(activity.createdAt))}</strong><span>${escapeHtml(formatDateTime(activity.createdAt))}</span></td>
          <td><strong>${escapeHtml(formatReviewState(activity.reviewedState))}</strong><span>${escapeHtml(activity.adminAction || 'Pending admin review')}</span></td>
          <td><button type="button" class="activity-row-button" data-open-activity="${escapeHtml(activity.id)}">View</button></td>
        </tr>`;
      })
      .join('');
  }

  function setStreamState(label, live) {
    elements.streamStatus.textContent = label;
    elements.liveChip.classList.toggle('is-offline', !live);
  }

  function closeModal() {
    state.selectedActivity = null;
    elements.modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function openModal(activity) {
    state.selectedActivity = activity;
    document.body.classList.add('modal-open');
    elements.modal.hidden = false;
    elements.modalTitle.textContent =
      activity.activityLabel || formatToken(activity.activityType, 'Activity');
    elements.modalCopy.textContent =
      `${formatReviewState(activity.reviewedState)} · ${formatDateTime(activity.createdAt)}`;
    elements.modalUser.textContent =
      activity.userName || activity.userUsername || activity.userEmail || 'Unknown user';
    elements.modalMeta.textContent =
      `${activity.activityType} · ${activity.activityCategory} · ${activity.ipAddress || 'Unknown IP'}`;
    elements.modalLocation.textContent =
      [activity.city, activity.country].filter(Boolean).join(', ') ||
      activity.ipAddress ||
      'Unknown';
    elements.modalDevice.textContent =
      [
        activity.browser,
        activity.platform,
        activity.deviceType,
        activity.pagePath,
      ]
        .filter(Boolean)
        .join(' · ') || 'Unknown device';
    elements.modalDetails.textContent = JSON.stringify(activity.details || {}, null, 2);
    elements.modalNote.value = activity.adminNote || '';
    elements.modalContactBtn.disabled = !activity.userEmail;
    elements.modalHistory.innerHTML =
      '<div class="activity-empty-inline">Loading user history.</div>';

    if (!activity.userId) {
      elements.modalHistory.innerHTML =
        '<div class="activity-empty-inline">No linked user history for this record.</div>';
      return;
    }

    void loadUserHistory(activity.userId);
  }

  async function loadUserHistory(userId) {
    try {
      const result = await request(
        `/activity/admin/users/${encodeURIComponent(userId)}/history?hours=168&limit=8`,
      );
      const activities = Array.isArray(result.activities) ? result.activities : [];
      if (!activities.length) {
        elements.modalHistory.innerHTML =
          '<div class="activity-empty-inline">No recent history for this user.</div>';
        return;
      }

      elements.modalHistory.innerHTML = activities
        .slice(0, 8)
        .map(function (activity) {
          return `<article class="activity-history-card">
            <strong>${escapeHtml(activity.activityLabel || formatToken(activity.activityType, 'Activity'))}</strong>
            <p>${escapeHtml(formatDateTime(activity.createdAt))}</p>
          </article>`;
        })
        .join('');
    } catch (error) {
      elements.modalHistory.innerHTML = `<div class="activity-empty-inline">${escapeHtml(error instanceof Error ? error.message : 'Unable to load user history.')}</div>`;
    }
  }

  async function applyReview(reviewState, adminAction) {
    if (!state.selectedActivity) return;

    try {
      const result = await request(
        `/activity/admin/${encodeURIComponent(state.selectedActivity.id)}/review`,
        {
          method: 'POST',
          body: {
            reviewState: reviewState,
            adminAction: adminAction,
            adminNote: elements.modalNote.value.trim(),
          },
        },
      );
      closeModal();
      setStatus(
        elements.status,
        `${formatToken(state.selectedActivity.activityLabel, 'Activity')} marked ${formatReviewState(result.activity.reviewedState).toLowerCase()}.`,
        'success',
      );
      await loadFeed(false);
    } catch (error) {
      setStatus(
        elements.status,
        error instanceof Error ? error.message : 'Unable to update this activity record.',
        'error',
      );
    }
  }

  async function loadFeed(announce) {
    collectFilters();
    try {
      const result = await request(`/activity/admin/feed?${buildQuery()}`);
      state.activities = Array.isArray(result.activities) ? result.activities : [];
      state.alerts = Array.isArray(result.alerts) ? result.alerts : [];
      state.stats = result.stats || null;
      renderStats();
      renderAlerts();
      renderFeed();
      syncFilters();
      elements.streamRefresh.textContent = formatDateTime(new Date().toISOString());
      if (announce !== false) {
        setStatus(elements.status, 'Live activity feed updated.', 'success');
      }
    } catch (error) {
      state.activities = [];
      state.alerts = [];
      state.stats = null;
      renderStats();
      renderAlerts();
      renderFeed();
      setStatus(
        elements.status,
        error instanceof Error ? error.message : 'Unable to load the activity feed.',
        'error',
      );
    }
  }

  function scheduleReload(delay) {
    window.clearTimeout(state.reloadTimer);
    state.reloadTimer = window.setTimeout(function () {
      void loadFeed(false);
    }, delay || 800);
  }

  function closeStream() {
    if (state.stream) {
      state.stream.close();
      state.stream = null;
    }
    window.clearTimeout(state.reconnectTimer);
  }

  function openStream() {
    closeStream();
    if (!state.authUser || typeof window.EventSource !== 'function') {
      setStreamState('Unavailable', false);
      return;
    }

    try {
      const stream = new EventSource(`${API_URL}/activity/admin/stream`, {
        withCredentials: true,
      });
      state.stream = stream;
      setStreamState('Connected', true);
      stream.addEventListener('activity', function () {
        setStreamState('Connected', true);
        scheduleReload(650);
      });
      stream.addEventListener('ping', function () {
        setStreamState('Connected', true);
      });
      stream.onerror = function () {
        setStreamState('Reconnecting', false);
        closeStream();
        state.reconnectTimer = window.setTimeout(openStream, 2500);
      };
    } catch {
      setStreamState('Unavailable', false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const identifier = elements.loginId.value.trim();
    const password = elements.loginPass.value;

    if (!identifier || !password) {
      setStatus(elements.loginStatus, 'Enter the admin username and password to continue.', 'error');
      return;
    }

    elements.loginBtn.disabled = true;
    elements.loginBtn.textContent = 'Signing In...';

    try {
      const result = await request('/auth/admin/login', {
        method: 'POST',
        body: {
          emailOrUsername: identifier,
          password: password,
          remember: true,
        },
      });
      setAuthenticatedState(result.user || null);
      setStatus(elements.loginStatus, 'Admin session active.', 'success');
      await loadFeed(false);
      openStream();
    } catch (error) {
      setAuthenticatedState(null);
      setStatus(
        elements.loginStatus,
        error instanceof Error ? error.message : 'Unable to sign in to the admin console.',
        'error',
      );
    } finally {
      elements.loginBtn.disabled = false;
      elements.loginBtn.textContent = 'Sign In';
    }
  }

  async function restoreSession() {
    setStatus(elements.status, 'Checking admin session.');
    try {
      const result = await request('/auth/admin/me');
      if (!result.authenticated || !result.user) {
        setAuthenticatedState(null);
        setStatus(elements.status, 'Sign in with the admin account to review live activity.');
        return;
      }

      setAuthenticatedState(result.user);
      await loadFeed(false);
      openStream();
      setStatus(elements.status, 'Admin session restored.', 'success');
    } catch (error) {
      setAuthenticatedState(null);
      setStatus(
        elements.status,
        error instanceof Error ? error.message : 'Unable to restore the admin session.',
        'error',
      );
    }
  }

  async function logout() {
    closeStream();
    try {
      await request('/auth/admin/logout', {
        method: 'POST',
        body: {},
      });
    } catch {}
    setAuthenticatedState(null);
    setStatus(elements.status, 'Admin session closed.', 'success');
  }

  function bindEvents() {
    if (elements.loginForm) {
      elements.loginForm.addEventListener('submit', handleLogin);
    }

    if (elements.logoutBtn) {
      elements.logoutBtn.addEventListener('click', function () {
        void logout();
      });
    }

    if (elements.refreshBtn) {
      elements.refreshBtn.addEventListener('click', function () {
        void loadFeed(true);
      });
    }

    if (elements.applyFilterBtn) {
      elements.applyFilterBtn.addEventListener('click', function () {
        void loadFeed(true);
      });
    }

    if (elements.clearFilterBtn) {
      elements.clearFilterBtn.addEventListener('click', function () {
        state.filters = {
          hours: 24,
          from: '',
          to: '',
          userId: '',
          activityType: '',
          reviewState: 'all',
          search: '',
          limit: 120,
        };
        syncFilters();
        void loadFeed(true);
      });
    }

    if (elements.clearUserFilterBtn) {
      elements.clearUserFilterBtn.addEventListener('click', function () {
        state.filters.userId = '';
        syncFilters();
        void loadFeed(true);
      });
    }

    elements.feedBody.addEventListener('click', function (event) {
      const target =
        event.target instanceof Element
          ? event.target.closest('[data-open-activity],[data-user-filter]')
          : null;
      if (!target) return;

      const activityId =
        target.getAttribute('data-open-activity') ||
        target.getAttribute('data-activity-id') ||
        '';
      const activity = state.activities.find(function (entry) {
        return entry.id === activityId;
      });
      if (!activity) return;

      if (target.hasAttribute('data-user-filter') && activity.userId) {
        state.filters.userId = activity.userId;
        elements.userFilterLabel.textContent =
          activity.userName || activity.userUsername || activity.userEmail || 'Filtered user';
        elements.userFilterCopy.textContent = 'Showing activity for one account only.';
        syncFilters();
        void loadFeed(true);
        return;
      }

      openModal(activity);
    });

    elements.modalCloseBtn.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', function (event) {
      if (event.target === elements.modal) closeModal();
    });
    elements.modalFlagBtn.addEventListener('click', function () {
      void applyReview('flagged', 'flag_suspicious');
    });
    elements.modalReviewBtn.addEventListener('click', function () {
      void applyReview('reviewed', 'reviewed');
    });
    elements.modalActionBtn.addEventListener('click', function () {
      void applyReview('actioned', 'follow_up_completed');
    });
    elements.modalContactBtn.addEventListener('click', function () {
      if (!state.selectedActivity || !state.selectedActivity.userEmail) return;
      window.location.href =
        `mailto:${encodeURIComponent(state.selectedActivity.userEmail)}` +
        `?subject=${encodeURIComponent('Novabit activity review follow-up')}`;
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !elements.modal.hidden) {
        closeModal();
      }
    });
  }

  bindEvents();
  syncFilters();
  void restoreSession();
})();
