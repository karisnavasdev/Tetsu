/*
 * js/app/main.js: the app shell. Boots the runtime (production or a local fork), routes #/views, keeps the chain
 * state fresh (public every 15 s, the wallet's every 15 s and right after every transaction), and draws the wallet
 * button, the wallet picker and the account sheet.
 */
import { initTheme, initCopyCA, toast } from '../site.js';
import { runtime, CHAIN, BRAND, isLaunched, isLocalHost } from '../config.js';
import { S, on, emit } from './store.js';
import { reader, readPublic, readUser, addrUrl } from './chain.js';
import * as W from './wallet.js';
import { openSheet, closeSheet, ICON } from './ui.js';
import { esc, short, tok } from '../lib/format.js';
import markets from './views/markets.js';
import stock from './views/stock.js';
import farms from './views/farms.js';
import farm from './views/farm.js';
import portfolio from './views/portfolio.js';
import liquidate from './views/liquidate.js';

const VIEWS = { markets, stock, farms, farm, portfolio, liquidate };
const TAB_OF = { markets: 'markets', stock: 'markets', farms: 'farms', farm: 'farms', portfolio: 'portfolio', liquidate: 'liquidate' };
const main = document.getElementById('view');
let cur = { name: '', arg: '' };
let view = null;

/* ------------------------------------------------------------------------------------------------ routing */

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  if (!VIEWS[name]) return { name: 'markets', arg: '' };
  const arg = decodeURIComponent(rest.join('/') || '');
  return { name, arg: name === 'stock' ? arg.toUpperCase() : arg.toLowerCase() };
}

function show() {
  const r = route();
  if (r.name === cur.name && r.arg === cur.arg) { repaint(); return; }
  cur = r;
  view = VIEWS[r.name];
  main.innerHTML = view.render(r.arg);
  view.mount?.(main, r.arg);
  const t = typeof view.title === 'function' ? view.title(r.arg) : view.title;
  document.title = `${t} | Tetsu Corp`;
  for (const a of document.querySelectorAll('[data-tab-link]')) {
    if (a.dataset.tabLink === TAB_OF[r.name]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  scrollTo({ top: 0, behavior: 'instant' });
}

let raf = 0;
function repaint() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    view?.update?.(main, cur.arg);
    walletButton();
    banner();
  });
}

/* ------------------------------------------------------------------------------------------------ data */

let pubBusy = false, meBusy = false;
async function refreshPublic() {
  if (pubBusy) return;
  pubBusy = true;
  try {
    S.pub = await readPublic(reader(S.rpc), S.deploy);
    S.pubError = '';
  } catch (e) {
    console.warn('public read', e?.message || e);
    S.pubError = 'Robinhood Chain did not answer. Retrying.';
  }
  pubBusy = false;
  emit('pub');
}
async function refreshUser() {
  if (meBusy || !S.account) return;
  meBusy = true;
  const who = S.account;
  try {
    const me = await readUser(reader(S.rpc), S.deploy, who);
    if (S.account === who) { S.me = me; S.meError = ''; }
  } catch (e) {
    console.warn('wallet read', e?.message || e);
    S.meError = 'Could not read your wallet. Retrying.';
  }
  meBusy = false;
  emit('me');
}
async function loadApi() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) return;
    S.log = Array.isArray(j.log) ? j.log : [];
    if (!S.pub) S.pub = fromApi(j);
    emit('pub');
  } catch {}
}
const B = (x) => (x === undefined || x === null ? 0n : BigInt(x));
function fromApi(j) {
  const markets = {};
  for (const [s, m] of Object.entries(j.markets || {})) {
    markets[s] = { id: m.id, supply: B(m.supply), supplyShares: B(m.supplyShares), borrow: B(m.borrow), borrowShares: B(m.borrowShares), lastUpdate: m.lastUpdate, fee: B(m.fee), rate: B(m.rate), oraclePrice: null };
  }
  const farms = {};
  for (const [k, f] of Object.entries(j.farms || {})) {
    farms[k] = {
      key: k, vault: f.vault, agent: f.agent, adapter: f.adapter, totalAssets: B(f.totalAssets), totalSupply: B(f.totalSupply),
      performanceFee: BigInt(Math.round((f.performanceFee || 0) * 1e18)), idle: B(f.idle), lastWork: f.lastWork || 0,
      params: f.params ? { targetUtilization: B(f.params.targetUtilization), buffer: B(f.params.buffer), idleBps: f.params.idleBps, minMove: B(f.params.minMove), workInterval: f.params.workInterval } : null,
      rows: (f.rows || []).map((r) => ({ id: r.id, ours: B(r.ours), supply: B(r.supply), borrow: B(r.borrow), fill: B(r.fill), target: B(r.target), room: B(r.room) })),
    };
  }
  return { now: j.time, stocks: j.stocks, markets, farms, at: Date.now() };
}

/* ------------------------------------------------------------------------------------------------ wallet UI */

function walletButton() {
  const box = document.querySelector('[data-wallet]');
  if (!box) return;
  const html = S.account
    ? `<button class="btn small acct" type="button" data-account aria-label="Your wallet ${S.account}"><span class="dot ${S.me ? 'live' : 'off'}"></span><span class="num addr-l">${short(S.account)}</span><span class="num addr-s">${S.account.slice(0, 4)}..${S.account.slice(-3)}</span></button>`
    : `<button class="btn coral small" type="button" data-connect>${ICON.wallet}<span>Connect</span></button>`;
  if (box.innerHTML !== html) box.innerHTML = html;
}

function picker() {
  W.askWallets();
  const list = W.available();
  const phone = W.onPhone();
  const items = list.map((w) => `<button class="wpick" type="button" data-pick="${esc(w.id)}">${w.icon ? `<img src="${w.icon}" alt="" width="36" height="36">` : `<span class="wpick-ico">${ICON.wallet}</span>`}<span><b>${esc(w.name)}</b><small>In this browser</small></span>${ICON.next}</button>`);
  const links = !list.length && phone ? W.deepLinks().map((d) => `<a class="wpick" href="${esc(d.href)}" rel="noopener"><span class="wpick-ico" style="color:${d.color}">${ICON.wallet}</span><span><b>Open in ${esc(d.name)}</b><small>Opens this page inside the app's browser</small></span>${ICON.next}</a>`) : [];
  const none = !items.length && !links.length ? `<p class="muted sheet-p">No wallet found in this browser. Install one, such as MetaMask or Rabby, then reload. On a phone, open ${esc(BRAND.domain)} inside your wallet app's browser.</p>` : '';
  const body = openSheet(`<p class="eyebrow"><span>Connect</span><span class="kana">接続</span></p>
    <h2 class="display sheet-title">Pick your wallet</h2>
    <p class="muted sheet-p">Tetsu Corp runs on ${esc(CHAIN.name)}. Your wallet will be asked to add or switch to it.</p>
    <div class="wlist">${items.join('')}${links.join('')}</div>${none}
    <p class="sheet-err" data-pick-err hidden></p>`, { label: 'Connect a wallet' });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const errBox = body.querySelector('[data-pick-err]');
    b.disabled = true;
    errBox.hidden = true;
    try {
      const ok = await W.connect(b.dataset.pick);
      if (ok) { closeSheet(); toast(`Connected ${esc(short(S.account))}.`, { kind: 'ok' }); }
    } catch (err) {
      errBox.textContent = err?.message && !/user rejected|denied/i.test(err.message) ? err.message : 'Not connected: the wallet request was declined.';
      errBox.hidden = false;
    }
    b.disabled = false;
  });
}

function accountSheet() {
  const me = S.me;
  const body = openSheet(`<p class="eyebrow"><span>Wallet</span><span class="kana">財布</span></p>
    <h2 class="display sheet-title num">${esc(short(S.account))}</h2>
    <p class="muted sheet-p">${esc(W.walletName())} on ${esc(CHAIN.name)}</p>
    ${me ? `<div class="kv"><div><span>USDG</span><b class="num">${tok(me.usdg, 6, 2)}</b></div><div><span>ETH for gas</span><b class="num">${tok(me.eth, 18, 6)}</b></div></div>` : ''}
    <div class="sheet-acts">
      <button class="btn small" type="button" data-copy>Copy address</button>
      <a class="btn small" href="${esc(addrUrl(S.account))}" target="_blank" rel="noopener">Explorer ${ICON.ext}</a>
      <a class="btn small" href="#/portfolio" data-sheet-close>Portfolio</a>
    </div>
    <button class="btn block" type="button" data-disconnect>Disconnect</button>`, { label: 'Your wallet' });
  body.querySelector('[data-copy]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(S.account); e.currentTarget.textContent = 'Copied'; } catch { e.currentTarget.textContent = S.account; }
  });
  body.querySelector('[data-disconnect]').addEventListener('click', async () => { closeSheet(); await W.disconnect(); toast('Disconnected.'); });
}

function banner() {
  const el = document.querySelector('[data-banner]');
  if (!el) return;
  let html = '';
  if (!isLaunched(S.deploy)) html = '<span class="dot warn"></span><span><b>Pre-launch.</b> Prices are live from Robinhood Chain. Loans and farms open when the contracts launch.</span>';
  else if (S.pubError) html = `<span class="dot danger"></span><span>${esc(S.pubError)}</span>`;
  else if (S.local) html = '<span class="dot warn"></span><span><b>Local test chain.</b> This page reads a local fork, not Robinhood Chain.</span>';
  el.hidden = !html;
  if (el.innerHTML !== html) el.innerHTML = html;
}

/* ------------------------------------------------------------------------------------------------ boot */

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-connect]')) { e.preventDefault(); picker(); }
  else if (e.target.closest('[data-account]')) accountSheet();
});
document.addEventListener('tsu:connect', () => picker());
document.addEventListener('tsu:toast', (e) => toast(e.detail.html, { kind: e.detail.kind }));
document.addEventListener('tsu:repaint', repaint);
document.addEventListener('tsu:refresh', () => {
  refreshPublic(); refreshUser();
  setTimeout(() => { refreshPublic(); refreshUser(); }, 2500);
  setTimeout(loadApi, 6000);
});
on((what) => {
  if (what === 'account') { refreshUser(); }
  repaint();
});

async function boot() {
  initTheme();
  initCopyCA();
  // the field shows what will be sent: a European keypad's "0,5" becomes "0.5" as it is typed
  document.addEventListener('input', (e) => { const i = e.target; if (i.matches?.('.amt-box input') && /^\d*,\d*$/.test(i.value)) i.value = i.value.replace(',', '.'); }, true);
  const rt = await runtime();
  S.deploy = rt.deploy;
  S.rpc = rt.rpc;
  S.local = rt.local;
  if (isLocalHost()) window.__tsu = S; // local debugging and the e2e rig only
  addEventListener('hashchange', show);
  show();
  walletButton();
  banner();
  loadApi();
  refreshPublic();
  W.restore();
  setInterval(() => { if (!document.hidden) { refreshPublic(); refreshUser(); } }, 15_000);
  setInterval(() => { if (!document.hidden) loadApi(); }, 30_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshPublic(); refreshUser(); } });
}
boot();
