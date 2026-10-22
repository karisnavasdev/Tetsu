// js/app/store.js: the app's one state object and a tiny change signal.

export const S = {
  deploy: null, // the deployment in use (js/config.js DEPLOY, or a local fork's)
  rpc: '', // the read node URL (the site's proxy in production)
  local: false,
  pub: null, // readPublic(): prices, markets, farms
  pubError: '',
  log: [], // the agents' recent moves, from /api/state
  me: null, // readUser(): the connected wallet's balances and positions
  meError: '',
  account: null, // checksummed address, once connected
  raw: null, // the EIP-1193 provider of the connected wallet
  how: '', // which wallet: 'eip6963:<rdns>' or 'injected'
  busy: false, // a transaction flow is running
};

const subs = new Set();
export const on = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = (what) => { for (const fn of subs) { try { fn(what); } catch (e) { console.error(e); } } };

export const kv = {
  get(k, where = 'local') { try { return (where === 'session' ? sessionStorage : localStorage).getItem('tsu.' + k) || ''; } catch { return ''; } },
  set(k, v, where = 'local') { try { const st = where === 'session' ? sessionStorage : localStorage; if (v) st.setItem('tsu.' + k, v); else st.removeItem('tsu.' + k); } catch {} },
};
