// js/app/ui.js: small pieces of markup the views share, the sheet (a dialog that is a bottom sheet on phones), and steps.
import { stockLogo, CHAIN, STOCKS } from '../config.js';
import { esc, pct } from '../lib/format.js';

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const st = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const ICON = {
  back: svg(`<path d="M15 5l-7 7 7 7" ${st}/>`),
  next: svg(`<path d="M9 5l7 7-7 7" ${st}/>`),
  close: svg(`<path d="M6 6l12 12M18 6L6 18" ${st}/>`),
  ext: svg(`<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" ${st}/>`),
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5" ${st}/>`),
  bolt: svg(`<path d="M13 3L5 14h6l-1 7 8-11h-6z" ${st}/>`),
  wallet: svg(`<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-3M4 7.5A2 2 0 0 0 6 9.5h13a1 1 0 0 1 1 1V15m0 0h-4a2 2 0 0 1 0-4h4" ${st}/>`),
  markets: svg(`<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" ${st}/>`),
  farms: svg(`<circle cx="12" cy="12" r="3.2" ${st}/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1" ${st}/>`),
  me: svg(`<circle cx="12" cy="8.5" r="3.8" ${st}/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" ${st}/>`),
  rescue: svg(`<path d="M12 3l8 3v6c0 4.6-3.4 8.2-8 9-4.6-.8-8-4.4-8-9V6z" ${st}/><path d="M12 8v5M12 16.2v.1" ${st}/>`),
  refresh: svg(`<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" ${st}/>`),
  search: svg(`<circle cx="11" cy="11" r="6.5" ${st}/><path d="M16 16l4.5 4.5" ${st}/>`),
};

/** Set innerHTML only when it changed, so a refresh does not replace buttons under the pointer or reset scroll. */
export function put(el, html) {
  if (!el) return false;
  if (el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}

export const logo = (sym, cls = '') => `<img class="logo-tile ${cls}" src="${stockLogo(sym)}" alt="" width="40" height="40" loading="lazy">`;
export const agentImg = (key, size = 160) => `/img/agents/${key}-${size}.webp`;

/** The stock's rank, as on the landing's trading cards: S (86% line) to C (38.5%). */
export function rankOf(sym) {
  const l = Number(STOCKS[sym].lltv) / 1e18;
  return l >= 0.85 ? 'S' : l >= 0.75 ? 'A' : l >= 0.6 ? 'B' : 'C';
}
export const rank = (sym) => `<span class="rank r-${rankOf(sym)}" title="Rank ${rankOf(sym)}">${rankOf(sym)}</span>`;

/** A speech bubble from Tetsu, or from an agent ({ agent: 'kira', name: 'KIRA-02' }). */
export function tip(html, { agent = null, name = 'TETSU' } = {}) {
  const img = agent ? `/img/agents/${agent}-160.webp` : '/img/brand/logo-128.png';
  return `<div class="tip${agent ? ' agent' : ''}"><img src="${img}" alt="" width="46" height="46"><p class="tip-b"><span class="tip-n">${esc(name)}</span>${html}</p></div>`;
}

/** The cockpit dial: teal to the start limit, sun to the line, red past it; the needle at the loan's LTV. */
export function dial(ltv, lltv, safe = 0.85) {
  const CX = 120, CY = 120, R = 100;
  const pt = (f) => { const a = Math.PI * (1 - f); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; };
  const arc = (f0, f1) => { const [x0, y0] = pt(f0); const [x1, y1] = pt(f1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const span = lltv / 0.8;
  const fMax = (lltv * safe) / span;
  const f = Math.max(0, Math.min(1, (Number.isFinite(ltv) ? ltv : 1) / span));
  return `<div class="dial" role="img" aria-label="Loan at ${pct(ltv, 1)} of value; it may start at most at ${pct(lltv * safe, 1)}; liquidation at ${pct(lltv, 1)}">
    <svg viewBox="0 0 240 132" aria-hidden="true">
      <path class="d-track" d="M20 120 A100 100 0 0 1 220 120"/>
      <path class="d-safe" d="${arc(0, fMax)}"/><path class="d-warn" d="${arc(fMax, 0.8)}"/><path class="d-red" d="${arc(0.8, 1)}"/>
      <line class="d-needle" x1="120" y1="120" x2="120" y2="34" style="transform:rotate(${(-90 + 180 * f).toFixed(2)}deg)"/>
      <circle class="d-hub" cx="120" cy="120" r="8"/>
    </svg>
    <div class="dial-legend"><span><i style="background:#5fc9b8"></i>start under ${pct(lltv * safe, 1)}</span><span><i style="background:#f2614d"></i>liquidation ${pct(lltv, 1)}</span></div>
  </div>`;
}
export const ext = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener"${text ? '' : ' aria-label="Open on the explorer"'}>${esc(text)} ${ICON.ext}</a>`;
export const txLink = (hash, text = 'View') => ext(`${CHAIN.explorer}/tx/${hash}`, text);

/** A bar from 0 to 125% of the liquidation line: the loan, the most a loan may start at, and the line. */
export function healthBar(ltv, lltv, safe = 0.85) {
  const span = lltv / 0.8;
  const fill = Math.max(0, Math.min(100, (ltv / span) * 100));
  const tone = ltv >= lltv ? 'danger' : ltv > lltv * safe ? 'warn' : ltv > lltv * 0.7 ? 'warn' : '';
  return `<div class="hbar ${tone}" role="img" aria-label="Loan at ${pct(ltv, 1)} of value, liquidation at ${pct(lltv, 1)}">
    <span class="hbar-fill" style="width:${fill.toFixed(2)}%"></span>
    <span class="hbar-max" style="left:${((lltv * safe) / span * 100).toFixed(2)}%"></span>
    <span class="hbar-line" style="left:80%"></span>
  </div>
  <div class="hbar-legend"><span>0%</span><span class="max">Max ${pct(lltv * safe, 1)}</span><span class="line">Liquidation ${pct(lltv, 1)}</span></div>`;
}

/* ------------------------------------------------------------------------------------------------ the sheet */

let lastFocus = null;
export function openSheet(html, { label = 'Dialog', onClose } = {}) {
  closeSheet(true);
  lastFocus = document.activeElement;
  const host = document.createElement('div');
  host.className = 'sheet-host';
  host.innerHTML = `<div class="sheet-scrim" data-sheet-close></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1">
      <button class="sheet-x icon-btn" type="button" data-sheet-close aria-label="Close">${ICON.close}</button>
      <div class="sheet-body">${html}</div>
    </div>`;
  host._onClose = onClose;
  document.body.appendChild(host);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => { host.classList.add('in'); host.querySelector('.sheet').focus(); });
  return host.querySelector('.sheet-body');
}
export function closeSheet(silent = false) {
  const host = document.querySelector('.sheet-host');
  if (!host) return;
  const cb = host._onClose;
  host.remove();
  document.body.classList.remove('sheet-open');
  if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {}
  if (!silent && cb) cb();
}
export const sheetBody = () => document.querySelector('.sheet-host .sheet-body');
addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.querySelector('.sheet-host')) closeSheet(); });

/* ------------------------------------------------------------------------------------------------ steps */

/** steps: [{ label, state: 'todo'|'run'|'done'|'fail'|'skipped', hash?, note? }] */
export function stepsHtml(steps) {
  if (!steps || !steps.length) return '';
  const live = steps.some((s) => s.state === 'run');
  return `<p class="steps-head">${live ? '<span class="rec"></span>' : ''}Mission log</p><ol class="steps">${steps.map((s, i) => `<li class="step ${s.state}">
      <span class="step-n">${s.state === 'done' ? ICON.check : s.state === 'fail' ? ICON.close : String(i + 1).padStart(2, '0')}</span>
      <span class="step-t">${esc(s.label)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span>
      ${s.hash ? `<span class="step-l">${txLink(s.hash, 'tx')}</span>` : s.state === 'run' ? '<span class="step-l"><span class="spin" aria-label="Waiting"></span></span>' : ''}
    </li>`).join('')}</ol>`;
}

/** An amount input with a unit and a MAX button. */
export function amountField({ name, label, unit, maxText = '', placeholder = '0.00' }) {
  return `<label class="amt">
    <span class="amt-top"><span>${esc(label)}</span>${maxText ? `<button type="button" class="amt-max" data-max="${esc(name)}">${esc(maxText)}</button>` : ''}</span>
    <span class="amt-box"><input name="${esc(name)}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="${esc(label)}"><span class="amt-unit">${esc(unit)}</span></span>
  </label>`;
}
