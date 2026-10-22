/*
 * js/landing.js: the official site. Static parts paint from js/config.js at once; live numbers come from /api/state
 * (the Chainlink prices before launch, markets and farms after) and refresh every 30 seconds.
 *   the key visual's loop, the on-screen block counter and clock, the price crawl, the scoreboard,
 *   the PV theater, the cast sheet, the agent select screen (stats, loadout, live APY, the countdown to the next
 *   public wake), the cockpit gauge of the loan sim, the 35 ranked trading cards and the gallery's lightbox.
 */
import { initSite } from './site.js';
import { STOCKS, SYMBOLS, FARMS, stocksOf, stockLogo, USDG } from './config.js';
import { usd, price, pct, num, parseAmount, toNum, esc } from './lib/format.js';

const MAX_OF_LINE = 0.85; // the app lets a loan start at most at 85% of its stock's line
const BLOCKS_PER_SECOND = 9.5; // Robinhood Chain makes a block about every 0.105 s
const lltvOf = (s) => Number(STOCKS[s].lltv) / 1e18;
const rankOf = (s) => { const l = lltvOf(s); return l >= 0.85 ? 'S' : l >= 0.75 ? 'A' : l >= 0.6 ? 'B' : 'C'; };
const $ = (sel, root = document) => root.querySelector(sel);
const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
let state = null;
let stateAt = 0;

/* ------------------------------------------------------------------------------------------------ the broadcast */

function osd() {
  const b = $('[data-osd-block]');
  const c = $('[data-osd-clock]');
  if (c) c.textContent = 'UTC ' + new Date().toISOString().slice(11, 19);
  if (b && state?.block) {
    const est = Math.floor(state.block + ((Date.now() - stateAt) / 1000) * BLOCKS_PER_SECOND);
    b.textContent = 'BLOCK ' + num(est, 0);
  }
}

function crawl() {
  const track = $('[data-tape]');
  if (!track) return;
  const item = (s) => {
    const p = state?.stocks?.[s]?.price;
    return `<li><img src="${stockLogo(s)}" alt="" width="26" height="26" loading="lazy"><b>${s}</b><span class="px">${p ? price(p) : ''}</span><span class="lt2">borrow ${pct(lltvOf(s) * MAX_OF_LINE, 0)}</span></li>`;
  };
  const list = `<ul class="tape-list">${SYMBOLS.map(item).join('')}</ul>`;
  track.innerHTML = list + list.replace('<ul class="tape-list">', '<ul class="tape-list" aria-hidden="true">');
}

function scoreboard() {
  const set = (k, v, label) => {
    const el = $(`[data-stat="${k}"]`);
    if (el) el.textContent = v;
    const dt = $(`[data-stat-label="${k}"]`);
    if (dt && label) dt.textContent = label;
  };
  if (!state) return;
  set('feeds', String(state.totals.feeds));
  if (!state.launched) return;
  const deposits = toNum(state.totals.deposits, USDG.decimals);
  // while the farms are young, near-zero totals say less than the facts that do not change
  if (deposits < 10_000) {
    const best = Math.max(...SYMBOLS.map(lltvOf)) * MAX_OF_LINE;
    set('deposits', pct(best, 0), 'Borrow up to');
    set('borrowed', '$0', 'To open a loan');
    return;
  }
  set('deposits', usd(deposits, { compact: true }), 'In farms');
  set('borrowed', usd(toNum(state.totals.borrowed, USDG.decimals), { compact: true }), 'Lent out');
}

/* ------------------------------------------------------------------------------------------------ select your agent */

const SHEET = {
  sora: { name: 'SORA-01', alt: 'SORA-01, a hover cruiser', blurb: 'Flies the index funds, treasuries and commodity funds. The steadiest collateral.', risk: 2, margin: 5 },
  kira: { name: 'KIRA-02', alt: 'KIRA-02, a round scout drone with a red eye', blurb: 'Scouts the largest companies: Apple, Microsoft, NVIDIA and their neighbours.', risk: 4, margin: 3 },
  raiden: { name: 'RAIDEN-03', alt: 'RAIDEN-03, a walker robot', blurb: 'Walks the fast movers and small caps: Tesla, AMD and Palantir at a 62.5% line, the most volatile at 38.5%. Expect more liquidations.', risk: 6, margin: 2 },
};
let picked = 'sora';

const segs = (on, total = 6) => Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');

function select(key, { swap = true } = {}) {
  const box = $('[data-select]');
  const cfg = FARMS.find((f) => f.key === key);
  if (!box || !cfg) return;
  picked = key;
  const sh = SHEET[key];
  const list = stocksOf(key);
  const img = $('[data-sel-img]', box);
  const src = `/img/agents/${key}-320.webp`;
  if (swap && !img.src.endsWith(src)) {
    img.classList.add('swap');
    setTimeout(() => { img.src = src; img.alt = sh.alt; }, 120);
    img.onload = () => img.classList.remove('swap');
  }
  $('[data-sel-kana]', box).textContent = cfg.kana;
  $('[data-sel-role]', box).textContent = cfg.role;
  $('[data-sel-name]', box).textContent = sh.name;
  $('[data-sel-blurb]', box).textContent = sh.blurb;
  $('[data-bar="risk"]', box).innerHTML = segs(sh.risk);
  $('[data-bar="margin"]', box).innerHTML = segs(sh.margin);
  $('[data-bar="reach"]', box).innerHTML = segs(Math.round(list.length / 3));
  $('[data-sel-stocks]', box).textContent = `${list.length} stocks`;
  const shown = list.slice(0, 9);
  $('[data-sel-logos]', box).innerHTML = shown.map((s) => `<img src="${stockLogo(s)}" alt="${s}" title="${s}" width="34" height="34" loading="lazy">`).join('')
    + (list.length > shown.length ? `<span class="more">+${list.length - shown.length}</span>` : '');
  $('[data-sel-buffer]', box).textContent = usd(cfg.buffer, { dp: 0 });
  const go = $('[data-sel-go]', box);
  go.href = `/app#/farm/${key}`;
  go.textContent = `Farm with ${sh.name}`;
  for (const b of box.querySelectorAll('[data-agent]')) b.setAttribute('aria-pressed', String(b.dataset.agent === key));
  liveSelect();
}

function liveSelect() {
  const box = $('[data-select]');
  if (!box) return;
  const f = state?.farms?.[picked];
  $('[data-sel-apy]', box).textContent = f ? pct(f.apy, 2) : '-';
  $('[data-sel-tvl]', box).textContent = f ? usd(toNum(f.totalAssets, USDG.decimals), { compact: true }) : '-';
  timer();
}

// seconds until anyone may run this agent's playbook again (TetsuAgent.work, once per workInterval for the public)
function timer() {
  const el = $('[data-sel-timer]');
  if (!el) return;
  const f = state?.farms?.[picked];
  if (!f || !f.params) { el.textContent = '--'; return; }
  const now = state.time + Math.floor((Date.now() - stateAt) / 1000);
  const left = Math.max(0, (f.lastWork || 0) + f.params.workInterval - now);
  el.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'GO';
}

function initSelect() {
  const box = $('[data-select]');
  if (!box) return;
  // the select screen's banner backdrop loads when the section comes near
  new IntersectionObserver(([e], io) => { if (e.isIntersecting) { $('.select')?.classList.add('seen'); io.disconnect(); } }, { rootMargin: '600px 0px' }).observe(box);
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-agent]'); if (b) select(b.dataset.agent); });
  select('sora', { swap: false });
}

/* ------------------------------------------------------------------------------------------------ the cockpit gauge */

const calc = {};
const CX = 120, CY = 120, R = 100;
const pt = (f) => { const a = Math.PI * (1 - f); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; };
const arc = (f0, f1) => { const [x0, y0] = pt(f0); const [x1, y1] = pt(f1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };

function initCalc() {
  const form = $('[data-calc]');
  if (!form) return;
  form.addEventListener('submit', (e) => e.preventDefault());
  calc.form = form;
  calc.stock = $('[data-calc-stock]', form);
  calc.shares = $('[data-calc-shares]', form);
  calc.borrow = $('[data-calc-borrow]', form);
  calc.stock.innerHTML = SYMBOLS.map((s) => `<option value="${s}"${s === 'NVDA' ? ' selected' : ''}>${s}  ${esc(STOCKS[s].name)}</option>`).join('');
  const ticks = $('[data-ticks]', form);
  ticks.innerHTML = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = Math.PI * (1 - f);
    return `<line x1="${(CX + 76 * Math.cos(a)).toFixed(1)}" y1="${(CY - 76 * Math.sin(a)).toFixed(1)}" x2="${(CX + 86 * Math.cos(a)).toFixed(1)}" y2="${(CY - 86 * Math.sin(a)).toFixed(1)}"/>`;
  }).join('');
  for (const el of [calc.stock, calc.shares, calc.borrow]) el.addEventListener('input', renderCalc);
  renderCalc();
}

function renderCalc() {
  if (!calc.form) return;
  const s = calc.stock.value;
  const raw = parseAmount(calc.shares.value || '0', 18);
  const shares = raw === null ? 0 : toNum(raw, 18);
  const p = state?.stocks?.[s]?.price || 0;
  const line = lltvOf(s);
  const value = shares * p;
  const maxBorrow = value * line * MAX_OF_LINE;
  const borrow = (maxBorrow * Number(calc.borrow.value)) / 100;
  const ltv = value > 0 ? borrow / value : 0;
  const liq = shares > 0 && borrow > 0 ? borrow / (shares * line) : 0;
  const q = (k) => $(`[data-calc-${k}]`, calc.form);
  q('borrow-out').textContent = num(borrow, 2) + ' USDG';
  q('value').textContent = p ? usd(value) : 'reading';
  q('ltv').textContent = pct(ltv, 1);
  q('lltv').textContent = pct(line, 1);
  q('max').textContent = pct(line * MAX_OF_LINE, 1);
  q('liq').textContent = liq ? price(liq) : '-';
  // the dial runs to 125% of the line: teal up to the start limit, sun to the line, red past it
  const span = line / 0.8;
  const fMax = (line * MAX_OF_LINE) / span;
  $('[data-arc="safe"]', calc.form).setAttribute('d', arc(0, fMax));
  $('[data-arc="warn"]', calc.form).setAttribute('d', arc(fMax, 0.8));
  $('[data-arc="red"]', calc.form).setAttribute('d', arc(0.8, 1));
  const f = Math.min(1, ltv / span);
  $('[data-needle]', calc.form).style.transform = `rotate(${(-90 + 180 * f).toFixed(2)}deg)`;
  q('note').textContent = p
    ? `${s} at ${price(p)} from its Chainlink feed. Teal is where a loan may start, the red zone is past the ${pct(line, 1)} line.`
    : 'Reading the live price from Robinhood Chain.';
}

/* ------------------------------------------------------------------------------------------------ the cards */

function cards() {
  const ul = $('[data-wall]');
  if (!ul) return;
  if (!ul.children.length) {
    ul.innerHTML = SYMBOLS.map((s, i) => {
      const farm = FARMS.find((f) => f.key === STOCKS[s].farm);
      return `<li class="tcard" data-rank="${rankOf(s)}" data-farm="${STOCKS[s].farm}" data-sym="${s}">
        <div class="tc-in">
          <div class="tc-top"><span class="tc-no">No.${String(i + 1).padStart(2, '0')}</span><span class="tc-rank" title="Rank ${rankOf(s)}">${rankOf(s)}</span></div>
          <div class="tc-art"><img src="${stockLogo(s)}" alt="" width="60" height="60" loading="lazy"></div>
          <b class="tc-sym">${s}</b>
          <span class="tc-name">${esc(STOCKS[s].name)}</span>
          <div class="tc-stats"><span>Price</span><b data-px>-</b><span>Borrow</span><b>${pct(lltvOf(s) * MAX_OF_LINE, 0)}</b></div>
          <span class="tc-farm">${esc(farm.agent.split('-')[0])}</span>
        </div>
      </li>`;
    }).join('');
  }
  for (const li of ul.children) {
    const p = state?.stocks?.[li.dataset.sym]?.price;
    li.querySelector('[data-px]').textContent = p ? price(p) : '-';
  }
  fold();
}

// A phone shows the first FOLD cards of the binder's current tab (css/landing.css hides the rest) and a button for all.
const FOLD = 6;
function fold() {
  const ul = $('[data-wall]');
  const more = $('[data-wall-more]');
  if (!ul || !more) return;
  const shown = [...ul.children].filter((li) => !li.hidden);
  shown.forEach((li, i) => li.classList.toggle('extra', i >= FOLD));
  const open = ul.classList.contains('open');
  more.hidden = shown.length <= FOLD;
  more.setAttribute('aria-expanded', String(open));
  more.textContent = open ? 'Show fewer cards' : `Show all ${shown.length} cards`;
}

function initFold() {
  const more = $('[data-wall-more]');
  if (!more) return;
  more.addEventListener('click', () => {
    const ul = $('[data-wall]');
    const open = ul.classList.toggle('open');
    fold();
    if (!open) $('#stocks')?.scrollIntoView({ block: 'start' });
  });
}

function initTabs() {
  const group = $('.binder-tabs');
  if (!group) return;
  group.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    for (const x of group.querySelectorAll('[data-filter]')) x.setAttribute('aria-pressed', String(x === b));
    const f = b.dataset.filter;
    for (const li of document.querySelectorAll('[data-wall] li')) li.hidden = f !== 'all' && li.dataset.farm !== f;
    fold();
  });
}

/* ------------------------------------------------------------------------------------------------ folds */

// Reference sections fold on a phone and stand open on wider screens
function initFolds() {
  const mq = matchMedia('(min-width: 561px)');
  const all = [...document.querySelectorAll('details.fold')];
  const first = new Set(all.filter((d) => d.open));
  const apply = () => { for (const d of all) d.open = mq.matches || first.has(d); };
  apply();
  mq.addEventListener('change', apply);
}

/* ------------------------------------------------------------------------------------------------ the key visual */

// A muted twelve-second loop over the still: the small file on a phone, nothing for reduced motion or Save-Data.
// A visitor can pause it (WCAG 2.2.2); the choice is remembered on this device.
function initKV() {
  const v = $('[data-kv]');
  const sw = $('[data-kv-toggle]');
  if (!v) return;
  const saveData = navigator.connection?.saveData === true;
  if (saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let off = false;
  try { off = localStorage.getItem('tsu.kv') === 'off'; } catch {}
  let seen = false;
  const play = () => { if (!off && seen && !document.hidden) v.play().catch(() => {}); };
  const mark = () => {
    if (!sw) return;
    sw.setAttribute('aria-pressed', String(off));
  };
  const mq = matchMedia('(max-width: 700px)');
  const load = () => {
    const t = v.currentTime || 0;
    v.classList.remove('on'); // the matching still shows while the other file loads
    v.src = mq.matches ? '/video/hero-sq-600.mp4' : '/video/hero-1280.mp4';
    v.addEventListener('loadedmetadata', () => { try { v.currentTime = t % (v.duration || 12); } catch {} }, { once: true });
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
    play();
  };
  if (sw) {
    sw.hidden = false;
    mark();
    sw.addEventListener('click', () => {
      off = !off;
      try { localStorage.setItem('tsu.kv', off ? 'off' : 'on'); } catch {}
      mark();
      if (off) v.pause(); else play();
    });
  }
  load();
  mq.addEventListener('change', load);
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (seen) play(); else v.pause(); }).observe(v);
  document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else play(); });
  addEventListener('pageshow', play);
}

/* ------------------------------------------------------------------------------------------------ the PV theater */

const PVS = [
  { file: 'pv1-umbrella', title: 'Umbrella over the city', jp: '傘の空' },
  { file: 'pv2-night-market', title: 'Night market patrol', jp: '夜市' },
  { file: 'pv3-tea', title: 'Tea at the edge of town', jp: 'お茶の時間' },
  { file: 'pv4-harbor-rails', title: 'Harbor, rails and repairs', jp: '港と線路' },
  { file: 'pv5-moon-stairs', title: 'The moon stairs', jp: '月の階段' },
];

function initPV() {
  const box = $('[data-theater]');
  if (!box) return;
  const v = $('[data-pv]', box);
  if (v.dataset.poster) {
    new IntersectionObserver(([e], io) => {
      if (!e.isIntersecting) return;
      if (!v.poster) v.poster = v.dataset.poster;
      io.disconnect();
    }, { rootMargin: '600px 0px' }).observe(box);
  }
  const pick = (i, play) => {
    const pv = PVS[i];
    const no = `PV ${String(i + 1).padStart(2, '0')}`;
    v.poster = `/img/studio/pv-${pv.file.replace(/^pv\d-/, '')}-1280.webp`;
    v.src = `/video/${pv.file}.mp4`;
    v.setAttribute('aria-label', `${no}: ${pv.title}`);
    $('[data-pv-no]', box).textContent = no;
    $('[data-pv-title]', box).textContent = pv.title;
    $('[data-pv-jp]', box).textContent = pv.jp;
    for (const b of box.querySelectorAll('[data-pv-pick]')) b.setAttribute('aria-pressed', String(Number(b.dataset.pvPick) === i));
    if (play) v.play().catch(() => {});
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pv-pick]');
    if (!b) return;
    pick(Number(b.dataset.pvPick), true);
    if (matchMedia('(max-width: 980px)').matches) v.scrollIntoView({ block: 'center', behavior: motion() });
  });
  // one after another, like a broadcast
  v.addEventListener('ended', () => {
    const i = PVS.findIndex((p) => v.src.endsWith(`/video/${p.file}.mp4`));
    if (i >= 0 && i < PVS.length - 1) pick(i + 1, true);
  });
}

/* ------------------------------------------------------------------------------------------------ the cast sheet */

// Ten outfits, each a part of the machine. Every fact here matches docs.html and the contracts.
const CAST = [
  { file: 'ch01-pilot', name: 'The Pilot', jp: 'パイロット', role: 'Borrowing', sw: ['#e2622b', '#1b2340', '#f4ecdc'],
    alt: 'Tetsu as the pilot, in an orange flight suit with a star chart',
    line: 'Lock a stock token, take USDG, keep the stock. I fly the loan, you hold the controls.',
    facts: ['Deposit a stock token as collateral and borrow USDG against it: 35 stocks, each its own Morpho Blue market.', "A loan can start at up to 85% of the stock's liquidation line.", 'Repay any time, in part or in full, then take the stock back. No fee to open or close.'],
    go: ['/app#/markets', 'Borrow on stocks'] },
  { file: 'ch02-kimono', name: 'The Lender', jp: '貸し手', role: 'Farming', sw: ['#ef9fb0', '#c43c4f', '#f6efe1'],
    alt: 'Tetsu as the lender, in a pink kimono with a folding fan',
    line: 'Patience pays. Leave USDG in a farm and the borrowers grow it for you.',
    facts: ['Deposit USDG into one of three farms and receive farm shares in your wallet.', "The yield comes only from borrowers' interest. Each farm keeps 10% of it as its fee.", "Withdraw any time from the farm's free cash; its agent frees more from quiet markets."],
    go: ['/app#/farms', 'Pick a farm'] },
  { file: 'ch03-student', name: 'The Newcomer', jp: '新入生', role: 'Getting started', sw: ['#f26c5a', '#23315a', '#f6f1e6'],
    alt: 'Tetsu as the newcomer, in a sailor school uniform with a red scarf',
    line: 'First day? All you need is a wallet. No account, no sign-up, no credit check.',
    facts: ['Any wallet that can add a network works: MetaMask, Rabby, Coinbase Wallet, Trust Wallet and others.', 'On a phone, open tetsucorp.si inside your wallet app, or tap Connect and pick it.', 'Stock tokens you hold on Robinhood Chain show up the moment you connect.'],
    go: ['/app', 'Open the app'] },
  { file: 'ch04-mechanic', name: 'The Mechanic', jp: '整備士', role: 'The agents', sw: ['#5c6b47', '#f3e8d2', '#8d949a'],
    alt: 'Tetsu as the mechanic, in green overalls with a wrench',
    line: 'My drones run one playbook, and anyone can wake them. Only the treasury can retune them, never past the farm\'s caps.',
    facts: ['Each farm has an agent: it keeps 5% as cash, fills markets to 90% use and parks a buffer for walk-up borrowers.', 'Anyone can wake an agent to run its playbook, once every 10 minutes.', 'An agent moves USDG only between markets its farm capped in advance.'],
    go: ['#agents', 'Meet the agents'] },
  { file: 'ch05-captain', name: 'The Captain', jp: 'キャプテン', role: 'Stock ranks', sw: ['#c8423a', '#f3ead5', '#22242a'],
    alt: 'Tetsu as the captain, in a red varsity jacket, making a peace sign',
    line: 'Every stock gets a rank, S to C. The rank says how much it can carry.',
    facts: ["A stock's rank follows its market's liquidation line: S at 86%, A at 77%, B at 62.5%, C at 38.5%.", 'The treasury fund ranks S and the big index funds A; most companies rank B, the most volatile ones C.', 'A loan may start at up to 85% of its line: about 73% of the value at rank S, 33% at rank C.'],
    go: ['#stocks', 'See the 35 cards'] },
  { file: 'ch06-phantom', name: 'The Phantom', jp: '怪盗', role: 'Liquidations', sw: ['#6a2a62', '#15161c', '#f5efe4'],
    alt: 'Tetsu as the phantom, in a black suit with a purple cravat, holding a white mask',
    line: 'When a loan crosses its line, I step in: repay the debt, take the collateral, keep the bonus.',
    facts: ["Anyone can close a loan that is past its stock's line, from the Rescue board.", 'The liquidator repays debt in USDG and takes collateral worth that plus a bonus of up to 15%.', 'Liquidations protect the farms that lent the USDG.'],
    go: ['/app#/liquidate', 'Open the rescue board'] },
  { file: 'ch07-astronaut', name: 'The Astronaut', jp: '宇宙飛行士', role: 'Robinhood Chain', sw: ['#1f5a63', '#f1e7cf', '#e2602f'],
    alt: 'Tetsu as the astronaut, in a teal flight suit, saluting with a helmet under her arm',
    line: 'We fly in orbit: Robinhood Chain, an Arbitrum Orbit chain, about ten blocks a second.',
    facts: ['Everything runs on Robinhood Chain, chain ID 4663.', 'Gas costs cents: all 106 launch transactions cost about 0.0013 ETH together.', 'Your wallet is asked to add or switch to the network when you connect.'],
    go: ['/docs', 'Read the manual'] },
  { file: 'ch08-samurai', name: 'The Samurai', jp: '侍', role: 'The red line', sw: ['#e9a0a4', '#1d2a4a', '#b8342f'],
    alt: 'Tetsu as the samurai, in pink and navy armour with a fan',
    line: 'Every loan has a line. Stay behind it and the loan is yours as long as you like.',
    facts: ["Each market's line is its liquidation loan-to-value: 38.5% to 86% depending on the stock.", "Interest accrues every second at the market's rate. There is no due date.", 'Add collateral or repay a little to move away from the line.'],
    go: ['#loan', 'Try the loan sim'] },
  { file: 'ch09-astronomer', name: 'The Astronomer', jp: '天文学者', role: 'Prices', sw: ['#1c2647', '#efe4c6', '#c9a24a'],
    alt: 'Tetsu as the astronomer, in a starry cape with a brass armillary sphere',
    line: 'I read the prices from the sky: one Chainlink feed for every stock.',
    facts: ["Every market reads its stock's Chainlink feed through a Tetsu price adapter.", 'The feeds update 24 hours a day, five days a week.', 'If a feed is silent for five days, its market pauses new borrowing, collateral withdrawals and liquidations. Repaying and adding collateral always work.'],
    go: ['/docs#borrow', 'How prices work'] },
  { file: 'ch10-officer', name: 'The Officer', jp: '将校', role: 'Safety rules', sw: ['#8f1f2a', '#d8b25a', '#f2ead8'],
    alt: 'Tetsu as the officer, in a crimson uniform with gold epaulettes',
    line: "Orders are slow on purpose. Raising a farm's caps, or changing its market adapters, allocators or fees, waits three days.",
    facts: ['The treasury owns and curates each farm. Raising a cap, adding an adapter or an allocator, and changing a fee each wait three days.', "Only Morpho's own market adapters can be added to a farm.", 'A 10% performance fee, no management fee, and a 0.5% penalty on forced deallocation.'],
    go: ['/docs#contracts', 'The contracts'] },
];

function initCast() {
  const box = $('[data-cast]');
  if (!box) return;
  const img = $('[data-cast-img]', box);
  let want = img.getAttribute('src');
  const show = (i) => {
    const c = CAST[i];
    const src = `/img/studio/${c.file}-720.webp`;
    want = src;
    if (img.getAttribute('src') === src) {
      img.alt = c.alt;
      img.classList.remove('swap');
    } else {
      img.classList.add('swap');
      const next = new Image();
      next.onload = next.onerror = () => {
        if (want !== src) return; // a newer pick is on its way
        img.src = src;
        img.alt = c.alt;
        img.classList.remove('swap');
      };
      next.src = src;
    }
    $('[data-cast-no]', box).textContent = String(i + 1).padStart(2, '0');
    $('[data-cast-jp]', box).textContent = c.jp;
    $('[data-cast-name]', box).textContent = c.name;
    $('[data-cast-role]', box).textContent = c.role;
    $('[data-cast-line]', box).textContent = c.line;
    $('[data-cast-facts]', box).innerHTML = c.facts.map((f) => `<li>${esc(f)}</li>`).join('');
    $('[data-cast-sw]', box).innerHTML = c.sw.map((x) => `<i style="--c:${x}"></i>`).join('');
    const go = $('[data-cast-go]', box);
    go.href = c.go[0];
    go.textContent = c.go[1];
    for (const b of box.querySelectorAll('[data-cast-pick]')) b.setAttribute('aria-pressed', String(Number(b.dataset.castPick) === i));
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cast-pick]');
    if (!b) return;
    show(Number(b.dataset.castPick));
    if (matchMedia('(max-width: 760px)').matches) $('.stage-pic', box).scrollIntoView({ block: 'start', behavior: motion() });
  });
}

/* ------------------------------------------------------------------------------------------------ the gallery */

function initGallery() {
  const list = $('[data-gallery]');
  const lb = $('[data-lightbox]');
  if (!list || !lb || typeof lb.showModal !== 'function') return;
  const items = [...list.querySelectorAll('[data-zoom]')];
  let at = 0;
  const open = (i) => {
    at = (i + items.length) % items.length;
    const img = $('img', items[at]);
    $('[data-lb-img]', lb).src = img.srcset.split(',').pop().trim().split(' ')[0];
    $('[data-lb-img]', lb).alt = img.alt;
    $('[data-lb-cap]', lb).textContent = `${String(at + 1).padStart(2, '0')}  ${img.alt}`;
    if (!lb.open) lb.showModal();
  };
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-zoom]'); if (b) open(Number(b.dataset.zoom)); });
  lb.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (b) { if (b.dataset.lb === 'close') lb.close(); else open(at + (b.dataset.lb === 'next' ? 1 : -1)); return; }
    if (e.target === lb) lb.close(); // a click on the backdrop
  });
  lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') open(at + 1); if (e.key === 'ArrowLeft') open(at - 1); });
}

/* ------------------------------------------------------------------------------------------------ data */

async function load() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'no data');
    state = j;
    stateAt = Date.now();
    crawl(); scoreboard(); liveSelect(); cards(); renderCalc(); osd();
  } catch (e) {
    console.warn('state', e?.message || e);
  }
}

initSite();
crawl();
initSelect();
initCalc();
cards();
initTabs();
initFold();
initFolds();
initKV();
initPV();
initCast();
initGallery();
osd();
load();
setInterval(() => { osd(); timer(); }, 1000);
setInterval(() => { if (!document.hidden) load(); }, 30_000);
