// js/app/abi.js: the human-readable ABIs the app talks to the chain with (ethers v6 Interface strings).

export const MP = 'tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)';
const MARKET = 'tuple(uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)';

export const ERC20 = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export const MORPHO = [
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  `function supplyCollateral(${MP} marketParams, uint256 assets, address onBehalf, bytes data)`,
  `function withdrawCollateral(${MP} marketParams, uint256 assets, address onBehalf, address receiver)`,
  `function borrow(${MP} marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)`,
  `function repay(${MP} marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)`,
  `function liquidate(${MP} marketParams, address borrower, uint256 seizedAssets, uint256 repaidShares, bytes data) returns (uint256, uint256)`,
];

export const IRM = [`function borrowRateView(${MP} marketParams, ${MARKET} market) view returns (uint256)`];
export const FEED = ['function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)'];
export const ORACLE = ['function price() view returns (uint256)'];

export const VAULT = [
  'function balanceOf(address account) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address onBehalf) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address onBehalf) returns (uint256)',
  'function performanceFee() view returns (uint96)',
];

export const AGENT = [
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function work()',
  'function pull(bytes32 id, uint256 assets) returns (uint256 moved)',
  'function free(uint256 assets) returns (uint256 freed)',
  'function lastWork() view returns (uint256)',
  'function isKeeper(address account) view returns (bool)',
  'function owner() view returns (address)',
  'function params() view returns (uint256 targetUtilization, uint256 buffer, uint256 idleBps, uint256 minMove, uint256 workInterval)',
  'function preview() view returns (tuple(bytes32 id, uint256 ours, uint256 supply, uint256 borrow, uint256 fill, uint256 target, uint256 room)[] rows, uint256 idle, uint256 total)',
];

export const MULTICALL3 = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
];

// Revert reasons people can act on. Morpho Blue reverts with strings; Vault V2 and the agents with custom errors.
export const REASONS = [
  [/insufficient liquidity/i, 'The market does not have that much USDG free right now. Ask the agent for liquidity, or borrow less.'],
  [/insufficient collateral/i, 'That would put the loan past its limit. Borrow less or add collateral first.'],
  [/position is healthy/i, 'That loan is healthy again, so it cannot be liquidated.'],
  [/zero assets|zero shares|inconsistent input/i, 'Enter an amount above zero.'],
  [/transfer(From)? (reverted|returned false)|exceeds balance|insufficient balance/i, 'Your wallet does not hold enough for that.'],
  [/allowance/i, 'The approval was not enough. Approve again and retry.'],
  [/StaleFeed|PriceStale|Stale/i, 'The stock\'s price feed has not updated for five days, so this market is paused.'],
  [/TooSoon|WorkTooSoon|Cooldown/i, 'The agent ran a moment ago. Anyone can wake it again in a few minutes.'],
  [/ExceedsPosition|NotEnoughShares|TooMuch/i, 'You can only free up to what you hold in this farm.'],
  [/AbsoluteCapExceeded|ZeroAbsoluteCap|Cap/i, 'That market is at its farm\'s cap.'],
];
