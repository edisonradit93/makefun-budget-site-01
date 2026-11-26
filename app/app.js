import { BUCKET_META, COLOR_PALETTE, STORAGE_KEY, createScenarioData } from './data.js';
import {
  escapeHtml,
  forecastGoalTimeline,
  formatCurrency,
  renderCashflowChart,
  renderDonutChart,
  renderGoalRingSvg,
} from './charts.js';

const VALID_VIEWS = new Set(['overview', 'transactions', 'goals']);

const appState = {
  view: 'overview',
  scenarioId: 'young-family',
  data: null,
  activeCategoryId: null,
  pinnedCategoryId: null,
  activeHistoryIndex: 5,
  filters: {
    search: '',
    category: 'all',
    bucket: 'all',
    type: 'all',
    sort: 'date-desc',
  },
  selectedSwatch: COLOR_PALETTE[0],
};

function loadInitialState() {
  const params = new URLSearchParams(window.location.search);
  const queryView = params.get('view');
  if (queryView && VALID_VIEWS.has(queryView)) {
    appState.view = queryView;
  }

  const queryScenario = params.get('scenario');
  let saved = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      saved = JSON.parse(raw);
    }
  } catch {
    saved = null;
  }

  if (queryScenario) {
    appState.scenarioId = queryScenario;
    appState.data = createScenarioData(queryScenario);
    persistState();
  } else if (saved && saved.data && saved.scenarioId) {
    appState.scenarioId = saved.scenarioId;
    appState.data = saved.data;
  } else {
    appState.scenarioId = 'young-family';
    appState.data = createScenarioData('young-family');
    persistState();
  }
}

function persistState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scenarioId: appState.scenarioId,
        data: appState.data,
      })
    );
  } catch {
    // Ignore storage quota errors in restricted contexts
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2400);
}

function computeBudgetMetrics() {
  const data = appState.data;
  const catSpend = new Map();
  for (const cat of data.categories) {
    catSpend.set(cat.id, 0);
  }

  let txIncome = 0;
  let actualSpend = 0;
  for (const tx of data.transactions) {
    if (tx.type === 'income') {
      txIncome += Number(tx.amount) || 0;
    } else {
      const amt = Number(tx.amount) || 0;
      actualSpend += amt;
      if (tx.categoryId && catSpend.has(tx.categoryId)) {
        catSpend.set(tx.categoryId, catSpend.get(tx.categoryId) + amt);
      }
    }
  }

  const netIncome = Number(data.monthlyIncome) || 0;
  const totalPlanned = data.categories.reduce((sum, c) => sum + (Number(c.limit) || 0), 0);
  const surplus = netIncome - actualSpend;
  const savingsRate = netIncome > 0 ? (surplus / netIncome) * 100 : 0;

  // Essential monthly burn (needs categories) for emergency runway calculation
  const essentialBurn = data.categories
    .filter((c) => c.bucket === 'needs')
    .reduce((sum, c) => sum + Math.max(catSpend.get(c.id) || 0, Number(c.limit) || 0), 0);

  const emergencyGoal = data.goals.find((g) => g.id.includes('emergency') || g.id.includes('efund'));
  const liquidReserve = emergencyGoal ? emergencyGoal.current : data.emergencyReserveBase || 0;
  const runwayMonths = essentialBurn > 0 ? liquidReserve / essentialBurn : 0;

  const buckets = {
    needs: { planned: 0, actual: 0 },
    wants: { planned: 0, actual: 0 },
    savings: { planned: 0, actual: 0 },
  };

  for (const cat of data.categories) {
    const b = buckets[cat.bucket] || buckets.needs;
    b.planned += Number(cat.limit) || 0;
    b.actual += catSpend.get(cat.id) || 0;
  }

  return {
    netIncome,
    txIncome,
    totalPlanned,
    actualSpend,
    surplus,
    savingsRate,
    essentialBurn,
    liquidReserve,
    runwayMonths,
    catSpend,
    buckets,
  };
}

function renderHeader() {
  const data = appState.data;
  document.getElementById('household-name').textContent = data.householdName;
  document.getElementById('household-subtitle').textContent = data.subtitle;
  document.getElementById('month-badge').textContent = data.monthLabel;

  document.querySelectorAll('#scenario-pills .scenario-pill').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.scenario === appState.scenarioId);
  });

  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.view === appState.view);
  });

  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== appState.view;
  });

  const incomeInput = document.getElementById('income-input');
  if (incomeInput && document.activeElement !== incomeInput) {
    incomeInput.value = String(data.monthlyIncome);
  }
}

function renderKpiStrip(metrics) {
  const container = document.getElementById('kpi-strip');
  const spendPct = metrics.totalPlanned > 0 ? (metrics.actualSpend / metrics.totalPlanned) * 100 : 0;
  const surplusClass = metrics.surplus >= 0 ? 'is-positive' : 'is-warning';
  const actualClass = metrics.actualSpend > metrics.totalPlanned ? 'is-warning' : '';

  container.innerHTML = `
    <div class="kpi-card">
      <span class="kpi-label">Net Monthly Income</span>
      <strong class="kpi-value">${formatCurrency(metrics.netIncome)}</strong>
      <span class="kpi-sub">${formatCurrency(metrics.txIncome)} logged payroll</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Total Planned</span>
      <strong class="kpi-value">${formatCurrency(metrics.totalPlanned)}</strong>
      <span class="kpi-sub">${appState.data.categories.length} active envelopes</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Actual Spend</span>
      <strong class="kpi-value ${actualClass}">${formatCurrency(metrics.actualSpend)}</strong>
      <span class="kpi-sub">${spendPct.toFixed(0)}% of planned budget</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Monthly Surplus</span>
      <strong class="kpi-value ${surplusClass}">${formatCurrency(metrics.surplus)}</strong>
      <span class="kpi-sub">${metrics.savingsRate.toFixed(1)}% cashflow margin</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-label">Emergency Runway</span>
      <strong class="kpi-value">${metrics.runwayMonths.toFixed(1)} mos</strong>
      <span class="kpi-sub">${formatCurrency(metrics.liquidReserve)} liquid reserve</span>
    </div>
  `;
}

function renderAllocationBars(metrics) {
  const container = document.getElementById('allocation-bars');
  const income = Math.max(metrics.netIncome, 1);

  const segs = ['needs', 'wants', 'savings'].map((key) => {
    const actual = metrics.buckets[key].actual;
    const pct = Math.min(100, (actual / income) * 100);
    return `<div class="allocation-stack-seg" style="width:${pct.toFixed(1)}%; background:${BUCKET_META[key].color};" title="${BUCKET_META[key].label}: ${pct.toFixed(1)}%"></div>`;
  });

  const rows = ['needs', 'wants', 'savings'].map((key) => {
    const meta = BUCKET_META[key];
    const actual = metrics.buckets[key].actual;
    const planned = metrics.buckets[key].planned;
    const actualPct = (actual / income) * 100;
    const plannedPct = (planned / income) * 100;
    const diff = actualPct - meta.targetPct;
    const isSavings = key === 'savings';
    const isHealthy = isSavings ? actualPct >= meta.targetPct - 2 : actualPct <= meta.targetPct + 2;
    const deltaText =
      diff === 0
        ? 'On target'
        : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs ${meta.targetPct}%`;

    return `
      <div class="bucket-row">
        <div class="bucket-row-top">
          <div class="bucket-label-wrap">
            <span class="bucket-dot" style="background:${meta.color};"></span>
            <span>${meta.label}</span>
          </div>
          <span class="bucket-delta ${isHealthy ? 'is-ok' : 'is-over'}">${deltaText}</span>
        </div>
        <div class="bucket-bar-track">
          <div class="bucket-bar-fill" style="width:${Math.min(100, actualPct).toFixed(1)}%; background:${meta.color};"></div>
          <div class="bucket-target-marker" style="left:${meta.targetPct}%;" title="Target: ${meta.targetPct}%"></div>
        </div>
        <div class="bucket-sub">
          <span>Actual: <strong>${formatCurrency(actual)}</strong> (${actualPct.toFixed(1)}%)</span>
          <span>Planned: ${formatCurrency(planned)} (${plannedPct.toFixed(1)}%) · Target ${meta.targetPct}%</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="allocation-stack" aria-label="50 30 20 allocation breakdown">${segs.join('')}</div>
    <div class="bucket-rows">${rows.join('')}</div>
  `;
}

function renderCashflowSection(metrics) {
  const history = appState.data.history6m.map((item, idx, arr) =>
    idx === arr.length - 1
      ? { ...item, income: metrics.netIncome, expenses: Math.round(metrics.actualSpend) }
      : item
  );

  renderCashflowChart(
    document.getElementById('cashflow-chart'),
    history,
    appState.activeHistoryIndex,
    (idx) => {
      appState.activeHistoryIndex = idx;
      renderCashflowSection(computeBudgetMetrics());
    }
  );
}

function renderDonutSection(metrics) {
  const slices = appState.data.categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      spent: metrics.catSpend.get(c.id) || 0,
    }))
    .sort((a, b) => b.spent - a.spent);

  const activeCat = appState.pinnedCategoryId || appState.activeCategoryId;

  const handleDonutSelect = (catId, togglePin) => {
    if (togglePin) {
      appState.pinnedCategoryId = appState.pinnedCategoryId === catId ? null : catId;
      renderDonutSection(metrics);
      renderEnvelopes(metrics);
    } else {
      appState.activeCategoryId = catId;
      renderDonutSection(metrics);
    }
  };

  renderDonutChart(document.getElementById('donut-chart'), slices, activeCat, handleDonutSelect);

  const totalSpend = Math.max(metrics.actualSpend, 1);
  const legendEl = document.getElementById('donut-legend');
  legendEl.innerHTML = slices
    .map((s) => {
      const pct = ((s.spent / totalSpend) * 100).toFixed(1);
      const isActive = activeCat === s.id;
      return `
        <button type="button" class="donut-legend-item ${isActive ? 'is-active' : ''}" data-legend-cat="${s.id}">
          <span class="donut-legend-left">
            <span class="bucket-dot" style="background:${s.color};"></span>
            <span class="donut-legend-name">${escapeHtml(s.name)}</span>
          </span>
          <span class="donut-legend-right">${formatCurrency(s.spent)} · ${pct}%</span>
        </button>
      `;
    })
    .join('');

  legendEl.querySelectorAll('.donut-legend-item').forEach((btn) => {
    const id = btn.getAttribute('data-legend-cat');
    btn.addEventListener('click', () => handleDonutSelect(id, true));
  });
}

function renderOverviewCharts(metrics) {
  renderCashflowSection(metrics);
  renderDonutSection(metrics);
}

function renderEnvelopes(metrics) {
  const container = document.getElementById('envelopes-list');
  const activeCat = appState.pinnedCategoryId || appState.activeCategoryId;

  container.innerHTML = appState.data.categories
    .map((cat) => {
      const spent = metrics.catSpend.get(cat.id) || 0;
      const limit = Math.max(0, Number(cat.limit) || 0);
      const ratio = limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0;
      const isOver = spent > limit;
      const isNear = !isOver && ratio >= 85;
      const barColor = isOver ? '#C85A32' : isNear ? '#C48A28' : cat.color;
      const maxSlider = Math.max(500, Math.ceil((Math.max(limit, spent) * 1.6) / 50) * 50);
      const diff = limit - spent;

      return `
        <div class="envelope-item ${activeCat === cat.id ? 'is-highlighted' : ''}" data-envelope-id="${cat.id}">
          <div class="envelope-top">
            <div class="envelope-title-wrap">
              <span class="bucket-dot" style="background:${cat.color};"></span>
              <span class="envelope-name">${escapeHtml(cat.name)}</span>
              <span class="bucket-tag">${BUCKET_META[cat.bucket]?.label || cat.bucket}</span>
            </div>
            <div class="envelope-figures">
              <strong class="${isOver ? 'is-over' : ''}">${formatCurrency(spent)}</strong> / ${formatCurrency(limit)}
              · <span>${isOver ? `${formatCurrency(Math.abs(diff))} over` : `${formatCurrency(diff)} left`}</span>
            </div>
          </div>
          <div class="envelope-progress">
            <div class="envelope-progress-fill" style="width:${Math.min(100, ratio).toFixed(1)}%; background:${barColor};"></div>
          </div>
          <div class="envelope-controls">
            <input
              type="range"
              class="envelope-slider"
              min="0"
              max="${maxSlider}"
              step="10"
              value="${limit}"
              data-slider-cat="${cat.id}"
              aria-label="Monthly budget limit for ${escapeHtml(cat.name)}"
            />
            <label class="envelope-limit-label">
              Cap $
              <input
                type="number"
                class="envelope-limit-input"
                min="0"
                step="10"
                value="${limit}"
                data-limit-input="${cat.id}"
                aria-label="Exact monthly cap for ${escapeHtml(cat.name)}"
              />
            </label>
          </div>
        </div>
      `;
    })
    .join('');

  const applyEnvelopeLimit = (catId, nextVal) => {
    const cat = appState.data.categories.find((c) => c.id === catId);
    if (!cat) return;
    cat.limit = Math.max(0, nextVal);
    persistState();
    const m = computeBudgetMetrics();
    renderKpiStrip(m);
    renderAllocationBars(m);
    const sliderEl = container.querySelector(`[data-slider-cat="${catId}"]`);
    const inputEl = container.querySelector(`[data-limit-input="${catId}"]`);
    if (sliderEl && document.activeElement !== sliderEl) {
      if (cat.limit > Number(sliderEl.max)) sliderEl.max = String(cat.limit);
      sliderEl.value = String(cat.limit);
    }
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = String(cat.limit);
    }
    const row = container.querySelector(`[data-envelope-id="${catId}"]`);
    if (row) {
      const spent = m.catSpend.get(catId) || 0;
      const isOver = spent > cat.limit;
      const diff = cat.limit - spent;
      const ratio = cat.limit > 0 ? (spent / cat.limit) * 100 : spent > 0 ? 100 : 0;
      row.querySelector('.envelope-figures').innerHTML = `
        <strong class="${isOver ? 'is-over' : ''}">${formatCurrency(spent)}</strong> / ${formatCurrency(cat.limit)}
        · <span>${isOver ? `${formatCurrency(Math.abs(diff))} over` : `${formatCurrency(diff)} left`}</span>
      `;
      const fill = row.querySelector('.envelope-progress-fill');
      fill.style.width = `${Math.min(100, ratio).toFixed(1)}%`;
      fill.style.background = isOver ? '#C85A32' : ratio >= 85 ? '#C48A28' : cat.color;
    }
  };

  container.querySelectorAll('.envelope-slider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      applyEnvelopeLimit(e.target.getAttribute('data-slider-cat'), Number(e.target.value) || 0);
    });
  });

  container.querySelectorAll('.envelope-limit-input').forEach((input) => {
    input.addEventListener('input', (e) => {
      applyEnvelopeLimit(e.target.getAttribute('data-limit-input'), Number(e.target.value) || 0);
    });
  });
}

function renderTransactionsView(metrics) {
  const catMap = new Map(appState.data.categories.map((c) => [c.id, c]));

  // Sync category filter options
  const filterCatEl = document.getElementById('tx-filter-category');
  const prevVal = appState.filters.category;
  filterCatEl.innerHTML =
    '<option value="all">All Categories</option>' +
    appState.data.categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join('');
  filterCatEl.value = catMap.has(prevVal) ? prevVal : 'all';

  const q = appState.filters.search.trim().toLowerCase();
  let rows = appState.data.transactions.filter((tx) => {
    if (appState.filters.type !== 'all' && tx.type !== appState.filters.type) return false;
    if (appState.filters.category !== 'all' && tx.categoryId !== appState.filters.category) return false;
    if (appState.filters.bucket !== 'all') {
      const txBucket = catMap.get(tx.categoryId)?.bucket || '';
      if (tx.type !== 'expense' || txBucket !== appState.filters.bucket) return false;
    }
    if (q) {
      const catName = catMap.get(tx.categoryId)?.name?.toLowerCase() || '';
      const hay = `${tx.merchant} ${tx.note || ''} ${catName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  rows = rows.slice().sort((a, b) => {
    switch (appState.filters.sort) {
      case 'amount-desc':
        return b.amount - a.amount;
      case 'amount-asc':
        return a.amount - b.amount;
      case 'merchant-asc':
        return a.merchant.localeCompare(b.merchant);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
    }
  });

  const filteredSpend = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const filteredIncome = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);

  document.getElementById('ledger-summary-bar').innerHTML = `
    <span>Showing <strong>${rows.length}</strong> of ${appState.data.transactions.length} entries</span>
    <span>Filtered Outflow: <strong>${formatCurrency(filteredSpend, 2)}</strong> · Inflow: <strong>${formatCurrency(filteredIncome, 2)}</strong></span>
  `;

  const ledgerEl = document.getElementById('ledger-list');
  if (rows.length === 0) {
    ledgerEl.innerHTML = `<div class="empty-state">No transactions match the current filter. Try clearing search or logging a new entry.</div>`;
  } else {
    ledgerEl.innerHTML = `
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant &amp; Memo</th>
            <th>Category</th>
            <th style="text-align:right;">Amount</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((tx) => {
              const cat = catMap.get(tx.categoryId);
              const catBadge =
                tx.type === 'income'
                  ? `<span class="tx-cat-pill"><span class="bucket-dot" style="background:#1F5E4B;"></span>Income</span>`
                  : `<span class="tx-cat-pill"><span class="bucket-dot" style="background:${cat?.color || '#76807A'};"></span>${escapeHtml(cat?.name || 'Uncategorized')}</span>`;

              return `
                <tr>
                  <td class="num">${escapeHtml(tx.date)}</td>
                  <td>
                    <div class="tx-merchant">${escapeHtml(tx.merchant)}</div>
                    ${tx.note ? `<div class="tx-note">${escapeHtml(tx.note)}</div>` : ''}
                  </td>
                  <td>${catBadge}</td>
                  <td class="tx-amount ${tx.type === 'income' ? 'is-income' : ''}">
                    ${tx.type === 'income' ? '+' : '-'}${formatCurrency(tx.amount, 2)}
                  </td>
                  <td>
                    <div class="tx-actions">
                      <button type="button" class="btn btn-ghost btn-xs" data-edit-tx="${tx.id}">Edit</button>
                      <button type="button" class="btn btn-danger-ghost" data-delete-tx="${tx.id}">Delete</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  ledgerEl.querySelectorAll('[data-edit-tx]').forEach((btn) => {
    btn.addEventListener('click', () => openTxModal(btn.getAttribute('data-edit-tx')));
  });

  ledgerEl.querySelectorAll('[data-delete-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-tx');
      const target = appState.data.transactions.find((t) => t.id === id);
      if (target && target.type === 'income') {
        appState.data.monthlyIncome = Math.max(0, (Number(appState.data.monthlyIncome) || 0) - (Number(target.amount) || 0));
      }
      appState.data.transactions = appState.data.transactions.filter((t) => t.id !== id);
      persistState();
      renderAll();
      showToast('Transaction deleted');
    });
  });

  // Category manager side panel
  const catMgr = document.getElementById('category-manager-list');
  catMgr.innerHTML = appState.data.categories
    .map((cat) => {
      const spent = metrics.catSpend.get(cat.id) || 0;
      return `
        <div class="cat-manage-row">
          <div class="cat-manage-info">
            <span class="bucket-dot" style="background:${cat.color};"></span>
            <div style="min-width:0;">
              <div class="cat-manage-name">${escapeHtml(cat.name)}</div>
              <div class="cat-manage-meta">${BUCKET_META[cat.bucket]?.label} · ${formatCurrency(spent)} / ${formatCurrency(cat.limit)}</div>
            </div>
          </div>
          <div class="tx-actions">
            <button type="button" class="btn btn-ghost btn-xs" data-edit-cat="${cat.id}">Edit</button>
            <button type="button" class="btn btn-danger-ghost" data-delete-cat="${cat.id}" ${appState.data.categories.length <= 1 ? 'disabled' : ''}>Remove</button>
          </div>
        </div>
      `;
    })
    .join('');

  catMgr.querySelectorAll('[data-edit-cat]').forEach((btn) => {
    btn.addEventListener('click', () => openCatModal(btn.getAttribute('data-edit-cat')));
  });

  catMgr.querySelectorAll('[data-delete-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (appState.data.categories.length <= 1) return;
      const id = btn.getAttribute('data-delete-cat');
      const fallback = appState.data.categories.find((c) => c.id !== id);
      appState.data.categories = appState.data.categories.filter((c) => c.id !== id);
      appState.data.transactions.forEach((tx) => {
        if (tx.categoryId === id && tx.type === 'expense') {
          tx.categoryId = fallback ? fallback.id : null;
        }
      });
      persistState();
      renderAll();
      showToast('Category removed');
    });
  });
}

function renderGoalsView() {
  const goals = appState.data.goals;
  const totalMonthly = goals.reduce((s, g) => s + (Number(g.monthlyContribution) || 0), 0);
  const totalSavedOrPaid = goals.reduce((s, g) => s + (Number(g.current) || 0), 0);
  const totalTargets = goals.reduce((s, g) => s + (Number(g.target) || 0), 0);

  document.getElementById('goals-summary-pills').innerHTML = `
    <div class="goal-summary-pill">
      <span>Monthly Allocation</span>
      <strong>${formatCurrency(totalMonthly)}/mo</strong>
    </div>
    <div class="goal-summary-pill">
      <span>Combined Progress</span>
      <strong>${formatCurrency(totalSavedOrPaid)} / ${formatCurrency(totalTargets)}</strong>
    </div>
  `;

  const grid = document.getElementById('goals-grid');
  grid.innerHTML = goals
    .map((g) => {
      const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
      const remaining = Math.max(0, g.target - g.current);
      const forecast = forecastGoalTimeline(g, g.monthlyContribution);
      const isDebt = g.type === 'debt';

      return `
        <article class="card goal-card" data-goal-id="${g.id}">
          <div class="goal-top">
            <div>
              <span class="goal-type-badge ${isDebt ? 'is-debt' : 'is-savings'}">
                ${isDebt ? `Debt Payoff · ${g.apr}% APR` : `Savings Reserve · ${g.apr}% APY`}
              </span>
              <h3 class="goal-name">${escapeHtml(g.name)}</h3>
            </div>
            ${renderGoalRingSvg(pct, g.color)}
          </div>

          <p class="goal-note">${escapeHtml(g.note)}</p>

          <div class="goal-figures">
            <span>${isDebt ? 'Paid off' : 'Saved'}: <strong>${formatCurrency(g.current)}</strong></span>
            <span>Remaining: <strong>${formatCurrency(remaining)}</strong></span>
          </div>

          <div class="goal-slider-box">
            <div class="goal-slider-head">
              <span>Monthly Contribution</span>
              <strong data-goal-contrib="${g.id}">${formatCurrency(g.monthlyContribution)}/mo</strong>
            </div>
            <input
              type="range"
              class="goal-slider"
              min="${g.minMonthly}"
              max="${g.maxMonthly}"
              step="25"
              value="${g.monthlyContribution}"
              data-goal-slider="${g.id}"
              aria-label="Monthly contribution for ${escapeHtml(g.name)}"
            />
            <div class="goal-forecast" data-goal-forecast="${g.id}">
              <span>${isDebt ? 'Projected Debt-Free' : 'Projected Target Date'}</span>
              <span class="goal-forecast-date ${forecast.impossible ? 'is-warn' : ''}">
                ${escapeHtml(forecast.dateLabel)} (${escapeHtml(forecast.label)})
              </span>
            </div>
          </div>

          <div class="goal-card-footer">
            <span class="cat-manage-meta">Target: ${formatCurrency(g.target)}</span>
            <button type="button" class="btn btn-secondary btn-xs" data-boost-goal="${g.id}" ${remaining <= 0 ? 'disabled' : ''}>
              + Log ${formatCurrency(Math.min(g.monthlyContribution, remaining))} Boost
            </button>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('.goal-slider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const id = e.target.getAttribute('data-goal-slider');
      const val = Number(e.target.value) || 0;
      const goal = appState.data.goals.find((item) => item.id === id);
      if (!goal) return;
      goal.monthlyContribution = val;
      persistState();

      const contribEl = grid.querySelector(`[data-goal-contrib="${id}"]`);
      if (contribEl) contribEl.textContent = `${formatCurrency(val)}/mo`;

      const forecast = forecastGoalTimeline(goal, val);
      const forecastEl = grid.querySelector(`[data-goal-forecast="${id}"] .goal-forecast-date`);
      if (forecastEl) {
        forecastEl.textContent = `${forecast.dateLabel} (${forecast.label})`;
        forecastEl.classList.toggle('is-warn', forecast.impossible);
      }

      const totalNext = appState.data.goals.reduce((s, g) => s + (Number(g.monthlyContribution) || 0), 0);
      const pill = document.querySelector('#goals-summary-pills .goal-summary-pill strong');
      if (pill) pill.textContent = `${formatCurrency(totalNext)}/mo`;
    });
  });

  grid.querySelectorAll('[data-boost-goal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-boost-goal');
      const goal = appState.data.goals.find((item) => item.id === id);
      if (!goal) return;
      const remaining = Math.max(0, goal.target - goal.current);
      const delta = Math.min(goal.monthlyContribution, remaining);
      if (delta <= 0) return;
      goal.current += delta;
      persistState();
      renderAll();
      showToast(`Applied ${formatCurrency(delta)} toward ${goal.name}`);
    });
  });
}

function renderAll() {
  const metrics = computeBudgetMetrics();
  renderHeader();
  renderKpiStrip(metrics);
  renderAllocationBars(metrics);
  renderOverviewCharts(metrics);
  renderEnvelopes(metrics);
  renderTransactionsView(metrics);
  renderGoalsView();
}

function setView(viewName) {
  if (!VALID_VIEWS.has(viewName)) return;
  appState.view = viewName;
  const url = new URL(window.location.href);
  url.searchParams.set('view', viewName);
  window.history.replaceState({}, '', url);
  renderHeader();
}

function switchScenario(scenarioId) {
  appState.scenarioId = scenarioId;
  appState.data = createScenarioData(scenarioId);
  appState.activeCategoryId = null;
  appState.pinnedCategoryId = null;
  appState.activeHistoryIndex = appState.data.history6m.length - 1;
  persistState();
  renderAll();
  showToast(`Loaded "${appState.data.label}" scenario`);
}

function openTxModal(editId = null) {
  const modal = document.getElementById('tx-modal');
  const form = document.getElementById('tx-form');
  form.reset();

  const catSelect = document.getElementById('tx-category');
  catSelect.innerHTML = appState.data.categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');

  const typeSelect = document.getElementById('tx-type');
  const catField = document.getElementById('tx-category-field');

  if (editId) {
    const tx = appState.data.transactions.find((t) => t.id === editId);
    if (!tx) return;
    document.getElementById('tx-modal-title').textContent = 'Edit Transaction';
    document.getElementById('tx-edit-id').value = tx.id;
    typeSelect.value = tx.type;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-merchant').value = tx.merchant;
    document.getElementById('tx-amount').value = String(tx.amount);
    document.getElementById('tx-note').value = tx.note || '';
    if (tx.categoryId) catSelect.value = tx.categoryId;
    catField.hidden = tx.type === 'income';
  } else {
    document.getElementById('tx-modal-title').textContent = 'Log Transaction';
    document.getElementById('tx-edit-id').value = '';
    typeSelect.value = 'expense';
    document.getElementById('tx-date').value = '2026-11-24';
    catField.hidden = false;
  }

  modal.showModal();
}

function openCatModal(editId = null) {
  const modal = document.getElementById('cat-modal');
  const form = document.getElementById('cat-form');
  form.reset();

  if (editId) {
    const cat = appState.data.categories.find((c) => c.id === editId);
    if (!cat) return;
    document.getElementById('cat-modal-title').textContent = 'Edit Category';
    document.getElementById('cat-edit-id').value = cat.id;
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-bucket').value = cat.bucket;
    document.getElementById('cat-limit').value = String(cat.limit);
    appState.selectedSwatch = cat.color;
  } else {
    document.getElementById('cat-modal-title').textContent = 'New Budget Category';
    document.getElementById('cat-edit-id').value = '';
    document.getElementById('cat-limit').value = '250';
    appState.selectedSwatch = COLOR_PALETTE[appState.data.categories.length % COLOR_PALETTE.length];
  }

  renderSwatchPicker();
  modal.showModal();
}

function renderSwatchPicker() {
  const wrap = document.getElementById('cat-swatch-picker');
  wrap.innerHTML = COLOR_PALETTE.map(
    (hex) => `
      <button
        type="button"
        class="swatch-btn ${appState.selectedSwatch === hex ? 'is-selected' : ''}"
        style="background:${hex};"
        data-swatch="${hex}"
        aria-label="Select color ${hex}"
      ></button>
    `
  ).join('');

  wrap.querySelectorAll('.swatch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedSwatch = btn.getAttribute('data-swatch');
      renderSwatchPicker();
    });
  });
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const catMap = new Map(appState.data.categories.map((c) => [c.id, c.name]));
  const header = ['Date', 'Type', 'Merchant', 'Category', 'Amount', 'Note'];
  const csvEscape = (val) => `"${String(val ?? '').replaceAll('"', '""')}"`;
  const lines = [header.join(',')];

  for (const tx of appState.data.transactions) {
    lines.push(
      [
        csvEscape(tx.date),
        csvEscape(tx.type),
        csvEscape(tx.merchant),
        csvEscape(tx.type === 'income' ? 'Income' : catMap.get(tx.categoryId) || 'Uncategorized'),
        tx.amount.toFixed(2),
        csvEscape(tx.note || ''),
      ].join(',')
    );
  }

  triggerDownload(`hearthledger-${appState.scenarioId}-ledger.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
  showToast('Exported ledger CSV');
}

function exportJson() {
  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      scenarioId: appState.scenarioId,
      ...appState.data,
    },
    null,
    2
  );
  triggerDownload(`hearthledger-${appState.scenarioId}-snapshot.json`, payload, 'application/json');
  showToast('Exported budget snapshot JSON');
}

function wireEvents() {
  document.querySelectorAll('#scenario-pills .scenario-pill').forEach((btn) => {
    btn.addEventListener('click', () => switchScenario(btn.dataset.scenario));
  });

  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
  });

  document.getElementById('btn-reset-sample').addEventListener('click', () => {
    switchScenario(appState.scenarioId);
  });

  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-export-json').addEventListener('click', exportJson);

  document.getElementById('income-input').addEventListener('input', (e) => {
    const val = Math.max(0, Number(e.target.value) || 0);
    appState.data.monthlyIncome = val;
    persistState();
    const m = computeBudgetMetrics();
    renderKpiStrip(m);
    renderAllocationBars(m);
    renderOverviewCharts(m);
  });

  document.getElementById('btn-clear-donut').addEventListener('click', () => {
    appState.pinnedCategoryId = null;
    appState.activeCategoryId = null;
    const m = computeBudgetMetrics();
    renderOverviewCharts(m);
    renderEnvelopes(m);
  });

  document.getElementById('btn-quick-tx').addEventListener('click', () => openTxModal());
  document.getElementById('btn-add-tx').addEventListener('click', () => openTxModal());
  document.getElementById('btn-open-cat-modal').addEventListener('click', () => openCatModal());
  document.getElementById('btn-add-category-side').addEventListener('click', () => openCatModal());
  document.getElementById('btn-add-goal').addEventListener('click', () => {
    document.getElementById('goal-form').reset();
    document.getElementById('goal-modal').showModal();
  });

  document.getElementById('tx-type').addEventListener('change', (e) => {
    document.getElementById('tx-category-field').hidden = e.target.value === 'income';
  });

  document.getElementById('tx-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('tx-edit-id').value;
    const type = document.getElementById('tx-type').value;
    const date = document.getElementById('tx-date').value;
    const merchant = document.getElementById('tx-merchant').value.trim();
    const amount = Number(document.getElementById('tx-amount').value);
    const categoryId = type === 'income' ? null : document.getElementById('tx-category').value;
    const note = document.getElementById('tx-note').value.trim();

    if (!merchant || !(amount > 0)) return;

    if (editId) {
      const idx = appState.data.transactions.findIndex((t) => t.id === editId);
      if (idx !== -1) {
        const prev = appState.data.transactions[idx];
        if (prev.type === 'income') {
          appState.data.monthlyIncome = Math.max(0, (Number(appState.data.monthlyIncome) || 0) - (Number(prev.amount) || 0));
        }
        if (type === 'income') {
          appState.data.monthlyIncome = (Number(appState.data.monthlyIncome) || 0) + amount;
        }
        appState.data.transactions[idx] = { id: editId, date, merchant, categoryId, amount, type, note };
      }
      showToast('Transaction updated');
    } else {
      if (type === 'income') {
        appState.data.monthlyIncome = (Number(appState.data.monthlyIncome) || 0) + amount;
      }
      appState.data.transactions.unshift({
        id: `tx-${Date.now()}`,
        date,
        merchant,
        categoryId,
        amount,
        type,
        note,
      });
      showToast('Transaction logged');
    }

    persistState();
    document.getElementById('tx-modal').close();
    renderAll();
  });

  document.getElementById('goal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('goal-name').value.trim();
    const type = document.getElementById('goal-type').value;
    const apr = Math.max(0, Number(document.getElementById('goal-apr').value) || 0);
    const current = Math.max(0, Number(document.getElementById('goal-current').value) || 0);
    const target = Math.max(current, Number(document.getElementById('goal-target').value) || 0);
    const monthlyContribution = Math.max(25, Number(document.getElementById('goal-monthly').value) || 25);
    const note = document.getElementById('goal-note').value.trim();

    if (!name || target <= 0) return;

    appState.data.goals.push({
      id: `goal-${Date.now()}`,
      name,
      type,
      current,
      target,
      monthlyContribution,
      minMonthly: 25,
      maxMonthly: Math.max(1500, Math.ceil((monthlyContribution * 2.5) / 50) * 50),
      apr,
      color: type === 'debt' ? '#3B5B78' : '#1F5E4B',
      note: note || (type === 'debt' ? 'Custom debt payoff milestone.' : 'Custom household savings target.'),
    });

    persistState();
    document.getElementById('goal-modal').close();
    renderAll();
    showToast(`Added goal "${name}"`);
  });

  document.getElementById('cat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('cat-edit-id').value;
    const name = document.getElementById('cat-name').value.trim();
    const bucket = document.getElementById('cat-bucket').value;
    const limit = Math.max(0, Number(document.getElementById('cat-limit').value) || 0);
    const color = appState.selectedSwatch;

    if (!name) return;

    if (editId) {
      const cat = appState.data.categories.find((c) => c.id === editId);
      if (cat) {
        cat.name = name;
        cat.bucket = bucket;
        cat.limit = limit;
        cat.color = color;
      }
      showToast('Category updated');
    } else {
      appState.data.categories.push({
        id: `cat-${Date.now()}`,
        name,
        bucket,
        limit,
        color,
      });
      showToast('Category added');
    }

    persistState();
    document.getElementById('cat-modal').close();
    renderAll();
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.getAttribute('data-close-modal'));
      if (target) target.close();
    });
  });

  document.getElementById('tx-search').addEventListener('input', (e) => {
    appState.filters.search = e.target.value;
    renderTransactionsView(computeBudgetMetrics());
  });
  document.getElementById('tx-filter-category').addEventListener('change', (e) => {
    appState.filters.category = e.target.value;
    renderTransactionsView(computeBudgetMetrics());
  });
  document.getElementById('tx-filter-bucket').addEventListener('change', (e) => {
    appState.filters.bucket = e.target.value;
    renderTransactionsView(computeBudgetMetrics());
  });
  document.getElementById('tx-filter-type').addEventListener('change', (e) => {
    appState.filters.type = e.target.value;
    renderTransactionsView(computeBudgetMetrics());
  });
  document.getElementById('tx-sort').addEventListener('change', (e) => {
    appState.filters.sort = e.target.value;
    renderTransactionsView(computeBudgetMetrics());
  });
}

loadInitialState();
wireEvents();
renderAll();
