(function () {
  const PUBLIC_SELECTION_KEY = 'novabit_public_selected_plan';
  const DASHBOARD_PLAN_KEY = 'novabit_dashboard_selected_plan';
  const AUTH_HINT_KEY = 'novabit_authenticated_user';
  const ACTIVITY_KEY = 'novabit_dashboard_last_activity';
  const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

  const fallbackCatalog = {
    featuredPlanKey: 'growth',
    plans: [
      {
        key: 'starter',
        name: 'Starter Plan',
        badge: 'Entry Tier',
        deck: '20% projected return every 30 days.',
        summary: 'Perfect for first-time investors with a lower entry threshold.',
        description: 'The starter tier keeps the barrier low while preserving the same structured monthly plan workflow used across the platform.',
        minimum: 500,
        cycleDays: 30,
        returnRate: 0.2,
        returnLabel: '20% every 30 days',
        durationOptionsDays: [30, 60, 90, 180],
        features: [
          'Low minimum investment',
          'Daily interest tracking',
          'Email notifications'
        ]
      },
      {
        key: 'growth',
        name: 'Growth Plan',
        badge: 'Most Selected',
        deck: '30% projected return every 30 days.',
        summary: 'Balanced option for investors seeking stronger monthly returns.',
        description: 'This is the core Novabit tier for users moving beyond entry level and looking for a cleaner balance of size, return, and flexibility.',
        minimum: 2000,
        cycleDays: 30,
        returnRate: 0.3,
        returnLabel: '30% every 30 days',
        durationOptionsDays: [30, 60, 90, 180],
        features: [
          'Optimal balance of risk and return',
          'Higher monthly return profile',
          'Great for regular investors'
        ]
      },
      {
        key: 'premium',
        name: 'Premium Plan',
        badge: 'Priority Tier',
        deck: '45% projected return every 30 days.',
        summary: 'Higher returns for investors with larger capital allocations.',
        description: 'Premium is the top public plan tier for investors who want larger capital deployment with priority-style handling across the funding lifecycle.',
        minimum: 5000,
        cycleDays: 30,
        returnRate: 0.45,
        returnLabel: '45% every 30 days',
        durationOptionsDays: [30, 60, 90, 180],
        features: [
          'Highest monthly return rate',
          'Priority funding workflow',
          'Designed for large capital'
        ]
      }
    ]
  };

  const iconMap = { starter: 'sparkles', growth: 'rocket', premium: 'crown' };
  const state = {
    plans: [],
    featuredPlanKey: 'growth',
    selectedPlanKey: 'growth',
    amount: 2000,
    durationDays: 30,
    mode: 'simple'
  };

  function resolveApiUrl() {
    const configured = typeof window.NOVABIT_API_URL === 'string' ? window.NOVABIT_API_URL.trim() : '';
    if (configured) return configured.replace(/\/+$/, '');
    if (!window.location || window.location.protocol === 'file:') return 'http://localhost:4000/api/v1';
    const host = window.location.hostname || '';
    const port = window.location.port || '';
    if ((host === 'localhost' || host === '127.0.0.1') && port === '8080') {
      return `${window.location.protocol}//${host}:4000/api/v1`;
    }
    return `${window.location.origin.replace(/\/+$/, '')}/api/v1`;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function formatPercent(value) {
    return `${((Number(value) || 0) * 100).toFixed(0)}%`;
  }

  function isAuthenticated() {
    try {
      const rawUser = window.localStorage.getItem(AUTH_HINT_KEY);
      const lastActivity = Number(window.localStorage.getItem(ACTIVITY_KEY) || '0');
      if (!rawUser || !lastActivity || Date.now() - lastActivity > IDLE_TIMEOUT_MS) return false;
      const parsed = JSON.parse(rawUser);
      return !!parsed && typeof parsed === 'object';
    } catch {
      return false;
    }
  }

  function getPlan(key) {
    return state.plans.find((plan) => plan.key === key) || state.plans[0] || fallbackCatalog.plans[1];
  }

  function savePlanSelection(plan) {
    const payload = {
      key: plan.key,
      name: plan.name,
      badge: plan.badge,
      deck: plan.deck,
      summary: plan.summary,
      description: plan.description,
      minimum: plan.minimum,
      cycleDays: plan.cycleDays,
      returnRate: plan.returnRate,
      returnLabel: plan.returnLabel,
      durationOptionsDays: Array.isArray(plan.durationOptionsDays) ? plan.durationOptionsDays.slice() : [30],
      selectedAt: Date.now(),
      source: 'plans-page'
    };

    try {
      window.localStorage.setItem(PUBLIC_SELECTION_KEY, JSON.stringify(payload));
      window.localStorage.setItem(DASHBOARD_PLAN_KEY, plan.key);
    } catch {}
  }

  function handlePlanContinue(plan) {
    savePlanSelection(plan);
    window.location.href = isAuthenticated()
      ? 'dashboard.html#deposit-funds'
      : `register.html?plan=${encodeURIComponent(plan.key)}`;
  }

  function renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function updateHero() {
    const featured = getPlan(state.featuredPlanKey);
    const action = document.getElementById('plans-hero-primary');
    document.getElementById('plans-featured-name').textContent = featured.name;
    document.getElementById('plans-featured-rate').textContent = featured.returnLabel;
    document.getElementById('plans-featured-copy').textContent = featured.summary;
    document.getElementById('plans-featured-minimum').textContent = formatCurrency(featured.minimum);
    document.getElementById('plans-featured-cycle').textContent = `${featured.cycleDays} days`;
    document.getElementById('plans-featured-description').textContent = featured.description;
    action.textContent = isAuthenticated() ? 'Open Dashboard Funding' : 'Create Account';
    action.href = isAuthenticated() ? 'dashboard.html#deposit-funds' : 'register.html';
  }

  function renderPlans() {
    const grid = document.getElementById('plans-grid');
    const ctaLabel = isAuthenticated() ? 'Fund Now' : 'Choose Plan';

    grid.innerHTML = state.plans.map((plan) => {
      const selected = plan.key === state.selectedPlanKey;
      const gradeColors = {
        starter: { bg: 'bg-[#e9f8f7]', border: 'border-[#a3e8e6]', icon: 'bg-[#28c0c3] text-white', badge: 'bg-[#a3e8e6]/60 text-[#0a4a57]', rate: 'text-[#0a4a57]', btn: 'from-[#28c0c3] to-[#1aa7b1]' },
        growth: { bg: 'bg-[#e0f7f6]', border: 'border-[#52dde3]', icon: 'bg-[#0f6f7a] text-white', badge: 'bg-[#52dde3]/60 text-[#0a4a57]', rate: 'text-[#0f6f7a]', btn: 'from-[#28c0c3] to-[#1aa7b1]' },
        premium: { bg: 'bg-[#fff8ed]', border: 'border-[#ffb84d]', icon: 'bg-[#ffb84d] text-[#7a4a0a]', badge: 'bg-[#ffb84d]/60 text-[#7a4a0a]', rate: 'text-[#c47a00]', btn: 'from-[#ffb84d] to-[#ff9500]' }
      };
      const colors = gradeColors[plan.key] || gradeColors.growth;

      const features = (plan.features || []).slice(0, 3).map((feature) => `
        <li class="flex items-center gap-2 text-sm text-slate-600">
          <i data-lucide="check" class="h-4 w-4 ${plan.key === 'premium' ? 'text-[#ffb84d]' : 'text-[#28c0c3]'}"></i>
          <span>${feature}</span>
        </li>
      `).join('');

      return `
        <article class="plans-card plans-card--${plan.key} ${selected ? 'is-active' : ''} rounded-[1.5rem] border-2 ${colors.border} bg-white overflow-hidden" data-plan-card="${plan.key}">
          <div class="h-full flex flex-col">
            <!-- Header with colored background -->
            <div class="relative ${colors.bg} px-6 pt-8 pb-6 text-center">
              <!-- Icon -->
              <div class="inline-flex h-16 w-16 items-center justify-center rounded-full ${colors.icon} shadow-lg mb-4">
                <i data-lucide="${iconMap[plan.key] || 'sparkles'}" class="h-7 w-7"></i>
              </div>

              <!-- Badge -->
              <span class="inline-block rounded-full ${colors.badge} px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] mb-3">${plan.badge}</span>

              <!-- Plan Name -->
              <h3 class="plans-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-slate-900 mb-2">${plan.name}</h3>

              <!-- Short description -->
              <p class="text-sm text-slate-600 leading-relaxed">${plan.summary}</p>
            </div>

            <!-- Body -->
            <div class="flex-1 px-6 py-6">
              <!-- Return Rate -->
              <div class="text-center mb-5">
                <strong class="block text-[2.8rem] font-extrabold leading-none tracking-[-0.04em] ${colors.rate}">${formatPercent(plan.returnRate)}</strong>
                <span class="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">every ${plan.cycleDays} days</span>
              </div>

              <!-- Min / Cycle Row -->
              <div class="flex items-center justify-center gap-4 mb-5 text-sm">
                <div class="flex items-center gap-1.5">
                  <span class="font-medium text-slate-400">Min:</span>
                  <span class="font-bold text-slate-700">$${plan.minimum.toLocaleString()}</span>
                </div>
                <span class="text-slate-300">|</span>
                <div class="flex items-center gap-1.5">
                  <span class="font-medium text-slate-400">Cycle:</span>
                  <span class="font-bold text-slate-700">${plan.cycleDays} days</span>
                </div>
              </div>

              <!-- Features -->
              <ul class="space-y-2.5 mb-6">${features}</ul>

              <!-- CTA Button -->
              <button type="button" class="w-full rounded-xl bg-gradient-to-r ${colors.btn} px-5 py-3.5 text-sm font-bold text-white shadow-lg transition hover:shadow-xl hover:-translate-y-0.5" data-plan-action="${plan.key}">
                ${ctaLabel}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('[data-plan-action]').forEach((button) => {
      button.addEventListener('click', () => handlePlanContinue(getPlan(button.getAttribute('data-plan-action'))));
    });

    grid.querySelectorAll('[data-plan-card]').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedPlanKey = String(card.getAttribute('data-plan-card') || '').trim();
        const plan = getPlan(state.selectedPlanKey);
        state.amount = Math.max(Number(state.amount) || 0, plan.minimum);
        syncControls();
        renderPlans();
        renderCalculator();
      });
    });
  }

  function calculateProjection(plan) {
    const principal = Math.max(0, Number(state.amount) || 0);
    const cycles = state.durationDays / Math.max(1, Number(plan.cycleDays) || 30);
    const projected = state.mode === 'compound'
      ? principal * Math.pow(1 + (Number(plan.returnRate) || 0), cycles)
      : principal + principal * (Number(plan.returnRate) || 0) * cycles;
    const earnings = Math.max(0, projected - principal);
    const dailyAverage = state.durationDays > 0 ? earnings / state.durationDays : 0;
    const meetsMinimum = principal >= plan.minimum;

    const checkpoints = [30, 60, 90, 180, state.durationDays]
      .filter((value, index, values) => value <= state.durationDays && values.indexOf(value) === index)
      .sort((a, b) => a - b)
      .map((day) => {
        const checkpointCycles = day / Math.max(1, Number(plan.cycleDays) || 30);
        const checkpointValue = state.mode === 'compound'
          ? principal * Math.pow(1 + (Number(plan.returnRate) || 0), checkpointCycles)
          : principal + principal * (Number(plan.returnRate) || 0) * checkpointCycles;
        return {
          day,
          value: checkpointValue,
          earnings: Math.max(0, checkpointValue - principal)
        };
      });

    return { projected, earnings, dailyAverage, meetsMinimum, shortfall: Math.max(0, plan.minimum - principal), checkpoints };
  }

  function syncControls() {
    const plan = getPlan(state.selectedPlanKey);
    document.getElementById('plans-calculator-plan').value = plan.key;
    document.getElementById('plans-calculator-amount').value = String(Math.max(plan.minimum, Number(state.amount) || plan.minimum));
    document.getElementById('plans-calculator-duration').value = String(state.durationDays);
    document.querySelectorAll('[data-mode]').forEach((button) => {
      const active = String(button.getAttribute('data-mode') || '') === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    const presets = [plan.minimum, plan.minimum * 2, plan.minimum * 5, plan.minimum * 10];
    const presetShell = document.getElementById('plans-amount-presets');
    presetShell.innerHTML = presets.map((value) => `
      <button type="button" class="plans-chip-button rounded-full border border-[#28c0c3]/15 bg-[#e9f8f7] px-3 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-700 ${Number(value) === Number(state.amount) ? 'is-active' : ''}" data-preset="${value}">${formatCurrency(value)}</button>
    `).join('');
    presetShell.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        state.amount = Number(button.getAttribute('data-preset')) || plan.minimum;
        syncControls();
        renderCalculator();
      });
    });
  }

  function renderCalculator() {
    const plan = getPlan(state.selectedPlanKey);
    const result = calculateProjection(plan);
    document.getElementById('plans-projected-value').textContent = formatCurrency(result.projected);
    document.getElementById('plans-projected-earnings').textContent = formatCurrency(result.earnings);
    document.getElementById('plans-daily-average').textContent = formatCurrency(result.dailyAverage);
    document.getElementById('plans-required-minimum').textContent = formatCurrency(plan.minimum);

    const status = document.getElementById('plans-calculator-status');
    status.textContent = result.meetsMinimum ? 'Minimum cleared' : 'Below minimum';
    status.className = `inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${result.meetsMinimum ? 'border-[#28c0c3]/20 bg-[#28c0c3]/10 text-[#0f6f7a]' : 'border-amber-300/60 bg-amber-50 text-amber-700'}`;

    document.getElementById('plans-calculator-note').textContent = result.meetsMinimum
      ? `${plan.name} minimum cleared. Projection is based on ${state.mode === 'compound' ? 'compound growth' : 'fixed monthly return'} over ${state.durationDays} days.`
      : `Add ${formatCurrency(result.shortfall)} to meet the ${plan.name} minimum before funding.`;

    document.getElementById('plans-breakdown').innerHTML = result.checkpoints.map((checkpoint) => `
      <div class="plans-breakdown-row rounded-2xl border border-[#28c0c3]/10 bg-[#f7fcfc] px-4 py-3">
        <div>
          <span class="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Day ${checkpoint.day}</span>
          <strong class="block text-base font-extrabold tracking-[-0.03em] text-slate-900">${formatCurrency(checkpoint.value)}</strong>
        </div>
        <div>
          <span class="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Earnings</span>
          <strong class="block text-base font-extrabold tracking-[-0.03em] text-slate-900">${formatCurrency(checkpoint.earnings)}</strong>
        </div>
      </div>
    `).join('');

    const action = document.getElementById('plans-calculator-cta');
    action.innerHTML = `<i data-lucide="wallet" class="mr-2 inline-block h-4 w-4"></i>${isAuthenticated() ? 'Fund Selected Plan' : 'Continue With This Plan'}`;
    action.onclick = () => handlePlanContinue(plan);
    renderIcons();
  }

  async function loadCatalog() {
    const stateLabel = document.getElementById('plans-catalog-state');
    try {
      const response = await fetch(`${resolveApiUrl()}/dashboard/public-plans`, { headers: { Accept: 'application/json' } });
      const result = await response.json();
      if (!response.ok || !result || !Array.isArray(result.plans) || !result.plans.length) {
        throw new Error('Plan catalog unavailable.');
      }

      state.plans = result.plans;
      state.featuredPlanKey = String(result.featuredPlanKey || 'growth').trim().toLowerCase() || 'growth';
      stateLabel.textContent = 'Live API catalog';
      return;
    } catch {
      state.plans = fallbackCatalog.plans.slice();
      state.featuredPlanKey = fallbackCatalog.featuredPlanKey;
      stateLabel.textContent = 'Fallback catalog';
    }
  }

  function bindControls() {
    document.getElementById('plans-calculator-plan').addEventListener('change', (event) => {
      state.selectedPlanKey = String(event.target.value || 'growth').trim().toLowerCase();
      const plan = getPlan(state.selectedPlanKey);
      state.amount = Math.max(Number(state.amount) || 0, plan.minimum);
      syncControls();
      renderPlans();
      renderCalculator();
    });

    document.getElementById('plans-calculator-amount').addEventListener('input', (event) => {
      state.amount = Math.max(0, Number(event.target.value) || 0);
      renderCalculator();
      syncControls();
    });

    document.getElementById('plans-calculator-duration').addEventListener('change', (event) => {
      state.durationDays = Number(event.target.value) || 30;
      renderCalculator();
    });

    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = String(button.getAttribute('data-mode') || 'simple').trim();
        syncControls();
        renderCalculator();
      });
    });

    document.getElementById('plans-hero-compare').addEventListener('click', (event) => {
      event.preventDefault();
      document.getElementById('plans-grid-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function init() {
    await loadCatalog();
    let storedKey = '';
    try {
      storedKey = String(window.localStorage.getItem(DASHBOARD_PLAN_KEY) || '').trim().toLowerCase();
    } catch {}
    state.selectedPlanKey = state.plans.some((plan) => plan.key === storedKey) ? storedKey : state.featuredPlanKey;
    state.amount = Math.max(getPlan(state.selectedPlanKey).minimum, state.amount);

    updateHero();
    document.getElementById('plans-calculator-plan').innerHTML = state.plans.map((plan) => `
      <option value="${plan.key}">${plan.name} • Min ${formatCurrency(plan.minimum)}</option>
    `).join('');
    syncControls();
    renderPlans();
    renderCalculator();
    bindControls();
    renderIcons();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
