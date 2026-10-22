// #/farm/KEY: one agent's farm: deposit and withdraw, where its USDG sits, and its console.
import { FARMS, USDG, stocksOf, STOCKS } from '../../config.js';
import { S } from '../store.js';
import { farm, farmCfg, market, live, usdgNum, nowSec } from '../derive.js';
import { esc, usd, pct, ago, tok, parseAmount, formatUnits, num } from '../../lib/format.js';
import { ICON, agentImg, logo, amountField, stepsHtml, txLink, put, tip } from '../ui.js';
import { depositPlan, farmWithdrawPlan, wakePlan, run } from '../flows.js';

const D6 = USDG.decimals;
let tab = 'deposit';
const stepsBy = {};
const MODES = ['ran its playbook', 'placed a deposit', 'brought USDG to a borrower', 'freed cash for a withdrawal'];

function readInput(input) {
  if (input.dataset.raw && input.value === input.dataset.shown) return BigInt(input.dataset.raw);
  return parseAmount(input.value || '0', D6);
}

function head(key) {
  const cfg = farmCfg(key);
  const f = farm(key);
  const isLive = live() && f.deployed;
  return `<div class="fhead-pic"><img src="${agentImg(key, 320)}" alt="${esc(cfg.agent)}" width="320" height="320"></div>
    <div class="fhead-txt">
      <p class="kana fcard-kana">${esc(cfg.kana)}</p>
      <h1 class="display">${esc(cfg.agent)}</h1>
      <p class="fhead-role">${esc(cfg.role)}. ${esc(cfg.blurb)}</p>
    </div>
    <dl class="fhead-stats">
        <div><dt>Farm APY</dt><dd class="num">${isLive ? pct(f.apy) : '-'}</dd></div>
        <div><dt>Deposits</dt><dd class="num">${isLive ? usd(usdgNum(f.totalAssets)) : '-'}</dd></div>
        <div><dt>Cash on hand</dt><dd class="num">${isLive ? usd(usdgNum(f.idle)) : '-'}</dd></div>
        <div><dt>Yours</dt><dd class="num">${S.account && isLive ? usd(usdgNum(f.mine.assets || 0n)) : '-'}</dd></div>
    </dl>`;
}

function forms() {
  return `<div class="tabs" role="tablist" aria-label="Actions">
      <button type="button" role="tab" data-tab="deposit">Deposit</button>
      <button type="button" role="tab" data-tab="withdraw">Withdraw</button>
    </div>
    <form class="act-form" data-form="deposit" novalidate>
      ${amountField({ name: 'dep', label: 'Deposit USDG', unit: 'USDG', maxText: 'Wallet' })}
      <div class="pv" data-pv="deposit"></div>
      <button class="btn coral block" type="submit" data-go>Deposit</button>
      <div data-steps="deposit"></div>
    </form>
    <form class="act-form" data-form="withdraw" novalidate hidden>
      ${amountField({ name: 'wd', label: 'Withdraw USDG', unit: 'USDG', maxText: 'All' })}
      <div class="pv" data-pv="withdraw"></div>
      <button class="btn coral block" type="submit" data-go>Withdraw</button>
      <div data-steps="withdraw"></div>
    </form>`;
}

function block() {
  if (!live()) return 'The farms open when the contracts launch.';
  if (!S.account) return 'connect';
  if (!S.me) return 'Reading your wallet...';
  if (S.busy) return 'A transaction is running.';
  return '';
}

function previews(el, key) {
  const f = farm(key);
  const cfg = farmCfg(key);
  // deposit
  {
    const form = el.querySelector('[data-form="deposit"]');
    const amt = readInput(form.elements.dep);
    const b = block();
    const errs = [];
    if (amt === null) errs.push('Enter the amount as a number, up to 6 decimals.');
    let ok = !b && !errs.length && amt > 0n;
    if (S.me && amt !== null && amt > S.me.usdg) { errs.push(`Your wallet holds ${tok(S.me.usdg, D6, 2)} USDG.`); ok = false; }
    const yearly = amt && f.apy ? usdgNum(amt) * f.apy : 0;
    form.querySelector('[data-pv]').innerHTML = (amt > 0n && live()
      ? `<div class="pv-row"><span>At today's ${pct(f.apy)} APY</span><b class="num">${usd(yearly)} a year</b></div><p class="pv-note">${esc(cfg.agent)} places it with borrowers in the same transaction. The APY moves with borrowing.</p>`
      : '') + errs.map((e) => `<p class="pv-err">${esc(e)}</p>`).join('') + (b && b !== 'connect' ? `<p class="pv-note">${esc(b)}</p>` : '');
    const btn = form.querySelector('[data-go]');
    btn.textContent = b === 'connect' ? 'Connect wallet' : `Deposit with ${cfg.agent}`;
    btn.disabled = b === 'connect' ? false : !ok;
    if (b === 'connect') btn.dataset.needsWallet = '1'; else delete btn.dataset.needsWallet;
  }
  // withdraw
  {
    const form = el.querySelector('[data-form="withdraw"]');
    const amt = readInput(form.elements.wd);
    const b = block();
    const errs = [];
    if (amt === null) errs.push('Enter the amount as a number, up to 6 decimals.');
    let ok = !b && !errs.length && amt > 0n;
    const mine = f.mine.assets || 0n;
    const all = form.elements.wd.dataset.all === '1' && form.elements.wd.value === form.elements.wd.dataset.shown;
    if (S.me && amt !== null && amt > mine && !all) { errs.push(`You hold ${tok(mine, D6, 2)} USDG in this farm.`); ok = false; }
    let html = '';
    if (amt > 0n && live()) {
      const short = amt > f.idle;
      html = `<div class="pv-row"><span>Cash on hand</span><b class="num">${usd(usdgNum(f.idle))}</b></div>`
        + (short ? `<p class="pv-note">That is more than the farm holds in cash, so ${esc(cfg.agent)} frees the rest from its quietest markets first (one more confirmation).</p>` : '');
    }
    form.querySelector('[data-pv]').innerHTML = html + errs.map((e) => `<p class="pv-err">${esc(e)}</p>`).join('') + (b && b !== 'connect' ? `<p class="pv-note">${esc(b)}</p>` : '');
    const btn = form.querySelector('[data-go]');
    btn.textContent = b === 'connect' ? 'Connect wallet' : all ? 'Withdraw everything' : 'Withdraw';
    btn.disabled = b === 'connect' ? false : !ok;
    if (b === 'connect') btn.dataset.needsWallet = '1'; else delete btn.dataset.needsWallet;
  }
}

function consolePanel(key) {
  const cfg = farmCfg(key);
  const f = farm(key);
  if (!live() || !f.deployed) {
    return `<div class="panel-head"><h3>${esc(cfg.agent)} console</h3><span class="chip">Boots at launch</span></div>
      ${tip(`Booting at launch. Then I place this farm's USDG across these ${stocksOf(key).length} markets, wherever borrowers pay.`, { agent: key, name: cfg.agent })}
      <div class="pad-in"><p class="muted">Until then, here is what ${esc(cfg.agent)} will lend against.</p>
      <div class="alloc">${stocksOf(key).map((s) => `<div class="alloc-row">${logo(s, 's')}<b>${s}</b><span class="muted">${esc(STOCKS[s].name)}</span><span class="num">cap ${usd(STOCKS[s].cap, { compact: true })}</span></div>`).join('')}</div></div>`;
  }
  const p = f.params;
  const wait = p ? Math.max(0, f.lastWork + p.workInterval - nowSec()) : 0;
  const rows = [...f.rows].sort((a, b) => (b.ours > a.ours ? 1 : b.ours < a.ours ? -1 : 0));
  const placedSyms = new Set(rows.map((r) => r.sym));
  const idleSyms = stocksOf(key).filter((s) => !placedSyms.has(s));
  const say = `Watching ${f.rows.length || stocksOf(key).length} markets. ${usd(usdgNum(f.idle))} in cash for withdrawals, ${usd(usdgNum(f.placed))} placed with borrowers. ${wait > 0 ? `Anyone can wake me again in ${Math.ceil(wait / 60)} min.` : 'Ready: anyone can wake me now.'}`;
  return `<div class="panel-head"><h3>${esc(cfg.agent)} console</h3><span class="chip teal"><span class="dot live"></span>On duty</span></div>
    ${tip(say, { agent: key, name: cfg.agent })}
    <div class="pad-in">
      <div class="wake">
        <div>
          <p class="wake-t">Wake ${esc(cfg.agent)}</p>
          <p class="muted">Anyone can make the agent run its playbook now. It moves USDG toward the markets borrowers use. ${wait > 0 ? `Public wake opens in ${Math.ceil(wait / 60)} min.` : ''}</p>
        </div>
        ${S.account ? `<button class="btn ink" type="button" data-wake ${wait > 0 || S.busy ? 'disabled' : ''}>${ICON.bolt}Wake</button>` : `<button class="btn ink" type="button" data-connect>${ICON.wallet}Connect to wake</button>`}
      </div>
      <div data-steps="wake"></div>
      ${p ? `<div class="params">
        <div><span>Hold back</span><b class="num">${pct(p.idleBps / 10000, 0)}</b></div>
        <div><span>Fill to</span><b class="num">${pct(Number(p.targetUtilization) / 1e18, 0)} use</b></div>
        <div><span>Buffer per market</span><b class="num">${usd(usdgNum(p.buffer), { compact: true })}</b></div>
        <div><span>Last run</span><b class="num">${f.lastWork ? ago(nowSec() - f.lastWork) : 'not yet'}</b></div>
      </div>` : ''}
      <p class="sub-h">Where the USDG is</p>
      <div class="alloc">
        <div class="alloc-row idle"><span class="alloc-ico">${ICON.wallet}</span><b>Cash</b><span class="muted">kept for withdrawals</span><span class="num">${usd(usdgNum(f.idle))}</span></div>
        ${rows.map((r) => {
          const mk = r.mk;
          const util = r.supply > 0n ? Number((r.borrow * 10n ** 9n) / r.supply) / 1e9 : 0;
          return `<a class="alloc-row" href="#/stock/${r.sym}">${logo(r.sym, 's')}<b>${r.sym}</b><span class="muted">${pct(util, 0)} used, ${mk ? pct(mk.supplyApy) : '-'} APY</span><span class="num">${usd(usdgNum(r.ours))}</span></a>`;
        }).join('')}
        ${idleSyms.length ? `<p class="alloc-more muted">Nothing placed yet in ${idleSyms.join(', ')}.</p>` : ''}
      </div>
    </div>`;
}

function logPanel(key) {
  const cfg = farmCfg(key);
  const items = S.log.filter((x) => x.farm === key).slice(0, 24);
  const now = S.pub?.now || Math.floor(Date.now() / 1000);
  const line = (x) => {
    const when = x.time ? ago(Math.max(0, now - x.time)) : '';
    if (x.kind === 'placed') return `<span class="lg-k ok">PLACE</span><span>${usd(usdgNum(BigInt(x.assets)))} into ${x.sym || 'a market'}</span>`;
    if (x.kind === 'lifted') return `<span class="lg-k">LIFT</span><span>${usd(usdgNum(BigInt(x.assets)))} out of ${x.sym || 'a market'}</span>`;
    return `<span class="lg-k sun">RUN</span><span>${esc(cfg.agent)} ${MODES[x.mode] || 'ran'}${x.caller ? ` for ${x.caller.slice(0, 6)}...${x.caller.slice(-4)}` : ''}</span>`;
  };
  return `<div class="panel-head"><h3>Agent log</h3><span class="kana muted">記録</span></div>
    <div class="log">${items.length ? items.map((x) => `<div class="lg">${line(x)}<span class="lg-t muted">${x.time ? ago(Math.max(0, now - x.time)) : ''} ${x.tx ? txLink(x.tx, '') : ''}</span></div>`).join('') : `<p class="muted lg-empty">${live() ? 'No moves yet. The first deposit wakes it.' : 'The log starts at launch.'}</p>`}</div>`;
}

export default {
  title: (key) => farmCfg(key)?.agent || 'Farm',
  render(key) {
    if (!farmCfg(key)) return `<div class="empty panel">No farm called "${esc(key)}". <a href="#/farms">See the three farms</a>.</div>`;
    return `<a class="back" href="#/farms">${ICON.back}<span>All farms</span></a>
      <section class="fhead panel night" data-live="head"></section>
      <div class="sgrid">
        <div class="scol">
          <section class="panel" data-live="console"></section>
          <section class="panel night" data-live="log"></section>
        </div>
        <section class="panel act" data-act>${forms()}</section>
      </div>`;
  },
  mount(el, key) {
    if (!farmCfg(key)) return;
    const act = el.querySelector('[data-act]');
    const show = (t) => {
      tab = t;
      for (const b of act.querySelectorAll('[data-tab]')) { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
      for (const f of act.querySelectorAll('[data-form]')) f.hidden = f.dataset.form !== t;
    };
    show(tab);
    act.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { show(t.dataset.tab); previews(el, key); return; }
      const m = e.target.closest('[data-max]');
      if (m && !S.account) { document.dispatchEvent(new CustomEvent('tsu:connect')); return; } // MAX needs a wallet to read
      if (!m || !S.me) return;
      const input = act.querySelector(`input[name="${m.dataset.max}"]`);
      const f = farm(key);
      const raw = m.dataset.max === 'dep' ? S.me.usdg : f.mine.assets || 0n;
      input.dataset.raw = String(raw);
      input.dataset.shown = formatUnits(raw, D6);
      input.dataset.all = m.dataset.max === 'wd' ? '1' : '';
      input.value = input.dataset.shown;
      previews(el, key);
    });
    act.addEventListener('input', (e) => {
      const i = e.target;
      if (i.dataset && i.dataset.shown !== undefined && i.value !== i.dataset.shown) { delete i.dataset.raw; delete i.dataset.shown; delete i.dataset.all; }
      previews(el, key);
    });
    act.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('[data-go]');
      if (btn.dataset.needsWallet === '1') { document.dispatchEvent(new CustomEvent('tsu:connect')); return; }
      const which = form.dataset.form;
      const input = which === 'deposit' ? form.elements.dep : form.elements.wd;
      const amt = readInput(input) || 0n;
      const all = which === 'withdraw' && input.dataset.all === '1' && input.value === input.dataset.shown;
      const plan = which === 'deposit' ? depositPlan(key, amt) : farmWithdrawPlan(key, amt, { all });
      const box = form.querySelector(`[data-steps="${which}"]`);
      const res = await run(plan, (steps) => { stepsBy[`${key}:${which}`] = steps; box.innerHTML = stepsHtml(steps); }, () => document.dispatchEvent(new CustomEvent('tsu:refresh')));
      if (res.ok) {
        input.value = ''; delete input.dataset.raw; delete input.dataset.shown; delete input.dataset.all;
        document.dispatchEvent(new CustomEvent('tsu:toast', { detail: { kind: 'ok', html: which === 'deposit' ? `${esc(farmCfg(key).agent)} has your USDG and is farming it.` : 'Withdrawn to your wallet.' } }));
      }
      previews(el, key);
    });
    // on the console section, not on #view: #view outlives this page and would collect one listener per visit
    el.querySelector('[data-live="console"]').addEventListener('click', async (e) => {
      if (!e.target.closest('[data-wake]') || S.busy) return;
      const box = el.querySelector('[data-steps="wake"]');
      const res = await run(wakePlan(key), (steps) => { stepsBy[`${key}:wake`] = steps; box.innerHTML = stepsHtml(steps); }, () => document.dispatchEvent(new CustomEvent('tsu:refresh')));
      if (res.ok) document.dispatchEvent(new CustomEvent('tsu:toast', { detail: { kind: 'ok', html: `${esc(farmCfg(key).agent)} ran its playbook.` } }));
    });
    this.update(el, key);
  },
  update(el, key) {
    if (!farmCfg(key)) return;
    put(el.querySelector('[data-live="head"]'), head(key));
    put(el.querySelector('[data-live="console"]'), consolePanel(key));
    put(el.querySelector('[data-live="log"]'), logPanel(key));
    for (const k of ['deposit', 'withdraw', 'wake']) {
      const box = el.querySelector(`[data-steps="${k}"]`);
      if (box && stepsBy[`${key}:${k}`]) box.innerHTML = stepsHtml(stepsBy[`${key}:${k}`]);
    }
    previews(el, key);
  },
};
