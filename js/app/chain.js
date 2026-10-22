/*
 * js/app/chain.js: every chain read and write the app makes.
 *
 * Reads go through the site's read-only proxy (/api/rpc/4663, or a loopback node in local testing) and are batched
 * with Multicall3, so a full refresh is two eth_calls. Writes are signed by the visitor's wallet; gas is estimated
 * here first (padded, because Morpho's interest accrual writes state an estimate at the latest block may not see),
 * which also turns a revert into a plain reason before the wallet ever opens.
 */
import { CHAIN, STOCKS, SYMBOLS, MORPHO as M, USDG, MULTICALL3 } from '../config.js';
import * as ABI from './abi.js';

const E = globalThis.ethers;
export const I = {
  erc20: new E.Interface(ABI.ERC20),
  morpho: new E.Interface(ABI.MORPHO),
  irm: new E.Interface(ABI.IRM),
  feed: new E.Interface(ABI.FEED),
  oracle: new E.Interface(ABI.ORACLE),
  vault: new E.Interface(ABI.VAULT),
  agent: new E.Interface(ABI.AGENT),
  mc: new E.Interface([...ABI.MULTICALL3, 'function getCurrentBlockTimestamp() view returns (uint256 timestamp)']),
};

let provider = null;
let providerUrl = '';
export function reader(url) {
  const abs = new URL(url, location.origin).toString();
  if (!provider || providerUrl !== abs) {
    provider = new E.JsonRpcProvider(abs, CHAIN.id, { staticNetwork: E.Network.from(CHAIN.id), batchMaxCount: 20, polling: true, pollingInterval: 1500 });
    providerUrl = abs;
  }
  return provider;
}

/**
 * calls: [{ to, iface, fn, args }] -> [decoded Result | null] (null when that call reverted or returned nothing).
 * Chunked into aggregate3 calls of `chunk`; the chunks go out together in one JSON-RPC batch.
 */
export async function multi(rp, calls, { chunk = 90 } = {}) {
  const enc = calls.map((c) => ({ target: c.to, allowFailure: true, callData: c.iface.encodeFunctionData(c.fn, c.args || []) }));
  const groups = [];
  for (let i = 0; i < enc.length; i += chunk) groups.push(enc.slice(i, i + chunk));
  const answers = await Promise.all(groups.map((g) => rp.call({ to: MULTICALL3, data: I.mc.encodeFunctionData('aggregate3', [g]) })));
  const out = [];
  answers.forEach((raw, gi) => {
    const [rows] = I.mc.decodeFunctionResult('aggregate3', raw);
    rows.forEach((row, j) => {
      const c = calls[gi * chunk + j];
      if (!row.success || !row.returnData || row.returnData === '0x') { out.push(null); return; }
      try { out.push(c.iface.decodeFunctionResult(c.fn, row.returnData)); } catch { out.push(null); }
    });
  });
  return out;
}

export const marketParams = (D, sym) => ({
  loanToken: USDG.address, collateralToken: STOCKS[sym].token, oracle: D.markets[sym].oracle, irm: M.irm, lltv: BigInt(D.markets[sym].lltv || STOCKS[sym].lltv),
});
export const launchedIn = (D) => Array.isArray(D.farms) && D.farms.length > 0;

/**
 * Everything public, read straight from the chain: prices, markets (with their oracle price and borrow rate) and farms.
 */
export async function readPublic(rp, D) {
  const live = launchedIn(D);
  const calls = [];
  const at = {};
  const add = (k, c) => { at[k] = calls.push(c) - 1; };
  add('now', { to: MULTICALL3, iface: I.mc, fn: 'getCurrentBlockTimestamp' });
  for (const s of SYMBOLS) add(`feed:${s}`, { to: STOCKS[s].feed, iface: I.feed, fn: 'latestRoundData' });
  if (live) {
    for (const s of SYMBOLS) {
      const m = D.markets[s];
      if (!m) continue;
      add(`mkt:${s}`, { to: M.blue, iface: I.morpho, fn: 'market', args: [m.id] });
      add(`px:${s}`, { to: m.oracle, iface: I.oracle, fn: 'price' });
    }
    for (const f of D.farms) {
      add(`ta:${f.key}`, { to: f.vault, iface: I.vault, fn: 'totalAssets' });
      add(`ts:${f.key}`, { to: f.vault, iface: I.vault, fn: 'totalSupply' });
      add(`pf:${f.key}`, { to: f.vault, iface: I.vault, fn: 'performanceFee' });
      add(`idle:${f.key}`, { to: USDG.address, iface: I.erc20, fn: 'balanceOf', args: [f.vault] });
      add(`pv:${f.key}`, { to: f.agent, iface: I.agent, fn: 'preview' });
      add(`pa:${f.key}`, { to: f.agent, iface: I.agent, fn: 'params' });
      add(`lw:${f.key}`, { to: f.agent, iface: I.agent, fn: 'lastWork' });
    }
  }
  const r = await multi(rp, calls);
  const get = (k) => (k in at ? r[at[k]] : null);
  const now = get('now') ? Number(get('now')[0]) : Math.floor(Date.now() / 1000);

  const stocks = {};
  for (const s of SYMBOLS) {
    const x = get(`feed:${s}`);
    stocks[s] = x ? { price: Number(x.answer) / 1e8, answer: x.answer, updatedAt: Number(x.updatedAt), age: now - Number(x.updatedAt) } : { price: null, updatedAt: 0, age: Infinity };
  }

  const markets = {};
  if (live) {
    const rateCalls = [];
    const rateSyms = [];
    for (const s of SYMBOLS) {
      const x = get(`mkt:${s}`);
      if (!x) continue;
      const px = get(`px:${s}`);
      markets[s] = {
        id: D.markets[s].id,
        supply: x.totalSupplyAssets, supplyShares: x.totalSupplyShares, borrow: x.totalBorrowAssets, borrowShares: x.totalBorrowShares,
        lastUpdate: Number(x.lastUpdate), fee: x.fee, oraclePrice: px ? px[0] : null, rate: 0n,
      };
      if (Number(x.lastUpdate) > 0) {
        rateSyms.push(s);
        rateCalls.push({ to: M.irm, iface: I.irm, fn: 'borrowRateView', args: [marketParams(D, s), [x.totalSupplyAssets, x.totalSupplyShares, x.totalBorrowAssets, x.totalBorrowShares, x.lastUpdate, x.fee]] });
      }
    }
    if (rateCalls.length) {
      const rates = await multi(rp, rateCalls);
      rates.forEach((x, i) => { if (x) markets[rateSyms[i]].rate = x[0]; });
    }
  }

  const farms = {};
  if (live) {
    for (const f of D.farms) {
      const pv = get(`pv:${f.key}`), pa = get(`pa:${f.key}`);
      farms[f.key] = {
        ...f,
        totalAssets: get(`ta:${f.key}`)?.[0] ?? 0n,
        totalSupply: get(`ts:${f.key}`)?.[0] ?? 0n,
        performanceFee: get(`pf:${f.key}`)?.[0] ?? 0n,
        idle: get(`idle:${f.key}`)?.[0] ?? 0n,
        rows: pv ? pv.rows.map((x) => ({ id: x.id, ours: x.ours, supply: x.supply, borrow: x.borrow, fill: x.fill, target: x.target, room: x.room })) : [],
        params: pa ? { targetUtilization: pa.targetUtilization, buffer: pa.buffer, idleBps: Number(pa.idleBps), minMove: pa.minMove, workInterval: Number(pa.workInterval) } : null,
        lastWork: Number(get(`lw:${f.key}`)?.[0] ?? 0),
      };
    }
  }
  return { now, stocks, markets, farms, at: Date.now() };
}

/** The connected wallet: gas, USDG, every stock, every loan, every farm share. */
export async function readUser(rp, D, account) {
  const live = launchedIn(D);
  const calls = [];
  const at = {};
  const add = (k, c) => { at[k] = calls.push(c) - 1; };
  add('eth', { to: MULTICALL3, iface: I.mc, fn: 'getEthBalance', args: [account] });
  add('usdg', { to: USDG.address, iface: I.erc20, fn: 'balanceOf', args: [account] });
  for (const s of SYMBOLS) add(`bal:${s}`, { to: STOCKS[s].token, iface: I.erc20, fn: 'balanceOf', args: [account] });
  if (live) {
    for (const s of SYMBOLS) if (D.markets[s]) add(`pos:${s}`, { to: M.blue, iface: I.morpho, fn: 'position', args: [D.markets[s].id, account] });
    for (const f of D.farms) add(`sh:${f.key}`, { to: f.vault, iface: I.vault, fn: 'balanceOf', args: [account] });
  }
  const r = await multi(rp, calls);
  const get = (k) => (k in at ? r[at[k]] : null);
  const me = { account, eth: get('eth')?.[0] ?? 0n, usdg: get('usdg')?.[0] ?? 0n, stocks: {}, pos: {}, farms: {}, at: Date.now() };
  for (const s of SYMBOLS) me.stocks[s] = get(`bal:${s}`)?.[0] ?? 0n;
  if (live) {
    for (const s of SYMBOLS) {
      const p = get(`pos:${s}`);
      if (p) me.pos[s] = { supplyShares: p.supplyShares, borrowShares: p.borrowShares, collateral: p.collateral };
    }
    const redeem = [];
    for (const f of D.farms) {
      const sh = get(`sh:${f.key}`)?.[0] ?? 0n;
      me.farms[f.key] = { shares: sh, assets: 0n };
      if (sh > 0n) redeem.push({ key: f.key, call: { to: f.vault, iface: I.vault, fn: 'previewRedeem', args: [sh] } });
    }
    if (redeem.length) {
      const rr = await multi(rp, redeem.map((x) => x.call));
      rr.forEach((x, i) => { if (x) me.farms[redeem[i].key].assets = x[0]; });
    }
  }
  return me;
}

export async function allowance(rp, token, owner, spender) {
  const [x] = await multi(rp, [{ to: token, iface: I.erc20, fn: 'allowance', args: [owner, spender] }]);
  return x ? x[0] : 0n;
}

/* ------------------------------------------------------------------------------------------------ writes */

export const rejected = (e) => e?.code === 4001 || e?.code === 'ACTION_REJECTED' || e?.info?.error?.code === 4001 || /user (rejected|denied)|rejected the request|cancel/i.test(String(e?.message || ''));

const ERR_IFACES = [I.agent, I.vault];
/** A reason a person can act on, from whatever an estimate, a wallet or a receipt threw. */
export function reason(e) {
  if (rejected(e)) return 'You cancelled it in your wallet. Nothing was sent.';
  const bits = [e?.reason, e?.shortMessage, e?.info?.error?.message, e?.error?.message, e?.message].filter(Boolean).join(' | ');
  const data = e?.data || e?.info?.error?.data || e?.error?.data;
  let name = '';
  if (typeof data === 'string' && data.length >= 10) {
    for (const iface of ERR_IFACES) { try { const p = iface.parseError(data); if (p) { name = p.name; break; } } catch {} }
    if (!name && data.startsWith('0x08c379a0')) { try { name = E.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + data.slice(10))[0]; } catch {} }
  }
  const text = `${name} ${bits}`;
  for (const [re, msg] of ABI.REASONS) if (re.test(text)) return msg;
  if (/insufficient funds|gas required exceeds|intrinsic gas/i.test(text)) return 'Your wallet needs a little ETH on Robinhood Chain to pay gas.';
  if (/network|chain/i.test(text) && /mismatch|wrong|switch/i.test(text)) return 'Your wallet is on another network. Switch it to Robinhood Chain and try again.';
  const plain = (name || e?.reason || e?.shortMessage || e?.message || 'The transaction failed.').toString();
  return plain.length > 180 ? plain.slice(0, 177) + '...' : plain;
}

/**
 * Estimate, pad, send through the wallet, and wait for the receipt on the read node.
 * onSent(hash) fires as soon as the wallet hands back a hash.
 */
export async function send(rp, signer, { to, data, value = 0n }, { onSent } = {}) {
  const from = await signer.getAddress();
  let gasLimit;
  try {
    const est = await rp.estimateGas({ from, to, data, value });
    gasLimit = (est * 16n) / 10n + 80_000n;
  } catch (e) {
    throw new Error(reason(e));
  }
  let tx;
  try {
    tx = await signer.sendTransaction({ to, data, value, gasLimit, chainId: CHAIN.id });
  } catch (e) {
    throw Object.assign(new Error(reason(e)), { rejected: rejected(e) });
  }
  onSent?.(tx.hash);
  const rcpt = await receipt(rp, tx.hash, 180_000);
  if (!rcpt) throw new Error('The transaction was sent but not confirmed within three minutes. Check it on the explorer before trying again.');
  if (rcpt.status !== 1) throw new Error('The transaction was mined but reverted. Nothing changed.');
  return rcpt;
}

/** Poll the read node for a receipt (blocks are about a tenth of a second here). Null after timeoutMs. */
export async function receipt(rp, hash, timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  let wait = 400;
  while (Date.now() < until) {
    try { const r = await rp.getTransactionReceipt(hash); if (r) return r; } catch {}
    await new Promise((ok) => setTimeout(ok, wait));
    wait = Math.min(2500, Math.round(wait * 1.4));
  }
  return null;
}

export const txUrl = (hash) => `${CHAIN.explorer}/tx/${hash}`;
export const addrUrl = (a) => `${CHAIN.explorer}/address/${a}`;
