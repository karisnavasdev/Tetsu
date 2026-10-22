/*
 * js/app/derive.js: the numbers the views show, derived from the store (S.pub, S.me).
 * Everything that sends a transaction re-reads the chain first; these are for display and for sizing inputs.
 */
import { STOCKS, SYMBOLS, FARMS, USDG } from '../config.js';
import { S } from './store.js';
import { expected, position, borrowCap, collateralFor, liquidationPrice, WAD, toAssetsUp, max } from './math.js';
import { rateToApy } from '../lib/format.js';

export const SAFE = 85n * 10n ** 16n; // a loan starts at most at 85% of its stock's liquidation line
export const SAFE_NUM = 0.85;
export const STALE_AFTER = 432000; // the oracles refuse a round older than five days
export const lltvOf = (sym) => BigInt(STOCKS[sym].lltv);
export const lltvNum = (sym) => Number(STOCKS[sym].lltv) / 1e18;
export const farmCfg = (key) => FARMS.find((f) => f.key === key) || null;
export const nowSec = () => (S.pub?.now ? S.pub.now + Math.floor((Date.now() - S.pub.at) / 1000) : Math.floor(Date.now() / 1000));
export const live = () => !!(S.deploy && Array.isArray(S.deploy.farms) && S.deploy.farms.length);

/** One stock's market, as people read it. */
export function market(sym) {
  const st = S.pub?.stocks?.[sym] || {};
  const raw = S.pub?.markets?.[sym] || null;
  const lltv = lltvOf(sym);
  const out = {
    sym, name: STOCKS[sym].name, farm: STOCKS[sym].farm,
    price: st.price ?? null, feedAge: st.age ?? Infinity, stale: (st.age ?? Infinity) > STALE_AFTER,
    lltv, lltvNum: Number(lltv) / 1e18, maxLtv: (Number(lltv) / 1e18) * SAFE_NUM,
    open: !!raw && raw.lastUpdate > 0, m: null, liquidity: 0n, util: 0, borrowApy: 0, supplyApy: 0, rate: raw?.rate ?? 0n,
    // the oracle's own price when read; else the feed's answer scaled the same way (x 1e16 for an 8-decimal feed), never when stale
    oraclePrice: raw?.oraclePrice ?? (st.answer && (st.age ?? Infinity) <= STALE_AFTER ? BigInt(st.answer) * 10n ** 16n : null),
  };
  if (raw && raw.lastUpdate > 0) {
    const m = expected({ supply: raw.supply, supplyShares: raw.supplyShares, borrow: raw.borrow, borrowShares: raw.borrowShares, lastUpdate: raw.lastUpdate }, raw.rate, nowSec());
    out.m = m;
    out.liquidity = m.supply > m.borrow ? m.supply - m.borrow : 0n;
    out.util = m.supply > 0n ? Number((m.borrow * 10n ** 9n) / m.supply) / 1e9 : 0;
    out.borrowApy = rateToApy(raw.rate);
    out.supplyApy = out.borrowApy * out.util * (1 - Number(raw.fee || 0n) / 1e18);
  }
  return out;
}

/** The connected wallet's loan in one market (zeros when there is none). */
export function loan(sym, mk = market(sym)) {
  const p = S.me?.pos?.[sym] || { collateral: 0n, borrowShares: 0n };
  const has = p.collateral > 0n || p.borrowShares > 0n;
  const m = mk.m || { borrow: 0n, borrowShares: 0n };
  const r = position(p, m, mk.oraclePrice, mk.lltv);
  const cap = borrowCap(p.collateral, mk.oraclePrice, mk.lltv, SAFE);
  const canBorrow = cap > r.debt ? cap - r.debt : 0n;
  const keep = collateralFor(r.debt, mk.oraclePrice, mk.lltv, SAFE);
  const canWithdraw = r.debt === 0n ? p.collateral : p.collateral > keep ? p.collateral - keep : 0n;
  return {
    has, collateral: p.collateral, borrowShares: p.borrowShares, debt: r.debt, value: r.value, health: r.health, ltv: r.ltv,
    liqPrice: liquidationPrice(r.debt, p.collateral, mk.lltv, USDG.decimals), canBorrow, canWithdraw,
  };
}

/** What a loan would look like after a change (collateral and debt deltas, raw units; negative to remove). */
export function project(sym, dCollateral, dDebt, mk = market(sym)) {
  const now = loan(sym, mk);
  const collateral = max(0n, now.collateral + dCollateral);
  const debt = max(0n, now.debt + dDebt);
  const value = mk.price ? (Number(collateral) / 1e18) * mk.price : 0;
  const d = Number(debt) / 10 ** USDG.decimals;
  const ltv = value > 0 ? d / value : d > 0 ? Infinity : 0;
  const health = d > 0 ? (value * mk.lltvNum) / d : Infinity;
  return { collateral, debt, value, ltv, health, liqPrice: liquidationPrice(debt, collateral, mk.lltv, USDG.decimals), over: ltv > mk.maxLtv + 1e-9 };
}

/** One farm, as people read it. */
export function farm(key) {
  const cfg = farmCfg(key);
  const f = S.pub?.farms?.[key] || null;
  const mine = S.me?.farms?.[key] || { shares: 0n, assets: 0n };
  const out = { key, cfg, deployed: !!f, totalAssets: 0n, idle: 0n, apy: 0, grossApy: 0, fee: 0, rows: [], params: null, lastWork: 0, mine, placed: 0n };
  if (!f) return out;
  const fee = Number(f.performanceFee || 0n) / 1e18;
  let earning = 0;
  const bySym = new Map(Object.entries(S.deploy?.markets || {}).map(([s, m]) => [String(m.id).toLowerCase(), s]));
  out.rows = f.rows.map((r) => {
    const sym = bySym.get(String(r.id).toLowerCase()) || null;
    const mk = sym ? market(sym) : null;
    if (mk) earning += (Number(r.ours) / 1e6) * mk.supplyApy;
    out.placed += r.ours;
    return { ...r, sym, mk };
  });
  const ta = f.totalAssets;
  out.totalAssets = ta;
  out.idle = f.idle;
  out.grossApy = ta > 0n ? earning / (Number(ta) / 1e6) : 0;
  out.fee = fee;
  out.apy = out.grossApy * (1 - fee);
  out.params = f.params;
  out.lastWork = f.lastWork;
  out.vault = f.vault;
  out.agent = f.agent;
  out.totalSupply = f.totalSupply;
  return out;
}

/** Every loan of the connected wallet, riskiest first. */
export function myLoans() {
  if (!S.me) return [];
  return SYMBOLS.map((s) => { const mk = market(s); return { sym: s, mk, l: loan(s, mk) }; })
    .filter((x) => x.l.has)
    .sort((a, b) => (a.l.health || Infinity) - (b.l.health || Infinity));
}

/** The health of a loan as a word and a tone. */
export function healthTone(h) {
  if (!Number.isFinite(h)) return { word: 'No debt', tone: 'teal' };
  if (h < 1) return { word: 'Liquidatable', tone: 'danger' };
  if (h < 1.1) return { word: 'At risk', tone: 'danger' };
  if (h < 1.25) return { word: 'Watch it', tone: 'warn' };
  return { word: 'Healthy', tone: 'teal' };
}

export const debtOf = (shares, m) => (shares > 0n && m ? toAssetsUp(shares, m.borrow, m.borrowShares) : 0n);
export const usdgNum = (raw) => Number(raw) / 10 ** USDG.decimals;
export { WAD };
