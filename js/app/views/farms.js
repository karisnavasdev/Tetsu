// #/farms: the three agents and their farms.
import { FARMS, USDG, stocksOf } from '../../config.js';
import { S } from '../store.js';
import { farm, live, usdgNum } from '../derive.js';
import { esc, usd, pct, ago } from '../../lib/format.js';
import { agentImg, logo, put } from '../ui.js';

const SEGS = { sora: { risk: 2, margin: 5 }, kira: { risk: 4, margin: 3 }, raiden: { risk: 6, margin: 2 } };
const segs = (on, total = 6) => Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');

const riskTone = { sora: 'teal', kira: 'sun', raiden: 'coral' };

function card(cfg) {
  const f = farm(cfg.key);
  const list = stocksOf(cfg.key);
  const mine = f.mine.assets || 0n;
  const isLive = live() && f.deployed;
  const last = S.log.find((x) => x.farm === cfg.key);
  return `<a class="fcard panel" href="#/farm/${cfg.key}">
    <div class="fcard-pic"><img src="${agentImg(cfg.key, 320)}" alt="" width="320" height="320" loading="lazy"><span class="fcard-p1" aria-hidden="true">P1</span><span class="agent-tag display">${esc(cfg.agent)}</span>${isLive ? '<span class="fcard-on"><span class="dot live"></span>On duty</span>' : ''}</div>
    <div class="fcard-body">
      <p class="kana fcard-kana">${esc(cfg.kana)}</p>
      <h2 class="display">${esc(cfg.role)}</h2>
      <p class="muted">${esc(cfg.blurb)}</p>
      <div class="fcard-chips"><span class="chip ${riskTone[cfg.key]}">Risk: ${esc(cfg.risk.toLowerCase())}</span><span class="chip">${list.length} stocks</span></div>
      <div class="fc-bars"><span>Risk</span><span class="sbar risk">${segs(SEGS[cfg.key].risk)}</span><span>Safety margin</span><span class="sbar margin">${segs(SEGS[cfg.key].margin)}</span></div>
      <div class="fcard-logos">${list.slice(0, 8).map((s) => logo(s, 's')).join('')}${list.length > 8 ? `<span class="more">+${list.length - 8}</span>` : ''}</div>
      <dl class="fcard-stats">
        <div><dt>Farm APY</dt><dd class="num">${isLive ? pct(f.apy) : 'soon'}</dd></div>
        <div><dt>Deposits</dt><dd class="num">${isLive ? usd(usdgNum(f.totalAssets), { compact: true }) : 'soon'}</dd></div>
        <div><dt>Yours</dt><dd class="num">${S.account && isLive ? usd(usdgNum(mine)) : '-'}</dd></div>
      </dl>
      <p class="fcard-foot muted">${isLive ? (last ? `Last move ${ago(Math.max(0, S.pub.now - (last.time || S.pub.now)))}` : 'Waiting for its first deposit') : 'Boots at launch'}</p>
    </div>
  </a>`;
}

export default {
  title: 'Farms',
  render() {
    return `<section class="vhead">
      <div class="vhead-id"><span class="vh-sticker" aria-hidden="true">農</span><div class="vhead-txt">
        <p class="eyebrow"><span>Farms</span><span class="kana">ファーム</span></p>
        <h1 class="vtitle display">Select your agent</h1>
        <p class="vsub">Each farm is a Morpho Vault V2 with one agent. Deposit USDG and you hold farm shares; the agent places the USDG with borrowers in its stocks' markets, and the interest grows your shares.</p>
      </div></div>
    </section>
    <div class="fgrid" data-live="cards"></div>
    <section class="panel night how-farm">
      <p class="display">How a farm earns</p>
      <ol>
        <li>Borrowers pay interest on the USDG they borrow from a market.</li>
        <li>The interest goes to the market's lenders: here, the farm.</li>
        <li>The farm keeps ${pct(0.1, 0)} of it as its fee to Tetsu Corp and adds the rest to its shares' value.</li>
        <li>Farm APY shown is what depositors get after the fee, at today's rates. It moves with borrowing.</li>
      </ol>
    </section>`;
  },
  mount(el) { this.update(el); },
  update(el) { put(el.querySelector('[data-live="cards"]'), FARMS.map(card).join('')); },
};
