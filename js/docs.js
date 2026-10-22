// js/docs.js: the docs page's two generated parts, the parameters table and the contract links, from js/config.js.
import { initSite } from './site.js';
import { STOCKS, SYMBOLS, FARMS, MORPHO, USDG, CHAIN, DEPLOY, isLaunched, stockLogo } from './config.js';
import { pct, usd, price, esc } from './lib/format.js';

const SAFE = 0.85;
const bonus = (l) => Math.min(1.15, 1 / (1 - 0.3 * (1 - l))) - 1;
const farmName = (k) => FARMS.find((f) => f.key === k)?.agent || k;
const link = (addr, name, note) => `<a href="${CHAIN.explorer}/address/${esc(addr)}" target="_blank" rel="noopener"><span><b>${esc(name)}</b>${note ? `<small>${esc(note)}</small>` : ''}</span><span class="go">Explorer</span></a>`;

function table(prices = {}) {
  const body = document.querySelector('[data-ptable] tbody');
  if (!body) return;
  body.innerHTML = SYMBOLS.map((s) => {
    const l = Number(STOCKS[s].lltv) / 1e18;
    const p = prices[s];
    return `<tr><td><img class="logo-tile s" src="${stockLogo(s)}" alt="" width="30" height="30" loading="lazy"><span><b>${s}</b> <small>${esc(STOCKS[s].name)}</small></span></td>
      <td class="num">${p ? price(p) : '-'}</td><td class="num" data-l="Line">${pct(l, 1)}</td><td class="num" data-l="Start limit">${pct(l * SAFE, 1)}</td><td class="num" data-l="Bonus">${pct(bonus(l), 1)}</td>
      <td data-l="Farm">${esc(farmName(STOCKS[s].farm))}</td><td class="num" data-l="Farm cap">${usd(STOCKS[s].cap, { compact: true })}</td></tr>`;
  }).join('');
}

function contracts() {
  const box = document.querySelector('[data-contracts]');
  if (!box) return;
  const items = [
    link(MORPHO.blue, 'Morpho Blue', 'Every loan market. By Morpho.'),
    link(MORPHO.irm, 'Adaptive Curve IRM', 'The rate model of every market. By Morpho.'),
    link(MORPHO.vaultV2Factory, 'Vault V2 factory', 'Created the three farms. By Morpho.'),
    link(MORPHO.adapterFactory, 'Market adapter factory', 'Created each farm\'s Morpho market adapter. By Morpho.'),
    link(USDG.address, 'USDG', 'The dollar the markets lend.'),
  ];
  if (isLaunched()) {
    for (const f of DEPLOY.farms) {
      items.push(link(f.vault, `${farmName(f.key)} farm vault`, 'Morpho Vault V2'));
      items.push(link(f.agent, `${farmName(f.key)} agent`, 'Tetsu Corp agent, allocator of the farm'));
    }
  } else {
    items.push('<p class="muted">The farms, agents and price adapters are listed here once they launch.</p>');
  }
  box.innerHTML = items.join('');
}

async function prices() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) return;
    const out = {};
    for (const s of SYMBOLS) if (j.stocks?.[s]?.price) out[s] = j.stocks[s].price;
    table(out);
  } catch {}
}

initSite();
table();
contracts();
prices();
