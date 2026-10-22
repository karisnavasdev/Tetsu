/*
 * js/app/wallet.js: connecting a wallet. Wallets in this browser announce themselves (EIP-6963) and are listed by
 * name; with none announced, window.ethereum is offered. On a phone with no wallet in the browser, the list opens
 * this page inside a wallet app instead. The choice is remembered on this device and a refresh reconnects silently
 * (eth_accounts only answers with an address the wallet already shares with this site).
 */
import { CHAIN, BRAND } from '../config.js';
import { S, emit, kv } from './store.js';
import { rejected } from './chain.js';

const E = globalThis.ethers;
export const CHAIN_PARAMS = {
  chainId: CHAIN.hex, chainName: CHAIN.name, nativeCurrency: { ...CHAIN.nativeCurrency }, rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer],
};

export const WALLETS = new Map(); // rdns -> { info, provider }
addEventListener('eip6963:announceProvider', (e) => {
  const d = e.detail;
  if (!d?.provider?.request || !d.info?.uuid) return;
  WALLETS.set(d.info.rdns || d.info.uuid, d);
  emit('wallets');
});
export const askWallets = () => { try { dispatchEvent(new Event('eip6963:requestProvider')); } catch {} };
askWallets();

export const onPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
export const walletIcon = (s) => (/^data:image\/(png|svg\+xml|webp|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(s || '') ? s : '');

/** Links that open this page inside a wallet app's own browser (for a phone with no wallet here). */
export function deepLinks() {
  const host = BRAND.domain + '/app';
  const url = BRAND.url + '/app';
  return [
    { name: 'MetaMask', href: `https://metamask.app.link/dapp/${host}`, color: '#F6851B' },
    { name: 'Coinbase Wallet', href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`, color: '#3B82F6' },
    { name: 'Trust Wallet', href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`, color: '#48C78E' },
  ];
}

/** The wallets to offer: [{ id, name, icon, provider }]. */
export function available() {
  const list = [...WALLETS.entries()].map(([id, d]) => ({ id: 'eip6963:' + id, name: d.info.name || 'Browser wallet', icon: walletIcon(d.info.icon), provider: d.provider }));
  if (!list.length && window.ethereum) list.push({ id: 'injected', name: injectedName(window.ethereum), icon: '', provider: window.ethereum });
  return list;
}
const injectedName = (e) => (e.isRabby ? 'Rabby' : e.isCoinbaseWallet ? 'Coinbase Wallet' : e.isTrust || e.isTrustWallet ? 'Trust Wallet' : e.isBraveWallet ? 'Brave Wallet' : e.isMetaMask ? 'MetaMask' : 'Browser wallet');
export const walletName = () => {
  if (S.how.startsWith('eip6963:')) return WALLETS.get(S.how.slice(8))?.info?.name || 'your wallet';
  return S.raw ? injectedName(S.raw) : 'your wallet';
};

async function ensureChain(eth) {
  const id = await eth.request({ method: 'eth_chainId' });
  if (BigInt(id) === BigInt(CHAIN.id)) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] });
  } catch (e) {
    if (rejected(e)) throw e;
    await eth.request({ method: 'wallet_addEthereumChain', params: [CHAIN_PARAMS] });
    try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] }); } catch {}
  }
}

/** Before any transaction: the wallet must be on Robinhood Chain, and it may have been switched by hand. */
export async function signer() {
  if (!S.raw || !S.account) throw new Error('Connect a wallet first.');
  const want = BigInt(CHAIN.id);
  if (BigInt(await S.raw.request({ method: 'eth_chainId' })) !== want) {
    await ensureChain(S.raw);
    if (BigInt(await S.raw.request({ method: 'eth_chainId' })) !== want) throw new Error('Your wallet is not on Robinhood Chain, so nothing was sent. Switch it and try again.');
  }
  return new E.BrowserProvider(S.raw, 'any').getSigner(S.account);
}

export async function connect(id) {
  const w = available().find((x) => x.id === id);
  if (!w) throw new Error('That wallet is not in this browser any more. Pick another.');
  const eth = w.provider;
  let accts = [];
  try {
    await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    accts = await eth.request({ method: 'eth_accounts' });
  } catch (e) {
    if (rejected(e)) throw e;
    accts = await eth.request({ method: 'eth_requestAccounts' });
  }
  if (!accts?.length) return false;
  try { await ensureChain(eth); } catch (e) { if (rejected(e)) throw new Error('Connected, but Tetsu Corp runs on Robinhood Chain: approve the network in your wallet to send anything.'); }
  kv.set('wallet', id);
  kv.set('out', '', 'session');
  watch(eth);
  setAccount(accts[0], eth, id);
  return true;
}

/** After a refresh: the same wallet as last time, without a prompt. */
export async function restore() {
  const id = kv.get('wallet');
  if (!id || S.account || kv.get('out', 'session') === '1') return false;
  let eth = null;
  if (id.startsWith('eip6963:')) {
    for (let i = 0; i < 12 && !WALLETS.has(id.slice(8)); i++) { askWallets(); await new Promise((r) => setTimeout(r, 100)); }
    eth = WALLETS.get(id.slice(8))?.provider || null;
  } else if (id === 'injected') eth = window.ethereum || null;
  if (!eth) return false;
  try {
    const a = await eth.request({ method: 'eth_accounts' });
    if (a?.length) { watch(eth); setAccount(a[0], eth, id); return true; }
  } catch {}
  return false;
}

function setAccount(addr, raw, how) {
  S.account = E.getAddress(addr);
  S.raw = raw;
  S.how = how;
  S.me = null;
  S.meError = '';
  emit('account');
}

const watched = new WeakSet();
function watch(eth) {
  if (!eth?.on || watched.has(eth)) return;
  watched.add(eth);
  eth.on('accountsChanged', (a) => {
    if (S.raw !== eth) return;
    if (!a || !a.length) disconnect(false);
    else if (E.getAddress(a[0]) !== S.account) setAccount(a[0], eth, S.how);
  });
  eth.on('chainChanged', () => emit('chain'));
}

export async function disconnect(forget = true) {
  const raw = S.raw;
  kv.set('wallet', '');
  kv.set('out', '1', 'session');
  Object.assign(S, { account: null, raw: null, how: '', me: null, meError: '' });
  emit('account');
  if (forget && raw) { try { await raw.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch {} }
}
