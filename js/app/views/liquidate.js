// #/liquidate: every open loan, riskiest first. A loan past its line can be closed by anyone, for a bonus.
import { STOCKS, USDG } from '../../config.js';
import { S } from '../store.js';
import { market, healthTone, live, usdgNum } from '../derive.js';
import { esc, usd, pct, tok, short, num } from '../../lib/format.js';
import { logo, openSheet, sheetBody, stepsHtml, ICON, put } from '../ui.js';
import { liquidatePlan, run } from '../flows.js';
import { incentive } from '../math.js';

let data = null;
let loading = false;
let err = '';

async function load(force = false) {
  if (loading || (!force && data && Date.now() - data.at < 15000)) return;
  loading = true;
  try {
    const r = await fetch('/api/loans' + (force ? `?t=${Date.now()}` : ''), { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'no data');
    data = { ...j, at: Date.now() };
    err = '';
  } catch (e) { err = 'Could not read the loans right now.'; }
  loading = false;
  document.dispatchEvent(new CustomEvent('tsu:repaint'));
}

function rows() {
  if (!live()) return '<div class="empty-in"><p>Loans open at launch. This board lists every one, riskiest first.</p></div>';
  if (err && !data) return `<div class="empty-in"><p>${esc(err)}</p></div>`;
  if (!data) return '<div class="empty-in"><p>Reading every loan from Robinhood Chain...</p></div>';
  if (!data.loans.length) return '<div class="empty-in"><p>No open loans yet.</p></div>';
  return data.loans.map((l) => {
    const t = healthTone(l.health ?? NaN);
    const can = l.health !== null && l.health < 1;
    const mk = market(l.sym);
    return `<div class="lq-row ${can ? 'hot' : ''}">
      <span class="lq-id">${logo(l.sym, 's')}<span><b>${l.sym}</b><small class="muted num">${short(l.borrower)}</small></span></span>
      <span class="num" data-k="Collateral">${tok(BigInt(l.collateral), 18, 4)} ${l.sym}</span>
      <span class="num" data-k="Debt">${usd(usdgNum(BigInt(l.debt)))}</span>
      <span class="num" data-k="LTV">${l.ltv !== null ? pct(l.ltv, 1) : '-'} <small class="muted">/ ${pct(mk.lltvNum, 1)}</small></span>
      <span data-k="Health"><span class="chip ${t.tone}">${l.health !== null ? num(l.health, 3) : '?'}</span></span>
      <span class="lq-go"><button class="btn ${can ? 'coral' : ''} small" type="button" data-liq="${l.sym}:${l.borrower}" ${can && !S.busy ? '' : 'disabled'}>${can ? 'Liquidate' : 'Healthy'}</button></span>
    </div>`;
  }).join('');
}

function openLiq(sym, borrower) {
  const l = data?.loans?.find((x) => x.sym === sym && x.borrower.toLowerCase() === borrower.toLowerCase());
  if (!l) return;
  const mk = market(sym);
  const bonus = Number(incentive(mk.lltv)) / 1e18 - 1;
  const body = openSheet(`<p class="eyebrow"><span>Liquidation</span><span class="kana">清算</span></p>
    <h2 class="display sheet-title">${logo(sym, 's')} ${sym} loan</h2>
    <div class="kv">
      <div><span>Borrower</span><b class="num">${short(borrower)}</b></div>
      <div><span>Debt</span><b class="num">${usd(usdgNum(BigInt(l.debt)))}</b></div>
      <div><span>Collateral</span><b class="num">${tok(BigInt(l.collateral), 18, 6)} ${sym}</b></div>
      <div><span>Your bonus</span><b class="num">${pct(bonus, 1)}</b></div>
    </div>
    <p class="muted sheet-p">You repay the loan in USDG and receive its collateral, worth the repayment plus the bonus, at the oracle price. If the collateral is worth less than that, you repay less and take all of it. Amounts are re-read on chain right before each step.</p>
    ${S.me ? `<p class="muted sheet-p">Your wallet: <span class="num">${tok(S.me.usdg, USDG.decimals, 2)} USDG</span></p>` : ''}
    <button class="btn coral block" type="button" data-liq-go>${S.account ? 'Liquidate' : 'Connect wallet'}</button>
    <div data-steps="liq"></div>`, { label: `Liquidate the ${sym} loan` });
  body.querySelector('[data-liq-go]').addEventListener('click', async (e) => {
    if (!S.account) { document.dispatchEvent(new CustomEvent('tsu:connect')); return; }
    e.currentTarget.disabled = true;
    const box = body.querySelector('[data-steps="liq"]');
    const res = await run(liquidatePlan(sym, borrower), (steps) => { box.innerHTML = stepsHtml(steps); }, () => { load(true); document.dispatchEvent(new CustomEvent('tsu:refresh')); });
    if (res.ok) document.dispatchEvent(new CustomEvent('tsu:toast', { detail: { kind: 'ok', html: `Liquidated. The ${esc(sym)} is in your wallet.` } }));
    else e.currentTarget.disabled = false;
  });
}

export default {
  title: 'Liquidations',
  render() {
    return `<section class="vhead">
      <div class="vhead-id"><span class="vh-sticker" aria-hidden="true">救</span><div class="vhead-txt">
        <p class="eyebrow"><span>Liquidations</span><span class="kana">清算</span></p>
        <h1 class="vtitle display">The rescue board</h1>
        <p class="vsub">A loan past its liquidation line puts its farm's lenders at risk. Anyone can close it: repay the debt in USDG and take the collateral with a bonus of up to 15%. Every open loan is listed here, riskiest first.</p>
      </div></div>
      <button class="btn small" type="button" data-reload>${ICON.refresh}Refresh</button>
    </section>
    <div class="lq-head" aria-hidden="true"><span>Loan</span><span>Collateral</span><span>Debt</span><span>LTV / line</span><span>Health</span><span></span></div>
    <div class="lq-list panel" data-live="list"></div>`;
  },
  mount(el) {
    el.querySelector('[data-reload]').addEventListener('click', () => load(true));
    el.querySelector('[data-live="list"]').addEventListener('click', (e) => { const b = e.target.closest('[data-liq]'); if (!b) return; const [sym, who] = b.dataset.liq.split(':'); openLiq(sym, who); });
    load();
    this.update(el);
  },
  update(el) {
    put(el.querySelector('[data-live="list"]'), rows());
    load();
  },
};
