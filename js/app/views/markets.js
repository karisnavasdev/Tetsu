// #/markets: every stock's market, filterable. A row opens the stock's page.
import { SYMBOLS, FARMS, USDG } from '../../config.js';
import { S, kv } from '../store.js';
import { market, loan, farm, healthTone, live, usdgNum } from '../derive.js';
import { esc, usd, pct, price } from '../../lib/format.js';
import { ICON, logo, put, rank } from '../ui.js';

const ui = { farm: kv.get('mfarm', 'session') || 'all', q: '', sort: kv.get('msort', 'session') || 'default' };

/** USDG an agent could bring to this market on demand: its farm's idle cash plus other markets' spare. */
export function reach(sym) {
  const mk = market(sym);
  const f = farm(mk.farm);
  if (!f.deployed) return mk.liquidity;
  let extra = f.idle;
  for (const r of f.rows) {
    if (!r.sym || r.sym === sym) continue;
    const spare = r.ours > r.fill ? r.ours - r.fill : 0n;
    const free = r.mk?.liquidity ?? 0n;
    extra += spare < free ? spare : free;
  }
  return mk.liquidity + extra;
}

function rows() {
  const q = ui.q.trim().toLowerCase();
  let list = SYMBOLS.filter((s) => (ui.farm === 'all' || market(s).farm === ui.farm) && (!q || s.toLowerCase().includes(q) || market(s).name.toLowerCase().includes(q)));
  const by = {
    name: (a, b) => a.localeCompare(b),
    price: (a, b) => (market(b).price || 0) - (market(a).price || 0),
    rate: (a, b) => market(a).borrowApy - market(b).borrowApy,
    ltv: (a, b) => market(b).maxLtv - market(a).maxLtv,
    reach: (a, b) => usdgNum(reach(b)) - usdgNum(reach(a)),
  }[ui.sort];
  if (by) list = [...list].sort(by);
  if (!list.length) return `<div class="empty panel">No stock matches "${esc(ui.q)}".</div>`;
  const isLive = live();
  return list.map((s) => {
    const mk = market(s);
    const l = S.me ? loan(s, mk) : null;
    const t = l?.has ? healthTone(l.health) : null;
    const avail = isLive ? usd(usdgNum(reach(s)), { compact: true }) : 'At launch';
    return `<a class="mrow" href="#/stock/${s}">
      <span class="mrow-id">${logo(s)}${rank(s)}<span><b>${s}</b><small>${esc(mk.name)}</small></span></span>
      <span class="mrow-c num" data-k="Price">${mk.price ? price(mk.price) : '-'}${mk.stale ? ' <span class="chip warn">stale</span>' : ''}</span>
      <span class="mrow-c num" data-k="Borrow APY">${isLive && mk.open ? pct(mk.borrowApy) : '-'}</span>
      <span class="mrow-meta">
        <span class="mrow-c num" data-k="Available">${avail}</span>
        <span class="mrow-c num" data-k="Max LTV">${pct(mk.maxLtv, 1)}</span>
        <span class="mrow-c${t ? '' : ' none'}" data-k="Your loan">${t ? `<span class="chip ${t.tone}">${t.word}</span>` : '<span class="muted">-</span>'}</span>
      </span>
      <span class="mrow-go" aria-hidden="true">${ICON.next}</span>
    </a>`;
  }).join('');
}

function stats() {
  if (!live()) {
    return `<div class="vstat"><p>Stocks</p><p class="num">${SYMBOLS.length}</p></div><div class="vstat"><p>Status</p><p class="num">Pre-launch</p></div>`;
  }
  let supplied = 0n, borrowed = 0n;
  for (const s of SYMBOLS) { const mk = market(s); if (mk.m) { supplied += mk.m.supply; borrowed += mk.m.borrow; } }
  return `<div class="vstat"><p>Lent into markets</p><p class="num">${usd(Number(supplied) / 10 ** USDG.decimals, { compact: true })}</p></div>
    <div class="vstat"><p>Borrowed</p><p class="num">${usd(Number(borrowed) / 10 ** USDG.decimals, { compact: true })}</p></div>`;
}

export default {
  title: 'Markets',
  render() {
    return `<section class="vhead">
      <div class="vhead-id"><span class="vh-sticker" aria-hidden="true">借</span><div class="vhead-txt">
        <p class="eyebrow"><span>Markets</span><span class="kana">市場</span></p>
        <h1 class="vtitle display">Borrow on stocks</h1>
        <p class="vsub">Deposit a stock token and borrow USDG against it. Each stock is its own Morpho market, and one agent's farm lends into it.</p>
      </div></div>
      <div class="vstats" data-live="stats"></div>
    </section>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filter by farm">
        <button type="button" data-farm="all">All</button>
        ${FARMS.map((f) => `<button type="button" data-farm="${f.key}">${f.agent.split('-')[0]}</button>`).join('')}
      </div>
      <label class="search">${ICON.search}<span class="sr">Search stocks</span><input type="search" placeholder="Search 35 stocks" data-q autocomplete="off"></label>
      <label class="sort"><span class="sr">Sort</span><select data-sort>
        <option value="default">Sort: by farm</option><option value="name">Name</option><option value="price">Price</option>
        <option value="reach">Most available</option><option value="rate">Lowest rate</option><option value="ltv">Highest LTV</option>
      </select></label>
    </div>
    <div class="mhead" aria-hidden="true"><span>Stock</span><span>Price</span><span>Borrow APY</span><span>Available</span><span>Max LTV</span><span>Your loan</span><span></span></div>
    <div class="mlist" data-live="list"></div>`;
  },
  mount(el) {
    const seg = el.querySelector('.seg');
    const paint = () => { for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.farm === ui.farm)); };
    paint();
    seg.addEventListener('click', (e) => { const b = e.target.closest('[data-farm]'); if (!b) return; ui.farm = b.dataset.farm; kv.set('mfarm', ui.farm, 'session'); paint(); this.update(el); });
    const q = el.querySelector('[data-q]');
    q.value = ui.q;
    q.addEventListener('input', () => { ui.q = q.value; this.update(el); });
    const sort = el.querySelector('[data-sort]');
    sort.value = ui.sort;
    sort.addEventListener('change', () => { ui.sort = sort.value; kv.set('msort', ui.sort, 'session'); this.update(el); });
    this.update(el);
  },
  update(el) {
    put(el.querySelector('[data-live="stats"]'), stats());
    put(el.querySelector('[data-live="list"]'), S.pub ? rows() : '<div class="empty panel">Reading the markets from Robinhood Chain...</div>');
  },
};
