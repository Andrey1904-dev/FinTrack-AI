/* ============================================================================
   charts.js — мини-графики на SVG (замена Chart.js с CDN: работает офлайн,
   без внешних зависимостей и «прыжков» макета)
   ========================================================================== */

/* Цвета графика берём из CSS-переменных, поэтому графики автоматически
   переключаются вместе с темой. */
function chartVars(){
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const v = (name, fallback) => { const x = cs ? (cs.getPropertyValue(name) || '').trim() : ''; return x || fallback; };
  return {
    grid: v('--chart-grid', 'rgba(255,255,255,.07)'),
    text: v('--chart-text', '#8c9cbe'),
    strong: v('--text', '#f3f6ff')
  };
}
function niceMax(v){ const n = Math.max(1, Math.abs(num(v))); const pow = Math.pow(10, Math.floor(Math.log10(n))); const scaled = n / pow; const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10; return step * pow; }

function chartLine(cfg){
  const labels = cfg.labels || [], series = cfg.series || [], h = cfg.height || 240;
  const w = 720, padL = 54, padR = 12, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.data.map(v => num(v)))));
  const x = i => padL + (labels.length <= 1 ? iw / 2 : i * iw / (labels.length - 1));
  const y = v => padT + ih - (num(v) / max) * ih;
  const theme = chartVars();
  let grid = '';
  for (let g = 0; g <= 4; g++){
    const val = max * g / 4, yy = y(val);
    grid += `<line x1="${padL}" x2="${w - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${theme.grid}"/>`
         + `<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="${theme.text}" font-size="10">${val >= 1000 ? (val / 1000).toFixed(val % 1000 ? 1 : 0) + 'к' : val.toFixed(0)}</text>`;
  }
  let body = '';
  series.forEach(s => {
    const pts = s.data.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    const area = `${padL},${padT + ih} ${pts} ${x(labels.length - 1).toFixed(1)},${padT + ih}`;
    body += `<polygon points="${area}" fill="url(#grad-${s.id})" opacity=".9"/>`
         + `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.data.forEach((v, i) => { body += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="${s.color}"><title>${escapeHtml(s.name)} · ${escapeHtml(labels[i])}: ${escapeHtml(money(v))}</title></circle>`; });
  });
  const defs = series.map(s => `<linearGradient id="grad-${s.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".35"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('');
  const xLabels = labels.map((l, i) => `<text x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="${theme.text}" font-size="10">${escapeHtml(l)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="График доходов и расходов"><defs>${defs}</defs>${grid}${body}${xLabels}</svg>`;
}

function chartBars(cfg){
  const items = cfg.items || [], h = cfg.height || 170, color = cfg.color || '#6681ff';
  const w = 720, padL = 54, padR = 12, padT = 10, padB = 24;
  const iw = w - padL - padR, ih = h - padT - padB;
  const max = niceMax(Math.max(1, ...items.map(i => num(i.value))));
  const bw = items.length ? Math.max(2, iw / items.length - 3) : 0;
  const theme = chartVars();
  let grid = '';
  for (let g = 0; g <= 2; g++){
    const val = max * g / 2, yy = padT + ih - (val / max) * ih;
    grid += `<line x1="${padL}" x2="${w - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${theme.grid}"/><text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" fill="${theme.text}" font-size="10">${val >= 1000 ? (val / 1000).toFixed(0) + 'к' : val.toFixed(0)}</text>`;
  }
  const bars = items.map((it, i) => {
    const bh = Math.max(1, num(it.value) / max * ih), xx = padL + i * (iw / Math.max(1, items.length)) + 1.5, yy = padT + ih - bh;
    return `<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${it.color || color}" opacity=".92"><title>${escapeHtml(it.label)}: ${escapeHtml(money(it.value))}</title></rect>`;
  }).join('');
  const step = Math.ceil(items.length / 10);
  const xLabels = items.map((it, i) => i % step ? '' : `<text x="${(padL + i * (iw / Math.max(1, items.length)) + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="${theme.text}" font-size="10">${escapeHtml(it.label)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Расходы по дням">${grid}${bars}${xLabels}</svg>`;
}

const PALETTE = ['#6681ff', '#45d7ff', '#37e0a4', '#ff719f', '#f6c76b', '#9b5cff', '#5ee0c0', '#ff9b6b', '#7dffcf', '#8f9bff'];
function chartDonut(cfg){
  const items = (cfg.items || []).filter(i => num(i.value) > 0), size = cfg.size || 210;
  const total = sumMoney(items, i => i.value);
  const r = size / 2 - 4, cx = size / 2, cy = size / 2, inner = r * 0.62;
  if (!total) return `<div class="empty">Пока нет данных для диаграммы</div>`;
  let angle = -90, arcs = '';
  items.forEach((it, i) => {
    const frac = num(it.value) / total, sweep = frac * 360;
    const a0 = angle * Math.PI / 180, a1 = (angle + sweep) * Math.PI / 180;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = sweep > 180 ? 1 : 0;
    const color = it.color || PALETTE[i % PALETTE.length];
    if (sweep >= 359.9) arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${r - inner}" opacity=".92"/>`;
    else arcs += `<path d="M ${cx + inner * Math.cos(a1)} ${cy + inner * Math.sin(a1)} L ${cx + inner * Math.cos(a0)} ${cy + inner * Math.sin(a0)} A ${inner} ${inner} 0 0 1 ${cx + inner * Math.cos(a1)} ${cy + inner * Math.sin(a1)} Z" fill="none"/>`
      + `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${cx + inner * Math.cos(a1)} ${cy + inner * Math.sin(a1)} A ${inner} ${inner} 0 ${large} 0 ${cx + inner * Math.cos(a0)} ${cy + inner * Math.sin(a0)} Z" fill="${color}" opacity=".92"><title>${escapeHtml(it.label)}: ${escapeHtml(money(it.value))} (${percent(it.value, total)})</title></path>`;
    angle += sweep;
  });
  const theme = chartVars();
  return `<div class="row center" style="justify-content:center">
    <svg class="chart" style="max-width:${size}px" viewBox="0 0 ${size} ${size}" role="img" aria-label="Расходы по категориям">${arcs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="${theme.strong}" font-size="15" font-weight="800">${escapeHtml(moneyShort(total))}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="${theme.text}" font-size="10">${cfg.title || 'расходы'}</text>
    </svg></div>`;
}
function chartLegend(items, total){
  const t = num(total) || sumMoney(items, i => i.value);
  return `<div class="legend">${items.map((it, i) => `<div class="item2"><span class="dot" style="background:${it.color || PALETTE[i % PALETTE.length]}"></span>
    <span class="grow truncate">${escapeHtml(it.label)}</span><b class="mono">${escapeHtml(money(it.value))}</b>
    <span class="muted tiny nowrap">${percent(it.value, t)}</span></div>`).join('')}</div>`;
}
