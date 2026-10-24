// ---------- Data ----------
// Money is stored in pence (whole numbers) so totals never drift from rounding.
// Each item looks like:
// { id, name, description, orderNumber, email, purchaseDate: 'YYYY-MM-DD',
//   purchasePrice, purchasePostage, group: { id, index, size } | null,
//   sale: null | { price, postage, fees, date: 'YYYY-MM-DD' }, createdAt }
let data = { version: 1, items: [] };

const ui = { filter: 'all', search: '' };

const findItem = (id) => data.items.find((item) => item.id === id);

// Apply a change and save it; if saving fails, undo the change.
async function commit(change) {
  const before = JSON.stringify(data);
  change();
  try {
    await window.store.save(data);
    renderDashboard();
    return true;
  } catch {
    data = JSON.parse(before);
    return false;
  }
}

// ---------- Helpers ----------
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const formatMoney = (pence) => gbp.format(pence / 100);
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const formatPercent = (ratio) => percent.format(ratio);
const moneyInputValue = (pence) => (pence ? (pence / 100).toFixed(2) : '');

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDate = (iso) => dateFormat.format(new Date(`${iso}T00:00:00`));

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Accepts "12", "12.5", "£1,250.99". Returns pence, '' for blank, or null if invalid.
function parseMoney(text) {
  const clean = String(text).replace(/[£,\s]/g, '');
  if (clean === '') return '';
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(parseFloat(clean) * 100);
}

// Split a total into n whole-pence parts that add back up exactly.
function splitEvenly(total, n) {
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const itemCost = (item) => item.purchasePrice + item.purchasePostage;

function itemProfit(item) {
  if (!item.sale) return null;
  const { price, postage, fees } = item.sale;
  return price - postage - fees - itemCost(item);
}

const profitClass = (pence) => (pence < 0 ? 'is-loss' : 'is-profit');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Shows field problems: outlines the field in red and displays the first message.
function validator(errorEl) {
  const problems = [];
  return {
    flag(field, message) { field.classList.add('is-invalid'); problems.push(message); },
    failed() {
      errorEl.hidden = !problems.length;
      if (problems.length) errorEl.textContent = problems[0];
      return problems.length > 0;
    },
  };
}

function resetForm(form, errorEl) {
  form.reset();
  form.querySelectorAll('.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
  errorEl.hidden = true;
}

// ---------- Modals ----------
const openModals = [];

function showModal(modal) {
  modal.style.zIndex = 10 + openModals.length; // newest window sits on top
  modal.hidden = false;
  openModals.push(modal);
}

function hideModal(modal) {
  modal.hidden = true;
  const i = openModals.indexOf(modal);
  if (i !== -1) openModals.splice(i, 1);
  if (modal === confirmModal && confirmResolve) { confirmResolve(false); confirmResolve = null; }
}

document.querySelectorAll('.modal-backdrop').forEach((modal) => {
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => hideModal(modal)));
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) hideModal(modal); });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openModals.length) hideModal(openModals[openModals.length - 1]);
});

// "Are you sure?" box. Resolves true if the user confirms.
const confirmModal = document.getElementById('confirm-modal');
let confirmResolve = null;

function confirmAction({ title, text, okLabel }) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  document.getElementById('confirm-ok').textContent = okLabel;
  showModal(confirmModal);
  return new Promise((resolve) => { confirmResolve = resolve; });
}

document.getElementById('confirm-ok').addEventListener('click', () => {
  const resolve = confirmResolve;
  confirmResolve = null;
  hideModal(confirmModal);
  resolve?.(true);
});

// ---------- Navigation ----------
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');

navItems.forEach((button) => {
  button.addEventListener('click', () => {
    navItems.forEach((b) => b.classList.toggle('is-active', b === button));
    views.forEach((v) => { v.hidden = v.id !== `view-${button.dataset.view}`; });
  });
});

// ---------- Dashboard ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const thisYear = () => new Date().getFullYear();
const dash = { year: thisYear(), view: 'chart' };

const setText = (id, text) => { document.getElementById(id).textContent = text; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function setStat(id, pence, colour = true) {
  const node = document.getElementById(id);
  node.textContent = formatMoney(pence);
  node.classList.toggle('is-loss', colour && pence < 0);
}

function renderStats() {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yearPrefix = String(now.getFullYear());

  const sold = data.items.filter((i) => i.sale);
  const unsold = data.items.filter((i) => !i.sale);
  const sum = (items, fn) => items.reduce((total, item) => total + fn(item), 0);

  const totalProfit = sum(sold, itemProfit);
  const soldThisMonth = sold.filter((i) => i.sale.date.startsWith(monthPrefix));
  const soldThisYear = sold.filter((i) => i.sale.date.startsWith(yearPrefix));
  const soldCost = sum(sold, itemCost);

  setStat('stat-total', totalProfit);
  setText('stat-total-note', sold.length ? `All time, from ${plural(sold.length, 'sale')}` : 'All time');

  setStat('stat-month', sum(soldThisMonth, itemProfit));
  setText('stat-month-note', `${MONTHS_LONG[now.getMonth()]} · ${plural(soldThisMonth.length, 'sale')}`);

  setStat('stat-year', sum(soldThisYear, itemProfit));
  setText('stat-year-note', `${yearPrefix} · ${plural(soldThisYear.length, 'sale')}`);

  const roi = document.getElementById('stat-roi');
  roi.textContent = soldCost > 0 ? formatPercent(totalProfit / soldCost) : '—';
  roi.classList.toggle('is-loss', totalProfit < 0);
  setText('stat-roi-note', soldCost > 0 ? `${formatMoney(totalProfit)} profit on ${formatMoney(soldCost)} spent` : 'Across all sold items');

  setText('stat-sold', sold.length.toLocaleString('en-GB'));
  setText('stat-sold-note', `of ${plural(data.items.length, 'item')} bought`);

  const avg = document.getElementById('stat-avg');
  if (sold.length) setStat('stat-avg', Math.round(totalProfit / sold.length));
  else { avg.textContent = '—'; avg.classList.remove('is-loss'); }

  setStat('stat-stock', sum(unsold, itemCost), false);
  setText('stat-stock-note', `${plural(unsold.length, 'item')} waiting to sell`);
}

// Profit and number of sales for each month of a year.
function monthlyTotals(year) {
  const months = MONTHS.map(() => ({ profit: 0, count: 0 }));
  for (const item of data.items) {
    if (!item.sale || !item.sale.date.startsWith(`${year}-`)) continue;
    const m = Number(item.sale.date.slice(5, 7)) - 1;
    months[m].profit += itemProfit(item);
    months[m].count += 1;
  }
  return months;
}

// Years you can flick between: from your first sale up to this year.
function yearRange() {
  const years = data.items.filter((i) => i.sale).map((i) => Number(i.sale.date.slice(0, 4)));
  const latest = Math.max(thisYear(), ...years);
  return { first: years.length ? Math.min(...years) : latest, last: latest };
}

// Round axis steps to friendly amounts like £50, £100, £250.
function niceStep(range, targetTicks) {
  const rough = range / targetTicks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= rough);
  return step * power;
}

function axisMoney(pence) {
  const pounds = pence / 100;
  if (Math.abs(pounds) >= 1000) return `${pounds < 0 ? '−' : ''}£${+(Math.abs(pounds) / 1000).toFixed(1)}K`;
  return `${pounds < 0 ? '−' : ''}£${Math.abs(pounds).toLocaleString('en-GB')}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// A bar with 4px rounded corners on the value end and a square base.
function barPath(x, w, yBase, yEnd) {
  const h = Math.abs(yBase - yEnd);
  const r = Math.min(4, h, w / 2);
  if (yEnd <= yBase) {
    return `M${x},${yBase} V${yEnd + r} Q${x},${yEnd} ${x + r},${yEnd} H${x + w - r} Q${x + w},${yEnd} ${x + w},${yEnd + r} V${yBase} Z`;
  }
  return `M${x},${yBase} V${yEnd - r} Q${x},${yEnd} ${x + r},${yEnd} H${x + w - r} Q${x + w},${yEnd} ${x + w},${yEnd - r} V${yBase} Z`;
}

const chartEl = document.getElementById('chart');
const chartWrap = document.getElementById('chart-wrap');
const chartTip = document.getElementById('chart-tip');

function showTip(month, totals, anchorX, anchorY) {
  const { profit, count } = totals;
  chartTip.replaceChildren(
    el('div', 'chart-tip-title', `${MONTHS_LONG[month]} ${dash.year}`),
    el('div', `chart-tip-value ${profit < 0 ? 'is-loss' : ''}`, formatMoney(profit)),
    el('div', 'chart-tip-note', count ? plural(count, 'item') + ' sold' : 'No sales'),
  );
  chartTip.hidden = false;
  const tipW = chartTip.offsetWidth;
  const left = Math.min(Math.max(anchorX - tipW / 2, 4), chartWrap.clientWidth - tipW - 4);
  chartTip.style.left = `${left}px`;
  chartTip.style.top = `${Math.max(anchorY - chartTip.offsetHeight - 10, 0)}px`;
}

function renderChart() {
  const months = monthlyTotals(dash.year);
  const width = chartWrap.clientWidth;
  if (!width) return;

  const pad = { top: 26, right: 12, bottom: 30, left: 60 };
  const plotH = 260;
  const height = pad.top + plotH + pad.bottom;
  chartEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
  chartEl.setAttribute('height', height);
  chartEl.replaceChildren();

  // Scale: always include £0, round the ends out to friendly steps.
  const values = months.map((m) => m.profit);
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const step = niceStep(hi - lo || 10000, 4);
  const top = Math.ceil(hi / step) * step || step;
  const bottom = Math.floor(lo / step) * step;
  const y = (v) => pad.top + ((top - v) / (top - bottom)) * plotH;

  for (let v = bottom; v <= top + 0.5; v += step) {
    chartEl.append(svg('line', { x1: pad.left, x2: width - pad.right, y1: y(v), y2: y(v), class: v === 0 ? 'chart-zero' : 'chart-grid' }));
    chartEl.append(svg('text', { x: pad.left - 10, y: y(v), class: 'chart-axis', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, axisMoney(v)));
  }

  const band = (width - pad.left - pad.right) / 12;
  const barW = Math.min(24, band * 0.55);
  const best = values.indexOf(Math.max(...values));

  months.forEach((m, i) => {
    const cx = pad.left + band * i + band / 2;
    chartEl.append(svg('text', { x: cx, y: height - 8, class: 'chart-axis', 'text-anchor': 'middle' }, MONTHS[i]));

    const hover = svg('rect', { x: pad.left + band * i, y: pad.top, width: band, height: plotH, class: 'chart-hover', rx: 6 });
    chartEl.append(hover);

    if (m.profit !== 0) {
      chartEl.append(svg('path', { d: barPath(cx - barW / 2, barW, y(0), y(m.profit)), class: m.profit < 0 ? 'chart-bar is-loss' : 'chart-bar' }));
    }
    // Label only the best month, so the chart stays clean.
    if (i === best && m.profit > 0) {
      chartEl.append(svg('text', { x: cx, y: y(m.profit) - 8, class: 'chart-label', 'text-anchor': 'middle' }, formatMoney(m.profit)));
    }

    // Invisible full-height target so hovering anywhere in the month works.
    const hit = svg('rect', { x: pad.left + band * i, y: 0, width: band, height: pad.top + plotH, class: 'chart-hit', tabindex: 0 });
    hit.setAttribute('aria-label', `${MONTHS_LONG[i]}: ${formatMoney(m.profit)}, ${plural(m.count, 'item')} sold`);
    const enter = () => {
      hover.classList.add('is-active');
      showTip(i, m, cx, Math.min(y(m.profit), y(0)));
    };
    const leave = () => { hover.classList.remove('is-active'); chartTip.hidden = true; };
    hit.addEventListener('mouseenter', enter);
    hit.addEventListener('focus', enter);
    hit.addEventListener('mouseleave', leave);
    hit.addEventListener('blur', leave);
    chartEl.append(hit);
  });
}

function renderChartTable() {
  const months = monthlyTotals(dash.year);
  const rows = months.map((m, i) => {
    const tr = el('tr');
    tr.append(el('td', '', MONTHS_LONG[i]), el('td', 'money-cell', String(m.count)));
    tr.append(el('td', `money-cell ${m.count ? profitClass(m.profit) : 'dash'}`, m.count ? formatMoney(m.profit) : '—'));
    return tr;
  });
  const total = months.reduce((t, m) => ({ profit: t.profit + m.profit, count: t.count + m.count }), { profit: 0, count: 0 });
  const totalRow = el('tr', 'chart-table-total');
  totalRow.append(el('td', '', `${dash.year} total`), el('td', 'money-cell', String(total.count)));
  totalRow.append(el('td', `money-cell ${profitClass(total.profit)}`, formatMoney(total.profit)));
  document.getElementById('chart-table-body').replaceChildren(...rows, totalRow);
}

function renderDashboard() {
  renderStats();

  const { first, last } = yearRange();
  dash.year = Math.min(Math.max(dash.year, first), last);
  setText('year-label', dash.year);
  document.getElementById('year-prev').disabled = dash.year <= first;
  document.getElementById('year-next').disabled = dash.year >= last;

  const months = monthlyTotals(dash.year);
  const yearProfit = months.reduce((t, m) => t + m.profit, 0);
  const yearCount = months.reduce((t, m) => t + m.count, 0);
  setText('chart-sub', `${dash.year} total: ${formatMoney(yearProfit)} from ${plural(yearCount, 'sale')}`);

  const anySales = data.items.some((i) => i.sale);
  document.getElementById('chart-empty').hidden = anySales;
  document.getElementById('chart-sub').hidden = !anySales;
  chartWrap.hidden = !anySales || dash.view !== 'chart';
  document.getElementById('chart-table-wrap').hidden = !anySales || dash.view !== 'table';
  chartTip.hidden = true;

  if (anySales && dash.view === 'chart') renderChart();
  if (anySales && dash.view === 'table') renderChartTable();
}

document.getElementById('year-prev').addEventListener('click', () => { dash.year -= 1; renderDashboard(); });
document.getElementById('year-next').addEventListener('click', () => { dash.year += 1; renderDashboard(); });

document.querySelectorAll('[data-chart-view]').forEach((tab) => {
  tab.addEventListener('click', () => {
    dash.view = tab.dataset.chartView;
    document.querySelectorAll('[data-chart-view]').forEach((t) => t.classList.toggle('is-active', t === tab));
    renderDashboard();
  });
});

// Redraw the chart to fit when the window is resized.
new ResizeObserver(() => { if (!chartWrap.hidden) renderChart(); }).observe(chartWrap);

// ---------- Items list ----------
const itemsBody = document.getElementById('items-body');
const itemsEmpty = document.getElementById('items-empty');

function matchesSearch(item, term) {
  if (!term) return true;
  return [item.name, item.description, item.orderNumber, item.email]
    .some((field) => field && field.toLowerCase().includes(term));
}

function visibleItems() {
  const term = ui.search.trim().toLowerCase();
  return data.items
    .filter((item) => ui.filter === 'all' || (ui.filter === 'sold') === Boolean(item.sale))
    .filter((item) => matchesSearch(item, term))
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || b.createdAt - a.createdAt);
}

function textCell(text, className) {
  const td = el('td', className);
  td.append(text ? el('span', 'cell-text', text) : el('span', 'dash', '—'));
  if (text) td.title = text;
  return td;
}

function itemTitle(item) {
  const title = el('div', 'cell-title');
  title.append(el('span', 'cell-text', item.name));
  if (item.group) title.append(el('span', 'badge', `${item.group.index} of ${item.group.size}`));
  return title;
}

function renderItems() {
  const items = visibleItems();
  itemsBody.replaceChildren();

  for (const item of items) {
    const tr = el('tr');
    tr.addEventListener('click', () => openDetails(item.id));

    const nameCell = el('td', 'cell-item');
    nameCell.append(itemTitle(item));
    if (item.description) nameCell.append(el('div', 'cell-sub', item.description));
    nameCell.title = item.description ? `${item.name}\n${item.description}` : item.name;
    tr.append(nameCell);

    tr.append(textCell(item.orderNumber));
    tr.append(textCell(item.email));
    tr.append(textCell(formatDate(item.purchaseDate)));
    tr.append(textCell(formatMoney(itemCost(item)), 'money-cell'));
    tr.append(textCell(item.sale ? formatDate(item.sale.date) : ''));
    tr.append(textCell(item.sale ? formatMoney(item.sale.price) : '', 'money-cell'));

    const profit = itemProfit(item);
    tr.append(textCell(
      profit === null ? '' : formatMoney(profit),
      `money-cell ${profit === null ? '' : profitClass(profit)}`,
    ));

    itemsBody.append(tr);
  }

  itemsEmpty.hidden = items.length > 0;
  if (!items.length) {
    const p = itemsEmpty.querySelector('p');
    if (!data.items.length) {
      p.innerHTML = 'No items yet. Click <strong>Add purchase</strong> to add your first one.';
    } else if (ui.search.trim()) {
      p.textContent = 'No items match your search.';
    } else {
      p.textContent = ui.filter === 'sold' ? 'No sold items yet.' : 'Everything has been sold!';
    }
  }
}

document.getElementById('search').addEventListener('input', (e) => {
  ui.search = e.target.value;
  renderItems();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    ui.filter = tab.dataset.filter;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    renderItems();
  });
});

// ---------- Add / edit / duplicate item ----------
const itemModal = document.getElementById('item-modal');
const itemForm = document.getElementById('item-form');
const fields = itemForm.elements;
const itemSummary = document.getElementById('item-summary');
const itemError = document.getElementById('item-error');
const postageLabel = document.getElementById('postage-label');
const qtyField = document.getElementById('qty-field');

// 'add' (also used by Duplicate) creates new items; 'edit' changes one existing item.
let itemFormMode = { type: 'add' };

function refreshEmailOptions() {
  const emails = [...new Set(data.items.map((i) => i.email).filter(Boolean))].sort();
  document.getElementById('email-options').replaceChildren(
    ...emails.map((email) => { const o = el('option'); o.value = email; return o; }),
  );
}

function openItemForm(mode, source) {
  itemFormMode = mode;
  resetForm(itemForm, itemError);

  const editing = mode.type === 'edit';
  const titles = { add: 'Add purchase', duplicate: 'Duplicate item', edit: 'Edit item' };
  document.getElementById('item-form-title').textContent = titles[mode.type];
  document.getElementById('item-form-submit').textContent = editing ? 'Save changes' : 'Add purchase';
  qtyField.hidden = editing;
  document.getElementById('date-field').classList.toggle('span-2', editing);

  fields.qty.value = 1;
  fields.purchaseDate.value = todayIso();
  if (source) {
    fields.name.value = source.name;
    fields.description.value = source.description;
    fields.orderNumber.value = source.orderNumber;
    fields.email.value = source.email;
    fields.purchaseDate.value = source.purchaseDate;
    fields.price.value = moneyInputValue(source.purchasePrice);
    fields.postage.value = moneyInputValue(source.purchasePostage);
  }

  updateItemSummary();
  refreshEmailOptions();
  showModal(itemModal);
  if (mode.type === 'duplicate') fields.orderNumber.select();
  else fields.name.focus();
}

function readQty() {
  if (itemFormMode.type === 'edit') return 1;
  const qty = Number(fields.qty.value);
  return Number.isInteger(qty) && qty >= 1 && qty <= 50 ? qty : null;
}

// When buying several, explain how the order will be split into separate items.
function updateItemSummary() {
  const qty = readQty();
  const multi = qty && qty > 1;
  postageLabel.innerHTML = multi ? 'Postage for whole order <em>optional</em>' : 'Postage <em>optional</em>';
  if (itemFormMode.type === 'duplicate' && !multi) {
    itemSummary.hidden = false;
    itemSummary.textContent = 'Change anything that\'s different, such as the order number, then add it.';
    return;
  }

  const price = parseMoney(fields.price.value);
  const postage = parseMoney(fields.postage.value);
  if (!multi || price === null || price === '' || postage === null) {
    itemSummary.hidden = !multi;
    itemSummary.textContent = multi ? `This will add ${qty} separate items with the same order details.` : '';
    return;
  }
  itemSummary.hidden = false;
  itemSummary.textContent =
    `This will add ${qty} separate items, each costing ${formatMoney(price)}` +
    (postage ? ` + ${formatMoney(Math.round(postage / qty))} postage.` : '.') +
    ` Order total: ${formatMoney(price * qty + (postage || 0))}.`;
}

itemForm.addEventListener('input', (e) => {
  e.target.classList.remove('is-invalid');
  updateItemSummary();
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const check = validator(itemError);

  const name = fields.name.value.trim();
  const price = parseMoney(fields.price.value);
  const postage = parseMoney(fields.postage.value);
  const qty = readQty();
  const purchaseDate = fields.purchaseDate.value;

  if (!name) check.flag(fields.name, 'Enter the item name.');
  if (!purchaseDate) check.flag(fields.purchaseDate, 'Choose the purchase date.');
  if (!qty) check.flag(fields.qty, 'Quantity must be a whole number from 1 to 50.');
  if (price === '' || price === null) check.flag(fields.price, 'Enter the price per item, e.g. 49.99.');
  if (postage === null) check.flag(fields.postage, 'Postage must be an amount, e.g. 3.99.');
  if (check.failed()) return;

  const details = {
    name,
    description: fields.description.value.trim(),
    orderNumber: fields.orderNumber.value.trim(),
    email: fields.email.value.trim(),
    purchaseDate,
    purchasePrice: price,
  };

  let saved;
  if (itemFormMode.type === 'edit') {
    const { id } = itemFormMode;
    saved = await commit(() => Object.assign(findItem(id), details, { purchasePostage: postage || 0 }));
  } else {
    const groupId = qty > 1 ? newId() : null;
    const createdAt = Date.now();
    const newItems = splitEvenly(postage || 0, qty).map((share, i) => ({
      id: newId(),
      ...details,
      purchasePostage: share,
      group: groupId ? { id: groupId, index: i + 1, size: qty } : null,
      sale: null,
      createdAt: createdAt + (qty - i), // keeps "1 of 3" above "2 of 3" in the list
    }));
    saved = await commit(() => data.items.push(...newItems));
  }

  if (!saved) {
    itemError.textContent = "Couldn't save to your PC. Please try again.";
    itemError.hidden = false;
    return;
  }

  hideModal(itemModal);
  renderItems();
  if (itemFormMode.type === 'edit') renderDetails();
});

document.getElementById('open-add').addEventListener('click', () => openItemForm({ type: 'add' }));

// ---------- Item details ----------
const detailsModal = document.getElementById('details-modal');
let detailsId = null;

function detailRow(label, value, className) {
  const row = el('div', 'detail-row');
  row.append(el('dt', '', label));
  const dd = el('dd', className);
  if (value) dd.textContent = value; else dd.append(el('span', 'dash', '—'));
  row.append(dd);
  return row;
}

function breakdownLine(label, pence, sign) {
  const line = el('div', 'breakdown-line');
  line.append(el('span', '', label));
  line.append(el('span', 'money-cell', `${sign} ${formatMoney(Math.abs(pence))}`));
  return line;
}

// Shows how profit is worked out, line by line.
function buildBreakdown(item, sale) {
  const box = el('div', 'breakdown');
  box.append(breakdownLine('Sold price', sale.price, '+'));
  if (sale.fees) box.append(breakdownLine('Selling fees', sale.fees, '−'));
  if (sale.postage) box.append(breakdownLine('Postage paid to send', sale.postage, '−'));
  box.append(breakdownLine('Purchase price', item.purchasePrice, '−'));
  if (item.purchasePostage) box.append(breakdownLine('Purchase postage', item.purchasePostage, '−'));

  const profit = sale.price - sale.fees - sale.postage - itemCost(item);
  const total = el('div', 'breakdown-total');
  total.append(el('span', '', profit < 0 ? 'Loss' : 'Profit'));
  total.append(el('span', `money-cell ${profitClass(profit)}`, formatMoney(profit)));
  box.append(total);

  // ROI = profit as a percentage of what the item cost (can't divide by a free item).
  if (itemCost(item) > 0) {
    const roi = el('div', 'breakdown-roi');
    roi.append(el('span', '', 'Return on investment'));
    roi.append(el('span', `money-cell ${profitClass(profit)}`, formatPercent(profit / itemCost(item))));
    box.append(roi);
  }
  return box;
}

function renderDetails() {
  const item = findItem(detailsId);
  if (!item) { hideModal(detailsModal); return; }

  const title = document.getElementById('details-title');
  title.replaceChildren(itemTitle(item));
  if (item.description) title.append(el('p', 'subtle detail-desc', item.description));

  const purchase = el('section', 'detail-section');
  purchase.append(el('h3', '', 'Purchase'));
  const purchaseList = el('dl', 'detail-grid');
  purchaseList.append(
    detailRow('Order number', item.orderNumber),
    detailRow('Email', item.email),
    detailRow('Purchase date', formatDate(item.purchaseDate)),
    detailRow('Price', formatMoney(item.purchasePrice)),
    detailRow('Postage', item.purchasePostage ? formatMoney(item.purchasePostage) : ''),
    detailRow('Total cost', formatMoney(itemCost(item)), 'is-strong'),
  );
  purchase.append(purchaseList);

  const sale = el('section', 'detail-section');
  sale.append(el('h3', '', 'Sale'));
  if (item.sale) {
    const saleList = el('dl', 'detail-grid');
    saleList.append(
      detailRow('Sold date', formatDate(item.sale.date)),
      detailRow('Sold price', formatMoney(item.sale.price)),
      detailRow('Postage paid', item.sale.postage ? formatMoney(item.sale.postage) : ''),
      detailRow('Selling fees', item.sale.fees ? formatMoney(item.sale.fees) : ''),
    );
    sale.append(saleList, buildBreakdown(item, item.sale));
  } else {
    sale.append(el('p', 'subtle', 'Not sold yet.'));
  }

  document.getElementById('details-body').replaceChildren(purchase, sale);
  document.getElementById('details-sell').textContent = item.sale ? 'Edit sale' : 'Mark as sold';
}

function openDetails(id) {
  detailsId = id;
  renderDetails();
  showModal(detailsModal);
}

document.getElementById('details-edit').addEventListener('click', () => {
  openItemForm({ type: 'edit', id: detailsId }, findItem(detailsId));
});

document.getElementById('details-duplicate').addEventListener('click', () => {
  const source = findItem(detailsId);
  hideModal(detailsModal);
  openItemForm({ type: 'duplicate' }, source);
});

document.getElementById('details-delete').addEventListener('click', async () => {
  const item = findItem(detailsId);
  const ok = await confirmAction({
    title: 'Delete this item?',
    text: `"${item.name}" will be removed for good. This can't be undone.`,
    okLabel: 'Delete',
  });
  if (!ok) return;
  if (await commit(() => { data.items = data.items.filter((i) => i.id !== item.id); })) {
    hideModal(detailsModal);
    renderItems();
  }
});

document.getElementById('details-sell').addEventListener('click', () => openSaleForm(detailsId));

// ---------- Mark as sold ----------
const saleModal = document.getElementById('sale-modal');
const saleForm = document.getElementById('sale-form');
const saleFields = saleForm.elements;
const saleError = document.getElementById('sale-error');
const salePreview = document.getElementById('sale-preview');
const saleRemove = document.getElementById('sale-remove');

function openSaleForm(id) {
  const item = findItem(id);
  resetForm(saleForm, saleError);
  document.getElementById('sale-form-title').textContent = item.sale ? 'Edit sale' : 'Mark as sold';
  document.getElementById('sale-item-name').textContent = item.name;
  saleRemove.hidden = !item.sale;

  saleFields.saleDate.value = item.sale ? item.sale.date : todayIso();
  if (item.sale) {
    saleFields.salePrice.value = moneyInputValue(item.sale.price);
    saleFields.salePostage.value = moneyInputValue(item.sale.postage);
    saleFields.saleFees.value = moneyInputValue(item.sale.fees);
  }
  updateSalePreview();
  showModal(saleModal);
  saleFields.salePrice.focus();
}

function readSale() {
  return {
    price: parseMoney(saleFields.salePrice.value),
    postage: parseMoney(saleFields.salePostage.value),
    fees: parseMoney(saleFields.saleFees.value),
    date: saleFields.saleDate.value,
  };
}

// Live profit preview while typing.
function updateSalePreview() {
  const sale = readSale();
  const valid = sale.price !== '' && sale.price !== null && sale.postage !== null && sale.fees !== null;
  salePreview.hidden = !valid;
  if (!valid) return;
  const preview = buildBreakdown(findItem(detailsId), { ...sale, postage: sale.postage || 0, fees: sale.fees || 0 });
  salePreview.replaceChildren(...preview.childNodes);
}

saleForm.addEventListener('input', (e) => {
  e.target.classList.remove('is-invalid');
  updateSalePreview();
});

saleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const check = validator(saleError);
  const sale = readSale();

  if (sale.price === '' || sale.price === null) check.flag(saleFields.salePrice, 'Enter the price it sold for, e.g. 120.00.');
  if (!sale.date) check.flag(saleFields.saleDate, 'Choose the date it sold.');
  if (sale.postage === null) check.flag(saleFields.salePostage, 'Postage must be an amount, e.g. 3.99.');
  if (sale.fees === null) check.flag(saleFields.saleFees, 'Fees must be an amount, e.g. 12.50.');
  if (check.failed()) return;

  const id = detailsId;
  const saved = await commit(() => {
    findItem(id).sale = { price: sale.price, postage: sale.postage || 0, fees: sale.fees || 0, date: sale.date };
  });
  if (!saved) {
    saleError.textContent = "Couldn't save to your PC. Please try again.";
    saleError.hidden = false;
    return;
  }
  hideModal(saleModal);
  renderItems();
  renderDetails();
});

saleRemove.addEventListener('click', async () => {
  const ok = await confirmAction({
    title: 'Mark as unsold?',
    text: 'The sale details for this item will be removed and it will go back to unsold.',
    okLabel: 'Mark as unsold',
  });
  if (!ok) return;
  const id = detailsId;
  if (await commit(() => { findItem(id).sale = null; })) {
    hideModal(saleModal);
    renderItems();
    renderDetails();
  }
});

// ---------- Start ----------
(async () => {
  data = await window.store.load();
  renderItems();
  renderDashboard();
})();
