// #/portfolio: the connected wallet: loans first (riskiest on top), farm deposits, then what is in the wallet.
import { SYMBOLS, FARMS, USDG } from '../../config.js';
import { S } from '../store.js';
import { market, myLoans, farm, healthTone, live, usdgNum } from '../derive.js';
import { esc, usd, pct, price, tok, num, short } from '../../lib/format.js';
import { logo, agentImg, healthBar, ICON, put } from '../ui.js';

function loansHtml() {
  const list = myLoans();
  if (!list.length) return `<div class="empty-in"><p>No loans. ${live() ? 'Pick a stock in <a href="#/markets">Markets</a> to borrow against it.' : 'Loans open at launch.'}</p></div>`;
  return list.map(({ sym, mk, l }) => {
    const t = healthTone(l.health);
    return `<a class="loan-card" href="#/stock/${sym}">
      <div class="loan-top">${logo(sym)}<div><b class="display">${sym}</b><small class="muted">${esc(mk.name)}</small></div><span class="chip ${t.tone}">${t.word}</span></div>
      <div class="kv">
        <div><span>Collateral</span><b class="num">${tok(l.collateral, 18, 4)} ${sym}</b></div>
        <div><span>You owe</span><b class="num">${tok(l.debt, USDG.decimals, 2)} USDG</b></div>
        <div><span>Loan to value</span><b class="num">${pct(l.ltv, 1)}</b></div>
        <div><span>Liquidated at</span><b class="num">${l.liqPrice ? price(l.liqPrice) : '-'}</b></div>
      </div>
      ${l.debt > 0n ? healthBar(l.ltv, mk.lltvNum) : ''}
    </a>`;
  }).join('');
}

function farmsHtml() {
  const rows = FARMS.map((cfg) => ({ cfg, f: farm(cfg.key) })).filter((x) => (x.f.mine.shares || 0n) > 0n);
  if (!rows.length) return `<div class="empty-in"><p>No farm deposits. ${live() ? '<a href="#/farms">Pick an agent</a> to lend USDG through.' : 'Farms open at launch.'}</p></div>`;
  return rows.map(({ cfg, f }) => `<a class="frow" href="#/farm/${cfg.key}">
    <img src="${agentImg(cfg.key)}" alt="" width="48" height="48"><div><b class="display">${esc(cfg.agent)}</b><small class="muted">${esc(cfg.role)}</small></div>
    <div class="frow-n"><b class="num">${usd(usdgNum(f.mine.assets))}</b><small class="muted">${pct(f.apy)} APY</small></div></a>`).join('');
}

function walletHtml() {
  const held = SYMBOLS.filter((s) => (S.me.stocks[s] || 0n) > 0n);
  const eth = Number(S.me.eth) / 1e18;
  return `<div class="kv">
      <div><span>USDG</span><b class="num">${tok(S.me.usdg, USDG.decimals, 2)}</b></div>
      <div><span>ETH for gas</span><b class="num">${num(eth, 6)}</b></div>
    </div>
    ${eth < 0.00005 ? '<p class="pv-err">Your wallet has almost no ETH on Robinhood Chain. Every transaction needs a little for gas.</p>' : ''}
    <p class="sub-h">Stock tokens</p>
    ${held.length ? `<div class="hold">${held.map((s) => { const mk = market(s); const amt = Number(S.me.stocks[s]) / 1e18; return `<a class="hold-row" href="#/stock/${s}">${logo(s, 's')}<b>${s}</b><span class="num">${num(amt, 6)}</span><span class="num muted">${mk.price ? usd(amt * mk.price) : '-'}</span></a>`; }).join('')}</div>`
      : '<p class="muted">This wallet holds none of the 35 stock tokens.</p>'}`;
}

function totals() {
  let coll = 0, debt = 0, dep = 0;
  for (const { mk, l } of myLoans()) { coll += mk.price ? (Number(l.collateral) / 1e18) * mk.price : 0; debt += usdgNum(l.debt); }
  for (const cfg of FARMS) dep += usdgNum(farm(cfg.key).mine.assets || 0n);
  return `<div class="vstat"><p>Collateral</p><p class="num">${usd(coll, { compact: true })}</p></div>
    <div class="vstat"><p>Borrowed</p><p class="num">${usd(debt, { compact: true })}</p></div>
    <div class="vstat"><p>In farms</p><p class="num">${usd(dep, { compact: true })}</p></div>`;
}

export default {
  title: 'Portfolio',
  render() {
    return `<section class="vhead">
      <div class="vhead-id"><span class="vh-sticker" aria-hidden="true">帳</span><div class="vhead-txt">
        <p class="eyebrow"><span>Portfolio</span><span class="kana">ポートフォリオ</span></p>
        <h1 class="vtitle display">Your desk</h1>
        <p class="vsub" data-live="who"></p>
      </div></div>
      <div class="vstats" data-live="totals"></div>
    </section>
    <div data-live="body"></div>`;
  },
  mount(el) { this.update(el); },
  update(el) {
    const who = el.querySelector('[data-live="who"]');
    const body = el.querySelector('[data-live="body"]');
    if (!S.account) {
      put(who, 'Connect a wallet to see your loans, your farm deposits and your stock tokens.');
      put(el.querySelector('[data-live="totals"]'), '');
      put(body, `<div class="panel pad connect-card"><img src="/img/brand/logo-128.png" alt="" width="72" height="72"><div><p class="display">No wallet yet</p><p class="muted">Tetsu Corp never holds your keys. Connect the wallet that holds your stock tokens or USDG.</p></div><button class="btn coral" type="button" data-connect>${ICON.wallet}Connect wallet</button></div>`);
      return;
    }
    put(who, `Wallet <span class="num">${short(S.account)}</span> on Robinhood Chain.`);
    if (!S.me) { put(body, '<div class="empty panel">Reading your wallet from Robinhood Chain...</div>'); return; }
    put(el.querySelector('[data-live="totals"]'), totals());
    put(body, `<div class="pgrid">
      <section class="panel"><div class="panel-head"><h3>Loans</h3><span class="kana muted">借入</span></div><div class="pad-in loans">${loansHtml()}</div></section>
      <div class="scol">
        <section class="panel"><div class="panel-head"><h3>Farm deposits</h3><span class="kana muted">預金</span></div><div class="pad-in">${farmsHtml()}</div></section>
        <section class="panel"><div class="panel-head"><h3>Wallet</h3><span class="kana muted">財布</span></div><div class="pad-in">${walletHtml()}</div></section>
      </div>
    </div>`);
  },
};
