/*
 * js/site.js: what every page shares. The theme switch, the phone menu, toasts. Imported by the page scripts.
 */
import { TOKEN } from './config.js';


export function initTheme() {
  for (const b of document.querySelectorAll('[data-theme-toggle]')) {
    b.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'night' ? 'paper' : 'night';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('tsu.theme', next); } catch {}
      const meta = document.querySelectorAll('meta[name="theme-color"]');
      for (const m of meta) m.setAttribute('content', next === 'night' ? '#141821' : '#fff8ea');
    });
  }
}

export function initMenu() {
  const btn = document.querySelector('[data-menu]');
  const menu = document.getElementById('menu');
  if (!btn || !menu) return;
  const set = (open) => { menu.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(!menu.classList.contains('open')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  const outside = (e) => { if (menu.classList.contains('open') && !menu.contains(e.target) && !btn.contains(e.target)) set(false); };
  document.addEventListener('pointerdown', outside); // iOS Safari sends no click for a tap on a plain element
  document.addEventListener('click', outside); // Enter or Space on a link outside the menu fires click, not pointerdown
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/** A short message at the bottom of the screen. kind: 'ok' | 'warn' | 'danger' | 'info'. */
export function toast(html, { kind = 'info', ms = 3800 } = {}) {
  const host = document.querySelector('[data-toasts]');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  const dot = kind === 'ok' ? 'dot' : kind === 'warn' ? 'dot warn' : kind === 'danger' ? 'dot danger' : 'dot off';
  el.innerHTML = `<span class="${dot}"></span><div>${html}</div>`;
  el.addEventListener('click', () => el.remove());
  host.appendChild(el);
  const most = matchMedia('(max-width: 860px)').matches ? 1 : 2; // a phone shows one at a time
  while (host.children.length > most) host.firstElementChild.remove();
  setTimeout(() => el.remove(), ms);
}

// Copy CA: the $TETSU contract address to the clipboard (the address lives in js/config.js, never in page text)
export function initCopyCA() {
  for (const b of document.querySelectorAll('[data-copy-ca]')) {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(TOKEN.address); }
      catch {
        const t = document.createElement('textarea');
        t.value = TOKEN.address; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
      toast('$TETSU contract address copied', { kind: 'ok' });
    });
  }
}

export function initSite() {
  initTheme();
  initMenu();
  initCopyCA();
}
