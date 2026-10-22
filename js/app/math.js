/*
 * js/app/math.js: Morpho Blue's position math, in BigInt, the way the contracts round.
 * Shares to assets with Morpho's virtual shares (1e6) and virtual assets (1), interest by the same three-term Taylor
 * expansion Morpho accrues with, health against the oracle's 1e36-scaled price, and the liquidation incentive.
 */

export const WAD = 10n ** 18n;
export const PRICE_SCALE = 10n ** 36n;
const VS = 10n ** 6n; // virtual shares
const VA = 1n; // virtual assets

export const mulDivDown = (x, y, d) => (x * y) / d;
export const mulDivUp = (x, y, d) => (x * y + (d - 1n)) / d;
export const wMulDown = (x, y) => mulDivDown(x, y, WAD);
export const wDivDown = (x, y) => mulDivDown(x, WAD, y);
export const wDivUp = (x, y) => mulDivUp(x, WAD, y);
export const min = (a, b) => (a < b ? a : b);
export const max = (a, b) => (a > b ? a : b);

export const toAssetsUp = (shares, totalAssets, totalShares) => mulDivUp(shares, totalAssets + VA, totalShares + VS);
export const toAssetsDown = (shares, totalAssets, totalShares) => mulDivDown(shares, totalAssets + VA, totalShares + VS);
export const toSharesUp = (assets, totalAssets, totalShares) => mulDivUp(assets, totalShares + VS, totalAssets + VA);
export const toSharesDown = (assets, totalAssets, totalShares) => mulDivDown(assets, totalShares + VS, totalAssets + VA);

/** e^(x*n) - 1 to three terms, as Morpho's MathLib.wTaylorCompounded. */
export function wTaylorCompounded(x, n) {
  const first = x * n;
  const second = mulDivDown(first, first, 2n * WAD);
  const third = mulDivDown(second, first, 3n * WAD);
  return first + second + third;
}

/**
 * A market's totals as of `now`, with the interest since its last update added (Morpho's fee is 0 on this chain's
 * markets, so all of it goes to suppliers). m: { supply, supplyShares, borrow, borrowShares, lastUpdate } BigInt/number.
 */
export function expected(m, rateWad, now) {
  const out = { ...m };
  const elapsed = BigInt(Math.max(0, Math.floor(now) - Number(m.lastUpdate || 0)));
  if (elapsed > 0n && m.borrow > 0n && rateWad > 0n && Number(m.lastUpdate) > 0) {
    const interest = wMulDown(m.borrow, wTaylorCompounded(rateWad, elapsed));
    out.borrow = m.borrow + interest;
    out.supply = m.supply + interest;
  }
  return out;
}

/** Morpho's liquidation incentive factor: min(1.15, 1 / (1 - 0.3 * (1 - lltv))), WAD. */
export function incentive(lltv) {
  const cursor = 3n * 10n ** 17n;
  return min(115n * 10n ** 16n, wDivDown(WAD, WAD - wMulDown(cursor, WAD - lltv)));
}

/**
 * A borrower's position in one market.
 * pos: { collateral, borrowShares } BigInt; m: expected market totals; price: oracle price (1e36 scale) or null;
 * lltv: WAD. Returns debt (USDG raw), max debt at the line, health (number, Infinity without debt), ltv (number).
 */
export function position(pos, m, price, lltv) {
  const debt = pos.borrowShares > 0n ? toAssetsUp(pos.borrowShares, m.borrow, m.borrowShares) : 0n;
  const value = price ? mulDivDown(pos.collateral, price, PRICE_SCALE) : null; // USDG raw
  const line = value === null ? null : wMulDown(value, lltv);
  const health = debt === 0n ? Infinity : line === null ? NaN : Number((line * 10n ** 6n) / debt) / 1e6;
  const ltv = value && value > 0n ? Number((debt * 10n ** 9n) / value) / 1e9 : debt > 0n ? Infinity : 0;
  return { debt, value, line, health, ltv };
}

/** USDG (raw) a position may borrow in total while staying under `share` of its line (share as WAD, e.g. 0.85e18). */
export function borrowCap(collateral, price, lltv, share) {
  if (!price) return 0n;
  return wMulDown(wMulDown(mulDivDown(collateral, price, PRICE_SCALE), lltv), share);
}

/** Collateral (raw) a loan of `debt` needs to stay under `share` of the line. */
export function collateralFor(debt, price, lltv, share) {
  if (!price || debt <= 0n) return 0n;
  // debt <= collateral * price / 1e36 * lltv * share  =>  collateral >= debt * 1e36 / price / (lltv*share)
  const ls = wMulDown(lltv, share);
  return mulDivUp(mulDivUp(debt, PRICE_SCALE, price), WAD, ls);
}

/** The stock price (USD per token, number) at which a position reaches its line. */
export function liquidationPrice(debt, collateral, lltv, usdgDecimals = 6) {
  if (debt <= 0n || collateral <= 0n) return null;
  const d = Number(debt) / 10 ** usdgDecimals;
  const c = Number(collateral) / 1e18;
  return d / (c * (Number(lltv) / 1e18));
}

/**
 * What a liquidator repays and receives when closing as much of a loan as the collateral allows.
 * Returns { seizedAssets, repaidShares, repaidAssets, mode } where mode 'shares' repays the whole debt and 'seize'
 * takes all the collateral (the debt is bigger than the collateral is worth at the bonus).
 */
export function liquidation(pos, m, price, lltv) {
  const lif = incentive(lltv);
  const debt = toAssetsUp(pos.borrowShares, m.borrow, m.borrowShares);
  const seizeForAll = mulDivDown(wMulDown(debt, lif), PRICE_SCALE, price);
  if (seizeForAll <= pos.collateral) {
    return { mode: 'shares', repaidShares: pos.borrowShares, seizedAssets: 0n, repaidAssets: debt, seized: seizeForAll, lif };
  }
  const repaidAssets = wDivUp(mulDivUp(pos.collateral, price, PRICE_SCALE), lif);
  return { mode: 'seize', repaidShares: 0n, seizedAssets: pos.collateral, repaidAssets, seized: pos.collateral, lif };
}
