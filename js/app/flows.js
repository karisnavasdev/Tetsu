/*
 * js/app/flows.js: every multi-step action, as a list of steps that run one wallet confirmation at a time.
 * Each step re-reads what it depends on right before it sends (allowances, liquidity, positions), and skips itself
 * when it is not needed. A failed step stops the flow and says why; nothing after it is sent.
 */
import { USDG, MORPHO as M, STOCKS } from '../config.js';
import { S, emit } from './store.js';
import { reader, send, I, multi, marketParams, allowance } from './chain.js';
import { signer } from './wallet.js';
import { liquidation, toAssetsUp } from './math.js';
import { farmCfg } from './derive.js';
import { tok } from '../lib/format.js';

const usdg = (raw) => tok(raw, USDG.decimals, 2);
const shares = (raw) => tok(raw, 18, 6);
const rp = () => reader(S.rpc);
const farmOfSym = (sym) => S.deploy.farms.find((f) => f.key === STOCKS[sym].farm);

async function freshMarket(sym) {
  const id = S.deploy.markets[sym].id;
  const [m] = await multi(rp(), [{ to: M.blue, iface: I.morpho, fn: 'market', args: [id] }]);
  if (!m) throw new Error('Could not read the market. Try again in a moment.');
  return { supply: m.totalSupplyAssets, supplyShares: m.totalSupplyShares, borrow: m.totalBorrowAssets, borrowShares: m.totalBorrowShares };
}

/**
 * Run a plan: [{ label, note?, skip?: async () => string|false, tx: async () => ({ to, data }) }].
 * onUpdate(view) gets the step list to draw after every change. Resolves { ok, error?, steps }.
 */
export async function run(plan, onUpdate, after) {
  if (S.busy) return { ok: false, error: 'Another transaction is running. Wait for it to finish.', steps: [] };
  const view = plan.map((p) => ({ label: p.label, note: p.note || '', state: 'todo' }));
  const draw = () => onUpdate(view.map((v) => ({ ...v })));
  draw();
  S.busy = true;
  emit('busy');
  let current = -1;
  try {
    const sg = await signer();
    for (let i = 0; i < plan.length; i++) {
      current = i;
      const p = plan[i];
      view[i].state = 'run';
      draw();
      const why = p.skip ? await p.skip() : false;
      if (why) { view[i].state = 'skipped'; view[i].note = why; draw(); continue; }
      const req = await p.tx();
      await send(rp(), sg, req, { onSent: (h) => { view[i].hash = h; view[i].note = 'Confirming on Robinhood Chain'; draw(); } });
      view[i].state = 'done';
      view[i].note = '';
      draw();
    }
    return { ok: true, steps: view };
  } catch (e) {
    if (current >= 0) { view[current].state = 'fail'; view[current].note = e.message || String(e); }
    draw();
    return { ok: false, error: e.message || String(e), steps: view };
  } finally {
    S.busy = false;
    emit('busy');
    if (after) after();
  }
}

/* ------------------------------------------------------------------------------------------------ loans */

/** Add collateral and/or borrow. collateral and amount are raw units (0n to skip that part). */
export function borrowPlan(sym, collateral, amount) {
  const mp = marketParams(S.deploy, sym);
  const me = S.account;
  const f = farmOfSym(sym);
  const agentName = farmCfg(f.key).agent;
  const id = S.deploy.markets[sym].id;
  const plan = [];
  if (collateral > 0n) {
    plan.push({
      label: `Approve ${shares(collateral)} ${sym} for Morpho`,
      skip: async () => ((await allowance(rp(), STOCKS[sym].token, me, M.blue)) >= collateral ? 'Already approved' : false),
      tx: async () => ({ to: STOCKS[sym].token, data: I.erc20.encodeFunctionData('approve', [M.blue, collateral]) }),
    });
    plan.push({
      label: `Deposit ${shares(collateral)} ${sym} as collateral`,
      tx: async () => ({ to: M.blue, data: I.morpho.encodeFunctionData('supplyCollateral', [mp, collateral, me, '0x']) }),
    });
  }
  if (amount > 0n) {
    plan.push({
      label: `Ask ${agentName} to bring USDG to ${sym}`,
      skip: async () => {
        const m = await freshMarket(sym);
        return m.supply - m.borrow >= amount ? 'The market already has enough' : false;
      },
      tx: async () => {
        const m = await freshMarket(sym);
        const short = amount - (m.supply > m.borrow ? m.supply - m.borrow : 0n);
        const need = short + short / 200n + 10n ** BigInt(USDG.decimals - 2); // half a percent and a cent of headroom for interest
        return { to: f.agent, data: I.agent.encodeFunctionData('pull', [id, need]) };
      },
    });
    plan.push({
      label: `Borrow ${usdg(amount)} USDG`,
      tx: async () => ({ to: M.blue, data: I.morpho.encodeFunctionData('borrow', [mp, amount, 0n, me, me]) }),
    });
  }
  return plan;
}

/** Repay part (amount) or all (full) of a loan, then optionally take all the collateral back. */
export function repayPlan(sym, amount, { full = false, withdrawAll = false } = {}) {
  const mp = marketParams(S.deploy, sym);
  const me = S.account;
  const id = S.deploy.markets[sym].id;
  let pos = null;
  const readPos = async () => {
    const [p] = await multi(rp(), [{ to: M.blue, iface: I.morpho, fn: 'position', args: [id, me] }]);
    if (!p) throw new Error('Could not read your loan. Try again in a moment.');
    pos = { borrowShares: p.borrowShares, collateral: p.collateral };
    return pos;
  };
  const owed = async () => {
    const p = await readPos();
    const m = await freshMarket(sym);
    const debt = toAssetsUp(p.borrowShares, m.borrow, m.borrowShares);
    return debt + debt / 500n + 10n ** BigInt(USDG.decimals - 2); // interest keeps running until the repay lands
  };
  const plan = [
    {
      label: full ? 'Approve USDG to repay the whole loan' : `Approve ${usdg(amount)} USDG for Morpho`,
      skip: async () => {
        const need = full ? await owed() : amount;
        return (await allowance(rp(), USDG.address, me, M.blue)) >= need ? 'Already approved' : false;
      },
      tx: async () => ({ to: USDG.address, data: I.erc20.encodeFunctionData('approve', [M.blue, full ? await owed() : amount]) }),
    },
    {
      label: full ? 'Repay the whole loan' : `Repay ${usdg(amount)} USDG`,
      tx: async () => {
        if (full) { const p = await readPos(); return { to: M.blue, data: I.morpho.encodeFunctionData('repay', [mp, 0n, p.borrowShares, me, '0x']) }; }
        return { to: M.blue, data: I.morpho.encodeFunctionData('repay', [mp, amount, 0n, me, '0x']) };
      },
    },
  ];
  if (full && withdrawAll) {
    plan.push({
      label: `Take back all your ${sym}`,
      skip: async () => ((await readPos()).collateral > 0n ? false : 'No collateral left'),
      tx: async () => { const p = await readPos(); return { to: M.blue, data: I.morpho.encodeFunctionData('withdrawCollateral', [mp, p.collateral, me, me]) }; },
    });
  }
  return plan;
}

export function withdrawCollateralPlan(sym, amount) {
  const mp = marketParams(S.deploy, sym);
  const me = S.account;
  return [{
    label: `Withdraw ${shares(amount)} ${sym}`,
    tx: async () => ({ to: M.blue, data: I.morpho.encodeFunctionData('withdrawCollateral', [mp, amount, me, me]) }),
  }];
}

/* ------------------------------------------------------------------------------------------------ farms */

export function depositPlan(key, amount) {
  const f = S.deploy.farms.find((x) => x.key === key);
  const name = farmCfg(key).agent;
  const me = S.account;
  return [
    {
      label: `Approve ${usdg(amount)} USDG for ${name}`,
      skip: async () => ((await allowance(rp(), USDG.address, me, f.agent)) >= amount ? 'Already approved' : false),
      tx: async () => ({ to: USDG.address, data: I.erc20.encodeFunctionData('approve', [f.agent, amount]) }),
    },
    {
      label: `${name} deposits ${usdg(amount)} USDG and places it`,
      tx: async () => ({ to: f.agent, data: I.agent.encodeFunctionData('deposit', [amount, me]) }),
    },
  ];
}

/** Withdraw `amount` USDG, or everything (all = true, redeems every share). */
export function farmWithdrawPlan(key, amount, { all = false } = {}) {
  const f = S.deploy.farms.find((x) => x.key === key);
  const name = farmCfg(key).agent;
  const me = S.account;
  const need = async () => {
    const calls = [
      { to: f.vault, iface: I.vault, fn: 'balanceOf', args: [me] },
      { to: USDG.address, iface: I.erc20, fn: 'balanceOf', args: [f.vault] },
    ];
    const [sh, idle] = await multi(rp(), calls);
    const shares = sh ? sh[0] : 0n;
    let assets = amount;
    if (all) { const [a] = await multi(rp(), [{ to: f.vault, iface: I.vault, fn: 'previewRedeem', args: [shares] }]); assets = a ? a[0] : 0n; }
    return { shares, assets, idle: idle ? idle[0] : 0n };
  };
  return [
    {
      label: `Ask ${name} to free the cash`,
      skip: async () => { const n = await need(); return n.idle >= n.assets ? 'The farm has enough cash on hand' : false; },
      tx: async () => { const n = await need(); return { to: f.agent, data: I.agent.encodeFunctionData('free', [n.assets]) }; },
    },
    {
      label: all ? 'Withdraw everything' : `Withdraw ${usdg(amount)} USDG`,
      tx: async () => {
        if (all) { const n = await need(); return { to: f.vault, data: I.vault.encodeFunctionData('redeem', [n.shares, me, me]) }; }
        return { to: f.vault, data: I.vault.encodeFunctionData('withdraw', [amount, me, me]) };
      },
    },
  ];
}

export function wakePlan(key) {
  const f = S.deploy.farms.find((x) => x.key === key);
  return [{ label: `Wake ${farmCfg(key).agent}: run the playbook`, tx: async () => ({ to: f.agent, data: I.agent.encodeFunctionData('work', []) }) }];
}

/* ------------------------------------------------------------------------------------------------ liquidations */

/** Close as much of an unhealthy loan as its collateral allows. Re-checks health right before sending. */
export function liquidatePlan(sym, borrower) {
  const mp = marketParams(S.deploy, sym);
  const id = S.deploy.markets[sym].id;
  const me = S.account;
  const fresh = async () => {
    const [p, mk, px] = await multi(rp(), [
      { to: M.blue, iface: I.morpho, fn: 'position', args: [id, borrower] },
      { to: M.blue, iface: I.morpho, fn: 'market', args: [id] },
      { to: S.deploy.markets[sym].oracle, iface: I.oracle, fn: 'price' },
    ]);
    if (!p || !mk || !px) throw new Error('Could not read the loan or its price right now.');
    const m = { borrow: mk.totalBorrowAssets, borrowShares: mk.totalBorrowShares };
    const pos = { collateral: p.collateral, borrowShares: p.borrowShares };
    if (pos.borrowShares === 0n) throw new Error('That loan is already closed.');
    const plan = liquidation(pos, m, px[0], BigInt(mp.lltv));
    return { ...plan, approve: plan.repaidAssets + plan.repaidAssets / 200n + 10n ** BigInt(USDG.decimals - 2) };
  };
  return [
    {
      label: 'Approve USDG for Morpho',
      skip: async () => { const x = await fresh(); return (await allowance(rp(), USDG.address, me, M.blue)) >= x.approve ? 'Already approved' : false; },
      tx: async () => { const x = await fresh(); return { to: USDG.address, data: I.erc20.encodeFunctionData('approve', [M.blue, x.approve]) }; },
    },
    {
      label: `Liquidate the ${sym} loan`,
      tx: async () => {
        const x = await fresh();
        return { to: M.blue, data: I.morpho.encodeFunctionData('liquidate', [mp, borrower, x.seizedAssets, x.repaidShares, '0x']) };
      },
    },
  ];
}
