// #/stock/SYM: one stock's market, your loan in it, and the borrow, repay and withdraw forms.
import { STOCKS, USDG } from '../../config.js';
import { S } from '../store.js';
import { market, loan, project, farm, farmCfg, healthTone, live, usdgNum, SAFE_NUM } from '../derive.js';
import { reach } from './markets.js';
import { esc, usd, pct, price, num, tok, ago, parseAmount, formatUnits } from '../../lib/format.js';
import { ICON, logo, healthBar, amountField, stepsHtml, agentImg, put, tip, dial } from '../ui.js';
import { borrowPlan, repayPlan, withdrawCollateralPlan, run } from '../flows.js';
import { incentive } from '../math.js';

const D18 = 18;
const D6 = USDG.decimals;
let tab = 'borrow';
const stepsBy = {}; // `${sym}:${form}` -> last step list, kept while the page is open

function trimmed(raw, decimals, dp) {
  const s = formatUnits(raw, decimals);
  const [i, f = ''] = s.split('.');
  return f ? `${i}.${f.slice(0, dp)}`.replace(/\.?0+$/, '') : i;
}
function readInput(input, decimals) {
  if (input.dataset.raw && input.value === input.dataset.shown) return BigInt(input.dataset.raw);
  const v = parseAmount(input.value || '0', decimals);
  return v === null ? null : v;
}
function setMax(input, raw, decimals, dp) {
  input.dataset.raw = String(raw);
  input.dataset.shown = trimmed(raw, decimals, dp);
  input.value = input.dataset.shown;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function head(sym) {
  const mk = market(sym);
  const cfg = farmCfg(mk.farm);
  // "feed live" only while the price is fresh: stock feeds rest overnight and at weekends
  const fresh = Number.isFinite(mk.feedAge) && mk.feedAge < 3600;
  const feed = !mk.price ? '' : mk.stale ? '<span class="chip warn">feed stale</span>'
    : fresh ? '<span class="chip teal"><span class="dot live"></span>feed live</span>' : `<span class="chip">price ${ago(mk.feedAge)}</span>`;
  const can = live() ? usdgNum(reach(sym)) : null;
  const low = can !== null && mk.open && can < 100 ? `<span class="chip warn">${usd(can)} lendable now</span>` : '';
  // the number a borrower came for: what one share can borrow
  const cap = mk.price ? `<p class="shead-cap"><b class="num">${usd(mk.price * mk.maxLtv)}</b> borrowable per ${sym}, up to ${pct(mk.maxLtv, 1)} of its value${live() && mk.open ? `, ${pct(mk.borrowApy)} APY` : ''}</p>` : '';
  return `<div class="shead-id">${logo(sym, 'xl')}<div><h1 class="display">${sym}</h1><p>${esc(mk.name)}</p></div></div>
    <div class="shead-px"><p class="num">${mk.price ? price(mk.price) : '-'}</p><p class="muted">Chainlink, ${Number.isFinite(mk.feedAge) ? ago(mk.feedAge) : 'reading'}</p></div>
    ${cap}
    <div class="shead-chips">${feed}${low}<a class="chip" href="#/farm/${mk.farm}"><img src="${agentImg(mk.farm)}" alt="" width="18" height="18">Lent by ${esc(cfg.agent)}</a></div>`;
}

function posPanel(sym) {
  const mk = market(sym);
  if (!S.account) return ''; // the form's button is the one Connect on the page
  if (!S.me) return `<div class="panel-head"><h3>Your loan</h3></div><div class="pad-in"><p class="muted">Reading your wallet...</p></div>`;
  const l = loan(sym, mk);
  const bal = S.me.stocks[sym] || 0n;
  if (!l.has) {
    return `<div class="panel-head"><h3>Your loan</h3><span class="chip">None yet</span></div>
      <div class="pad-in kv"><div><span>In your wallet</span><b class="num">${tok(bal, D18, 6)} ${sym}</b></div><div><span>Worth</span><b class="num">${mk.price ? usd((Number(bal) / 1e18) * mk.price) : '-'}</b></div></div>`;
  }
  const t = healthTone(l.health);
  return `<div class="panel-head"><h3>Your loan</h3><span class="chip ${t.tone}">${t.word}</span></div>
    <div class="pad-in">
      <div class="kv">
        <div><span>Collateral</span><b class="num">${tok(l.collateral, D18, 6)} ${sym}</b></div>
        <div><span>Worth</span><b class="num">${mk.price ? usd((Number(l.collateral) / 1e18) * mk.price) : '-'}</b></div>
        <div><span>You owe</span><b class="num">${tok(l.debt, D6, 2)} USDG</b></div>
        <div><span>Loan to value</span><b class="num">${pct(l.ltv, 2)}</b></div>
        <div><span>Liquidated if ${sym} falls to</span><b class="num">${l.liqPrice ? price(l.liqPrice) : '-'}</b></div>
        <div><span>Health</span><b class="num">${Number.isFinite(l.health) ? num(l.health, 2) : 'No debt'}</b></div>
      </div>
      ${l.debt > 0n ? dial(l.ltv, mk.lltvNum, SAFE_NUM) : ''}
      <p class="kv-foot muted">In your wallet: <span class="num">${tok(bal, D18, 6)} ${sym}</span>, <span class="num">${tok(S.me.usdg, D6, 2)} USDG</span></p>
    </div>`;
}

function mktPanel(sym) {
  const mk = market(sym);
  const lif = Number(incentive(mk.lltv)) / 1e18 - 1;
  if (!live()) {
    return `<div class="panel-head"><h3>Market</h3><span class="chip">Opens at launch</span></div>
      <div class="pad-in kv">
        <div><span>Liquidation line</span><b class="num">${pct(mk.lltvNum, 1)}</b></div>
        <div><span>Most a loan starts at</span><b class="num">${pct(mk.maxLtv, 1)}</b></div>
        <div><span>Liquidation bonus</span><b class="num">${pct(lif, 1)}</b></div>
        <div><span>Farm cap</span><b class="num">${usd(STOCKS[sym].cap, { compact: true })}</b></div>
      </div>`;
  }
  const r = reach(sym);
  return `<div class="panel-head"><h3>Market</h3>${mk.open ? `<span class="chip teal">Open</span>` : '<span class="chip">Not created</span>'}</div>
    <div class="pad-in">
      <div class="kv">
        <div><span>Borrow APY</span><b class="num">${pct(mk.borrowApy)}</b></div>
        <div><span>Most a loan starts at</span><b class="num">${pct(mk.maxLtv, 1)}</b></div>
        <div><span>Lendable now</span><b class="num">${usd(usdgNum(r))}</b></div>
        <div><span>Liquidation line</span><b class="num">${pct(mk.lltvNum, 1)}</b></div>
      </div>
      <details class="more">
        <summary>Market details</summary>
        <div class="kv">
          <div><span>Free in the market</span><b class="num">${usd(usdgNum(mk.liquidity))}</b></div>
          <div><span>Lenders earn</span><b class="num">${pct(mk.supplyApy)}</b></div>
          <div><span>Lent in</span><b class="num">${mk.m ? usd(usdgNum(mk.m.supply), { compact: true }) : '-'}</b></div>
          <div><span>Borrowed</span><b class="num">${mk.m ? usd(usdgNum(mk.m.borrow), { compact: true }) : '-'}</b></div>
          <div><span>Liquidation bonus</span><b class="num">${pct(lif, 1)}</b></div>
        </div>
        <div class="ubar" role="img" aria-label="Utilization ${pct(mk.util, 1)}"><span style="width:${Math.min(100, mk.util * 100).toFixed(2)}%"></span><i style="left:90%"></i></div>
        <p class="kv-foot muted">Utilization ${pct(mk.util, 1)}. Morpho's rate curve aims at 90%: above it the rate climbs, below it the rate eases. Lendable now counts the farm's idle USDG its agent can bring here.</p>
      </details>
    </div>`;
}

/** What Tetsu says above the forms: the one thing worth knowing about this stock and this wallet right now. */
function tipHtml(sym) {
  const mk = market(sym);
  if (!live()) return tip(`Loans open at launch. A ${sym} loan may start at up to ${pct(mk.maxLtv, 1)} of its value, and the line is ${pct(mk.lltvNum, 1)}.`);
  if (mk.stale) return tip(`${sym}'s price feed has been quiet for days, so new borrowing waits. Repaying and adding collateral still work.`);
  if (!S.account) return tip(mk.price ? `1 ${sym} at ${price(mk.price)} can borrow up to ${usd(mk.price * mk.maxLtv)} in USDG. Liquidation comes at a ${pct(mk.lltvNum, 1)} loan to value. Connect to use yours.` : `Connect a wallet and I will tell you what your ${sym} can borrow.`);
  if (!S.me) return tip('Reading your wallet...');
  const l = loan(sym, mk);
  const bal = S.me.stocks[sym] || 0n;
  if (!l.has) {
    if (bal === 0n) return tip(`This wallet holds no ${sym}. Pick a stock you hold, or send some ${sym} here first.`);
    const value = (Number(bal) / 1e18) * (mk.price || 0);
    return tip(`Your ${tok(bal, D18, 4)} ${sym} could borrow up to about ${usd(value * mk.maxLtv)} in USDG. Start lower and you keep more room.`);
  }
  const t = healthTone(l.health);
  const at = l.liqPrice ? price(l.liqPrice) : '-';
  if (t.tone === 'danger') return tip(`Careful: this loan is close to its line. Repay some USDG or add ${sym} now. Liquidation comes at ${at}.`);
  if (t.tone === 'warn') return tip(`Watch it: ${sym} at ${at} would trigger liquidation. A little more collateral buys a lot of room.`);
  return tip(`Healthy. Liquidation only if ${sym} falls to ${at}. You owe ${tok(l.debt, D6, 2)} USDG.`);
}

function forms(sym) {
  return `<div class="tabs" role="tablist" aria-label="Actions">
      <button type="button" role="tab" data-tab="borrow">Borrow</button>
      <button type="button" role="tab" data-tab="repay">Repay</button>
      <button type="button" role="tab" data-tab="withdraw">Withdraw</button>
    </div>
    <form class="act-form" data-form="borrow" novalidate>
      ${amountField({ name: 'collateral', label: `Add ${sym} as collateral`, unit: sym, maxText: 'Wallet' })}
      ${amountField({ name: 'borrow', label: 'Borrow USDG', unit: 'USDG', maxText: 'Max' })}
      <div class="pv" data-pv="borrow"></div>
      <button class="btn coral block" type="submit" data-go="borrow">Borrow</button>
      <div data-steps="borrow"></div>
    </form>
    <form class="act-form" data-form="repay" novalidate hidden>
      ${amountField({ name: 'repay', label: 'Repay USDG', unit: 'USDG', maxText: 'All' })}
      <label class="check" hidden><input type="checkbox" name="takeback" checked><span>When the loan is fully repaid, give me back all my ${sym}</span></label>
      <div class="pv" data-pv="repay"></div>
      <button class="btn coral block" type="submit" data-go="repay">Repay</button>
      <div data-steps="repay"></div>
    </form>
    <form class="act-form" data-form="withdraw" novalidate hidden>
      ${amountField({ name: 'take', label: `Withdraw ${sym}`, unit: sym, maxText: 'Max' })}
      <div class="pv" data-pv="withdraw"></div>
      <button class="btn coral block" type="submit" data-go="withdraw">Withdraw</button>
      <div data-steps="withdraw"></div>
    </form>`;
}

/* ------------------------------------------------------------------------------------------------ previews */

function blockReason(sym, which) {
  const mk = market(sym);
  if (!live()) return 'Lending opens when the contracts launch.';
  if (!mk.open) return 'This market is not open yet.';
  if (!S.account) return 'connect';
  if (!S.me) return 'Reading your wallet...';
  if (S.busy) return 'A transaction is running.';
  if ((which === 'borrow' || which === 'withdraw') && (mk.stale || !mk.oraclePrice)) return `The ${sym} price feed is stale, so borrowing and withdrawing are paused until it updates.`;
  return '';
}

function pvRow(label, before, after, tone = '') { return `<div class="pv-row ${tone}"><span>${label}</span><b class="num">${before}${after !== undefined ? ` <i>to</i> ${after}` : ''}</b></div>`; }

function previewBorrow(el, sym) {
  const f = el.querySelector('[data-form="borrow"]');
  const pv = f.querySelector('[data-pv="borrow"]');
  const btn = f.querySelector('[data-go="borrow"]');
  const mk = market(sym);
  const add = readInput(f.elements.collateral, D18);
  const amt = readInput(f.elements.borrow, D6);
  const block = blockReason(sym, 'borrow');
  const errs = [];
  if (add === null) errs.push(`Enter the ${sym} amount as a number, up to 18 decimals.`);
  if (amt === null) errs.push('Enter the USDG amount as a number, up to 6 decimals.');
  let html = '';
  let ok = !block && !errs.length && ((add || 0n) > 0n || (amt || 0n) > 0n);
  if (!errs.length && mk.price && ((add || 0n) > 0n || (amt || 0n) > 0n)) {
    const now = S.me ? loan(sym, mk) : { collateral: 0n, debt: 0n, ltv: 0, liqPrice: null };
    const p = project(sym, add || 0n, amt || 0n, mk);
    const bal = S.me?.stocks?.[sym] ?? 0n;
    if (S.me && (add || 0n) > bal) { errs.push(`Your wallet holds ${tok(bal, D18, 6)} ${sym}.`); ok = false; }
    if (p.over && (amt || 0n) > 0n) { errs.push(`That starts the loan at ${pct(p.ltv, 1)}. The most is ${pct(mk.maxLtv, 1)}: borrow less or add more ${sym}.`); ok = false; }
    if (live() && (amt || 0n) > reach(sym)) { errs.push(`Only ${usd(usdgNum(reach(sym)))} can reach this market right now.`); ok = false; }
    html = pvRow('Collateral', `${tok(now.collateral, D18, 4)}`, `${tok(p.collateral, D18, 4)} ${sym}`)
      + pvRow('You owe', `${tok(now.debt, D6, 2)}`, `${tok(p.debt, D6, 2)} USDG`)
      + pvRow('Loan to value', pct(now.ltv || 0, 1), pct(p.ltv, 1), p.over ? 'bad' : '')
      + pvRow('Liquidated at', now.liqPrice ? price(now.liqPrice) : '-', p.liqPrice ? price(p.liqPrice) : '-')
      + (live() && mk.open ? pvRow('Borrow APY now', pct(mk.borrowApy)) : '');
  }
  put(pv, html + errs.map((e) => `<p class="pv-err">${esc(e)}</p>`).join('') + (block && block !== 'connect' ? `<p class="pv-note">${esc(block)}</p>` : ''));
  const a = (add || 0n) > 0n, b = (amt || 0n) > 0n;
  btn.textContent = block === 'connect' ? 'Connect wallet' : a && b ? 'Deposit and borrow' : a ? `Add ${sym}` : 'Borrow';
  btn.disabled = block === 'connect' ? false : !ok;
  if (block === 'connect') btn.dataset.needsWallet = '1'; else delete btn.dataset.needsWallet;
}

function previewRepay(el, sym) {
  const f = el.querySelector('[data-form="repay"]');
  const pv = f.querySelector('[data-pv="repay"]');
  const btn = f.querySelector('[data-go="repay"]');
  const mk = market(sym);
  const amt = readInput(f.elements.repay, D6);
  const block = blockReason(sym, 'repay');
  f.dataset.full = '';
  f.querySelector('.check').hidden = true;
  const errs = [];
  if (amt === null) errs.push('Enter the USDG amount as a number, up to 6 decimals.');
  let ok = !block && !errs.length && (amt || 0n) > 0n;
  let html = '';
  if (S.me && !errs.length && (amt || 0n) > 0n) {
    const l = loan(sym, mk);
    if (l.debt === 0n) { errs.push(`You have no ${sym} loan to repay.`); ok = false; }
    const full = (amt || 0n) >= l.debt && l.debt > 0n;
    f.dataset.full = full ? '1' : '';
    const need = full ? l.debt : amt || 0n;
    if (need > S.me.usdg) { errs.push(`Your wallet holds ${tok(S.me.usdg, D6, 2)} USDG${full ? `; repaying everything takes about ${tok(l.debt, D6, 2)}` : ''}.`); ok = false; }
    const p = project(sym, 0n, -(full ? l.debt : amt || 0n), mk);
    html = pvRow('You owe', tok(l.debt, D6, 2), `${full ? '0' : tok(p.debt, D6, 2)} USDG`)
      + pvRow('Loan to value', pct(l.ltv || 0, 1), full ? '0%' : pct(p.ltv, 1))
      + (full ? '<p class="pv-note">This repays the whole loan, interest to the second.</p>' : '');
    f.querySelector('.check').hidden = !full;
  }
  put(pv, html + errs.map((e) => `<p class="pv-err">${esc(e)}</p>`).join('') + (block && block !== 'connect' ? `<p class="pv-note">${esc(block)}</p>` : ''));
  btn.textContent = block === 'connect' ? 'Connect wallet' : f.dataset.full ? 'Repay everything' : 'Repay';
  btn.disabled = block === 'connect' ? false : !ok;
  if (block === 'connect') btn.dataset.needsWallet = '1'; else delete btn.dataset.needsWallet;
}

function previewWithdraw(el, sym) {
  const f = el.querySelector('[data-form="withdraw"]');
  const pv = f.querySelector('[data-pv="withdraw"]');
  const btn = f.querySelector('[data-go="withdraw"]');
  const mk = market(sym);
  const amt = readInput(f.elements.take, D18);
  const block = blockReason(sym, 'withdraw');
  const errs = [];
  if (amt === null) errs.push(`Enter the ${sym} amount as a number, up to 18 decimals.`);
  let ok = !block && !errs.length && (amt || 0n) > 0n;
  let html = '';
  if (S.me && !errs.length && (amt || 0n) > 0n) {
    const l = loan(sym, mk);
    if ((amt || 0n) > l.canWithdraw) { errs.push(l.debt > 0n ? `With your loan open you can take out up to ${tok(l.canWithdraw, D18, 6)} ${sym}. Repay first to take more.` : `You have ${tok(l.collateral, D18, 6)} ${sym} deposited.`); ok = false; }
    const p = project(sym, -(amt || 0n), 0n, mk);
    html = pvRow('Collateral', tok(l.collateral, D18, 4), `${tok(p.collateral, D18, 4)} ${sym}`) + (l.debt > 0n ? pvRow('Loan to value', pct(l.ltv, 1), pct(p.ltv, 1), p.over ? 'bad' : '') + pvRow('Liquidated at', l.liqPrice ? price(l.liqPrice) : '-', p.liqPrice ? price(p.liqPrice) : '-') : '');
  }
  put(pv, html + errs.map((e) => `<p class="pv-err">${esc(e)}</p>`).join('') + (block && block !== 'connect' ? `<p class="pv-note">${esc(block)}</p>` : ''));
  btn.textContent = block === 'connect' ? 'Connect wallet' : 'Withdraw';
  btn.disabled = block === 'connect' ? false : !ok;
  if (block === 'connect') btn.dataset.needsWallet = '1'; else delete btn.dataset.needsWallet;
}

function maxFor(name, sym) {
  const mk = market(sym);
  if (!S.me) return null;
  const l = loan(sym, mk);
  if (name === 'collateral') return { raw: S.me.stocks[sym] || 0n, d: D18, dp: 6 };
  if (name === 'borrow') {
    const el = document.querySelector('[data-form="borrow"]');
    const add = readInput(el.elements.collateral, D18) || 0n;
    const cap = l.canBorrow + (mk.oraclePrice ? ((add * mk.oraclePrice) / 10n ** 36n) * BigInt(Math.floor(mk.maxLtv * 1e9)) / 10n ** 9n : 0n);
    const r = live() ? reach(sym) : 0n;
    const raw = cap < r ? cap : r;
    return { raw: raw > 0n ? (raw * 999n) / 1000n : 0n, d: D6, dp: 2 }; // a hair under, so a second of interest cannot tip it over
  }
  if (name === 'repay') return { raw: l.debt <= S.me.usdg ? l.debt : S.me.usdg, d: D6, dp: 6 };
  if (name === 'take') return { raw: l.canWithdraw, d: D18, dp: 18 };
  return null;
}

/* ------------------------------------------------------------------------------------------------ the view */

export default {
  title: (sym) => sym,
  render(sym) {
    if (!STOCKS[sym]) return `<div class="empty panel">There is no market for "${esc(sym)}". <a href="#/markets">See all 35 stocks</a>.</div>`;
    return `<a class="back" href="#/markets">${ICON.back}<span>All markets</span></a>
      <section class="shead" data-live="head"></section>
      <div class="sgrid">
        <div class="scol">
          <section class="panel" data-live="pos"></section>
          <section class="panel" data-live="mkt"></section>
        </div>
        <section class="panel act" data-act><div data-live="tip"></div>${forms(sym)}</section>
      </div>`;
  },
  mount(el, sym) {
    if (!STOCKS[sym]) return;
    const act = el.querySelector('[data-act]');
    const show = (t) => {
      tab = t;
      for (const b of act.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
      for (const f of act.querySelectorAll('[data-form]')) f.hidden = f.dataset.form !== t;
    };
    show(tab);
    act.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { show(t.dataset.tab); this.update(el, sym); return; }
      const m = e.target.closest('[data-max]');
      if (m && !S.account) { document.dispatchEvent(new CustomEvent('tsu:connect')); return; } // MAX needs a wallet to read
      if (m) {
        const x = maxFor(m.dataset.max, sym);
        const input = act.querySelector(`input[name="${m.dataset.max}"]`);
        if (x && input) setMax(input, x.raw, x.d, x.dp);
      }
    });
    act.addEventListener('input', (e) => {
      const input = e.target.closest('input[type="text"]');
      if (input && input.dataset.shown !== undefined && input.value !== input.dataset.shown) { delete input.dataset.raw; delete input.dataset.shown; }
      this.previews(el, sym);
    });
    act.addEventListener('submit', (e) => { e.preventDefault(); this.go(el, sym, e.target.dataset.form); });
    this.update(el, sym);
  },
  previews(el, sym) { previewBorrow(el, sym); previewRepay(el, sym); previewWithdraw(el, sym); },
  update(el, sym) {
    if (!STOCKS[sym]) return;
    put(el.querySelector('[data-live="head"]'), head(sym));
    put(el.querySelector('[data-live="tip"]'), tipHtml(sym));
    put(el.querySelector('[data-live="pos"]'), posPanel(sym));
    put(el.querySelector('[data-live="mkt"]'), mktPanel(sym));
    for (const k of ['borrow', 'repay', 'withdraw']) {
      const box = el.querySelector(`[data-steps="${k}"]`);
      const steps = stepsBy[`${sym}:${k}`];
      if (box) box.innerHTML = steps ? stepsHtml(steps) : '';
    }
    this.previews(el, sym);
  },
  async go(el, sym, which) {
    const f = el.querySelector(`[data-form="${which}"]`);
    const btn = f.querySelector('[data-go]');
    if (btn.dataset.needsWallet === '1') { document.dispatchEvent(new CustomEvent('tsu:connect')); return; }
    let plan = null;
    if (which === 'borrow') plan = borrowPlan(sym, readInput(f.elements.collateral, D18) || 0n, readInput(f.elements.borrow, D6) || 0n);
    if (which === 'repay') {
      const full = f.dataset.full === '1';
      plan = repayPlan(sym, readInput(f.elements.repay, D6) || 0n, { full, withdrawAll: full && f.elements.takeback.checked });
    }
    if (which === 'withdraw') plan = withdrawCollateralPlan(sym, readInput(f.elements.take, D18) || 0n);
    if (!plan || !plan.length) return;
    const key = `${sym}:${which}`;
    const box = f.querySelector(`[data-steps="${which}"]`);
    const res = await run(plan, (steps) => { stepsBy[key] = steps; box.innerHTML = stepsHtml(steps); }, () => document.dispatchEvent(new CustomEvent('tsu:refresh')));
    if (res.ok) {
      for (const i of f.querySelectorAll('input[type="text"]')) { i.value = ''; delete i.dataset.raw; delete i.dataset.shown; }
      document.dispatchEvent(new CustomEvent('tsu:toast', { detail: { kind: 'ok', html: which === 'borrow' ? 'Done. Your loan is updated.' : which === 'repay' ? 'Repaid.' : `Your ${sym} is back in your wallet.` } }));
    }
    this.previews(el, sym);
  },
};
