/**
 * Zero-dependency interactive SVG charts and financial timeline calculators
 * for HearthLedger.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatCurrency(value, decimals = 0) {
  const num = Number(value) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return (
    sign +
    '$' +
    abs.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/**
 * Forecasts exact target/payoff month from November 2026 baseline.
 */
export function forecastGoalTimeline(goal, monthlyContribution) {
  const remaining = Math.max(0, (goal.target || 0) - (goal.current || 0));
  if (remaining <= 0) {
    return {
      months: 0,
      label: 'Funded',
      dateLabel: 'Reached now',
      impossible: false,
      interestTotal: 0,
    };
  }

  const contrib = Number(monthlyContribution) || 0;
  if (contrib <= 0) {
    return {
      months: Infinity,
      label: 'Paused',
      dateLabel: 'Set a monthly amount',
      impossible: true,
      interestTotal: 0,
    };
  }

  const monthlyRate = (Number(goal.apr) || 0) / 100 / 12;
  let balance = remaining;
  let months = 0;
  let interestTotal = 0;

  if (goal.type === 'debt') {
    if (monthlyRate > 0 && contrib <= balance * monthlyRate) {
      return {
        months: Infinity,
        label: 'Below interest',
        dateLabel: `Needs > ${formatCurrency(balance * monthlyRate + 1)}/mo`,
        impossible: true,
        interestTotal: 0,
      };
    }
    while (balance > 0.01 && months < 480) {
      const interest = balance * monthlyRate;
      interestTotal += interest;
      balance = balance + interest - contrib;
      months += 1;
    }
  } else {
    // Savings goal: remaining decreases by monthlyContribution + interest earned on current balance
    let saved = Number(goal.current) || 0;
    const target = Number(goal.target) || 0;
    while (saved < target - 0.01 && months < 480) {
      const interest = saved * monthlyRate;
      interestTotal += interest;
      saved = saved + interest + contrib;
      months += 1;
    }
  }

  // Base month: November 2026 (year=2026, monthIndex=10)
  const targetIdx = 10 + months;
  const targetYear = 2026 + Math.floor(targetIdx / 12);
  const targetMonth = MONTH_NAMES[targetIdx % 12];

  return {
    months,
    label: `${months} mo${months === 1 ? '' : 's'}`,
    dateLabel: `${targetMonth} ${targetYear}`,
    impossible: false,
    interestTotal: Math.round(interestTotal),
  };
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeDonutArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, endAngle);
  const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
  const p3 = polarToCartesian(cx, cy, rInner, startAngle);
  const p4 = polarToCartesian(cx, cy, rInner, endAngle);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/**
 * Renders an interactive Category Allocation Donut SVG into containerEl.
 */
export function renderDonutChart(containerEl, slices, activeCategoryId, onSelectCategory) {
  const total = slices.reduce((sum, s) => sum + s.spent, 0);
  const nonZero = slices.filter((s) => s.spent > 0);
  const activeSlice = nonZero.find((s) => s.id === activeCategoryId) || null;

  const size = 240;
  const cx = 120;
  const cy = 120;
  const rOuter = 100;
  const rInner = 64;

  let pathsHtml = '';
  if (total <= 0 || nonZero.length === 0) {
    pathsHtml = `<circle cx="${cx}" cy="${cy}" r="${(rOuter + rInner) / 2}" fill="none" stroke="#E4DDD1" stroke-width="${rOuter - rInner}" />`;
  } else if (nonZero.length === 1) {
    const s = nonZero[0];
    const isSelected = activeCategoryId === s.id;
    pathsHtml = `
      <circle
        class="donut-slice ${isSelected ? 'is-active' : ''}"
        data-cat-id="${s.id}"
        cx="${cx}" cy="${cy}"
        r="${(rOuter + rInner) / 2}"
        fill="none"
        stroke="${s.color}"
        stroke-width="${isSelected ? rOuter - rInner + 6 : rOuter - rInner}"
      />`;
  } else {
    let cursor = 0;
    const gapDeg = 1.6;
    for (const s of nonZero) {
      const span = (s.spent / total) * 360;
      const start = cursor + gapDeg / 2;
      const end = cursor + Math.max(span - gapDeg / 2, gapDeg + 0.5);
      const isSelected = activeCategoryId === s.id;
      const outer = isSelected ? rOuter + 5 : rOuter;
      const inner = isSelected ? rInner - 2 : rInner;
      const d = describeDonutArc(cx, cy, outer, inner, start, end);
      const opacity = activeCategoryId && !isSelected ? '0.45' : '1';
      pathsHtml += `
        <path
          class="donut-slice ${isSelected ? 'is-active' : ''}"
          data-cat-id="${s.id}"
          d="${d}"
          fill="${s.color}"
          opacity="${opacity}"
        >
          <title>${s.name}: ${formatCurrency(s.spent)} (${((s.spent / total) * 100).toFixed(1)}%)</title>
        </path>`;
      cursor += span;
    }
  }

  const centerKicker = activeSlice ? activeSlice.name : 'Actual Spend';
  const centerValue = activeSlice ? formatCurrency(activeSlice.spent) : formatCurrency(total);
  const centerSub = activeSlice
    ? `${((activeSlice.spent / Math.max(total, 1)) * 100).toFixed(1)}% of total`
    : `${nonZero.length} active categories`;

  containerEl.innerHTML = `
    <div class="donut-stage">
      <svg class="donut-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Category spending allocation donut chart">
        ${pathsHtml}
      </svg>
      <div class="donut-center">
        <span class="donut-center-kicker">${escapeHtml(centerKicker)}</span>
        <strong class="donut-center-value">${centerValue}</strong>
        <span class="donut-center-sub">${escapeHtml(centerSub)}</span>
      </div>
    </div>
  `;

  containerEl.querySelectorAll('.donut-slice').forEach((el) => {
    const catId = el.getAttribute('data-cat-id');
    el.addEventListener('mouseenter', () => onSelectCategory(catId, false));
    el.addEventListener('click', () => onSelectCategory(catId, true));
  });

  const svgEl = containerEl.querySelector('.donut-svg');
  if (svgEl) {
    svgEl.addEventListener('mouseleave', () => onSelectCategory(null, false));
  }
}

/**
 * Renders the 6-Month Cashflow & Net Savings Bar + Line SVG chart.
 */
export function renderCashflowChart(containerEl, history6m, activeIndex, onHoverMonth) {
  const width = 560;
  const height = 246;
  const padLeft = 48;
  const padRight = 18;
  const padTop = 22;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    1000,
    ...history6m.map((m) => Math.max(m.income, m.expenses))
  );
  const yCeiling = Math.ceil(maxVal / 1000) * 1000;

  const yOf = (val) => padTop + plotH - (Math.max(0, val) / yCeiling) * plotH;

  // 4 horizontal gridlines
  let gridHtml = '';
  for (let i = 0; i <= 4; i++) {
    const val = (yCeiling / 4) * i;
    const y = yOf(val);
    gridHtml += `
      <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="#EAE3D7" stroke-dasharray="${i === 0 ? 'none' : '3 3'}" />
      <text x="${padLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="svg-axis-label">$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k</text>
    `;
  }

  const slotW = plotW / Math.max(history6m.length, 1);
  const barW = Math.min(20, slotW * 0.28);
  let barsHtml = '';
  const linePoints = [];

  history6m.forEach((m, idx) => {
    const cx = padLeft + slotW * (idx + 0.5);
    const incY = yOf(m.income);
    const expY = yOf(m.expenses);
    const baseY = yOf(0);
    const savings = m.income - m.expenses;
    const savY = yOf(Math.max(0, savings));
    linePoints.push({ x: cx, y: savY, month: m.month, savings, income: m.income, expenses: m.expenses });

    const isFocused = activeIndex === idx;
    barsHtml += `
      <g class="cashflow-col ${isFocused ? 'is-focused' : ''}" data-month-idx="${idx}">
        <rect
          x="${(cx - slotW * 0.44).toFixed(1)}"
          y="${padTop - 6}"
          width="${(slotW * 0.88).toFixed(1)}"
          height="${plotH + 12}"
          rx="8"
          fill="${isFocused ? 'rgba(31, 94, 75, 0.06)' : 'transparent'}"
        />
        <rect
          x="${(cx - barW - 2).toFixed(1)}"
          y="${incY.toFixed(1)}"
          width="${barW.toFixed(1)}"
          height="${Math.max(2, baseY - incY).toFixed(1)}"
          rx="4"
          fill="#1F5E4B"
          opacity="${isFocused ? '1' : '0.88'}"
        />
        <rect
          x="${(cx + 2).toFixed(1)}"
          y="${expY.toFixed(1)}"
          width="${barW.toFixed(1)}"
          height="${Math.max(2, baseY - expY).toFixed(1)}"
          rx="4"
          fill="#C85A32"
          opacity="${isFocused ? '1' : '0.82'}"
        />
        <text x="${cx.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="svg-axis-month ${isFocused ? 'is-focused' : ''}">${escapeHtml(m.month)}</text>
      </g>
    `;
  });

  const polylineStr = linePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dotsHtml = linePoints
    .map((p, idx) => {
      const isFocused = activeIndex === idx;
      return `
        <circle
          cx="${p.x.toFixed(1)}"
          cy="${p.y.toFixed(1)}"
          r="${isFocused ? 5.5 : 4}"
          fill="#FFFFFF"
          stroke="#C48A28"
          stroke-width="${isFocused ? 3 : 2.5}"
          pointer-events="none"
        />
      `;
    })
    .join('');

  const focusPoint = linePoints[activeIndex ?? linePoints.length - 1] || linePoints[0];
  const focusRate = focusPoint && focusPoint.income > 0
    ? ((focusPoint.savings / focusPoint.income) * 100).toFixed(1)
    : '0.0';

  containerEl.innerHTML = `
    <div class="cashflow-readout">
      <div class="cashflow-readout-month">${escapeHtml(focusPoint.month)} 2026 Snapshot</div>
      <div class="cashflow-readout-metrics">
        <span><i class="dot dot-income"></i>Income <strong>${formatCurrency(focusPoint.income)}</strong></span>
        <span><i class="dot dot-expense"></i>Spend <strong>${formatCurrency(focusPoint.expenses)}</strong></span>
        <span><i class="dot dot-savings"></i>Net Saved <strong>${formatCurrency(focusPoint.savings)} (${focusRate}%)</strong></span>
      </div>
    </div>
    <svg class="cashflow-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="6 month income, expenses, and net savings chart">
      ${gridHtml}
      ${barsHtml}
      <polyline
        fill="none"
        stroke="#C48A28"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        points="${polylineStr}"
        pointer-events="none"
      />
      ${dotsHtml}
    </svg>
  `;

  containerEl.querySelectorAll('.cashflow-col').forEach((col) => {
    const idx = Number(col.getAttribute('data-month-idx'));
    col.addEventListener('mouseenter', () => onHoverMonth(idx));
    col.addEventListener('click', () => onHoverMonth(idx));
  });
}

/**
 * Renders an inline SVG circular progress gauge for a savings or debt goal.
 */
export function renderGoalRingSvg(percent, color) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 24;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;
  return `
    <svg class="goal-ring-svg" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="#EAE3D7" stroke-width="6" />
      <circle
        cx="32" cy="32" r="${r}"
        fill="none"
        stroke="${color}"
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" text-anchor="middle" class="goal-ring-text">${Math.round(clamped)}%</text>
    </svg>
  `;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
