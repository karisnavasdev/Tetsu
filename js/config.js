/*
 * Tetsu Corp shared configuration (js/config.js).
 *
 * A plain ES module with no DOM access at import time: the pages, the API routes (api/*) and the tools (tools/*.mjs)
 * import the same file. tools/plan.mjs exports the deploy plan from here into contracts/plan.json for the forge
 * script, so this file is the one source of truth for stocks, tiers, caps, farms and parameters.
 *
 * The region between the GENERATED markers is rewritten by contracts/deploy.sh after a launch. Never edit it by hand.
 * While DEPLOY.farms is empty every page shows its pre-launch state.
 */

export const CHAIN = Object.freeze({
  id: 4663,
  hex: '0x1237',
  name: 'Robinhood Chain',
  rpc: 'https://rpc.mainnet.chain.robinhood.com',
  rpcProxy: '/api/rpc/4663', // browsers read through the site; the proxy refuses writes
  explorer: 'https://robinhoodchain.blockscout.com',
  nativeCurrency: Object.freeze({ name: 'Ether', symbol: 'ETH', decimals: 18 }),
  maxBatch: 5, // the public node refuses JSON-RPC batches bigger than this
  logsChunk: 10_000_000, // eth_getLogs block span per request with an address filter
  yearSeconds: 31536000,
});

export const BRAND = Object.freeze({
  name: 'Tetsu Corp',
  word: 'TETSU CORP',
  kana: 'テツ・コーポ',
  kanji: '鉄',
  domain: 'tetsucorp.si',
  url: 'https://tetsucorp.si',
  x: 'https://x.com/tetsucorp',
  xHandle: 'tetsucorp',
  footer: '2026 Tetsu Corp',
  tagline: 'Stock credit, farmed by agents',
});

export const USDG = Object.freeze({ address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', symbol: 'USDG', decimals: 6 });
// $TETSU, the Tetsu Corp coin on Robinhood Chain, and where to buy it
export const TOKEN = Object.freeze({ symbol: 'TETSU', address: '0xcomingsoon', buy: 'https://ponsfamily.com/launchpad/0xcomingsoon' });
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
export const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';

// Morpho's own deployments on Robinhood Chain (Morpho's address book, @morpho-org/morpho-ts, checked on chain 2026-10-22)
export const MORPHO = Object.freeze({
  blue: '0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010',
  irm: '0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1', // Adaptive Curve IRM
  vaultV2Factory: '0x0FBad98595b0186dA120E41f77C102beb49f803c',
  adapterFactory: '0x79370Ed003CE325C088E530d5e8655c99c2993e1', // MorphoMarketV1AdapterV2Factory
  registryList: '0xe785a2eFD384BA7B95BaEd3851BC76aeD67C676f',
});

export const WAD = 10n ** 18n;
export const LLTV = Object.freeze({ low: '385000000000000000', mid: '625000000000000000', high: '770000000000000000', top: '860000000000000000' });

/*
 * The 35 Robinhood stock tokens with a Chainlink feed, from priors.trade/api/stocks (the owner's site), 2026-10-22.
 * token: 18 decimals. feed: Chainlink proxy, 8 decimals, USD per token. lltv: the market's liquidation LTV (WAD).
 * farm: the one farm (agent) whose vault lends against this stock. cap: the vault's cap on this market, in USDG.
 */
const S = (name, token, feed, lltv, farm, cap) => Object.freeze({ name, token, feed, lltv: LLTV[lltv], farm, cap });
export const STOCKS = Object.freeze({
  // sora: index funds, treasuries, commodities
  SPY: S('SPDR S&P 500 ETF', '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', '0x319724394D3A0e3669269846abE664Cd621f9f6A', 'high', 'sora', 500000),
  QQQ: S('Invesco QQQ', '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', '0x80901d846d5D7B030F26B480776EE3b29374C2ae', 'high', 'sora', 500000),
  SGOV: S('iShares 0-3 Month Treasury', '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5', '0xa0DF4ee0fFf975306345875E3548Fcc519577A11', 'top', 'sora', 500000),
  EWY: S('iShares MSCI South Korea', '0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc', '0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1', 'mid', 'sora', 150000),
  SLV: S('iShares Silver Trust', '0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f', '0x209b73908e92Ae021826eD79609845451Ecba2ce', 'mid', 'sora', 150000),
  USO: S('United States Oil Fund', '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344', '0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c', 'mid', 'sora', 100000),
  // kira: the large caps
  AAPL: S('Apple', '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', '0x6B22A786bAa607d76728168703a39Ea9C99f2cD0', 'mid', 'kira', 300000),
  MSFT: S('Microsoft', '0xe93237C50D904957Cf27E7B1133b510C669c2e74', '0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E', 'mid', 'kira', 300000),
  GOOGL: S('Alphabet', '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', '0xF6f373a037c30F0e5010d854385cA89185AE638b', 'mid', 'kira', 300000),
  AMZN: S('Amazon', '0x12f190a9F9d7D37a250758b26824B97CE941bF54', '0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C', 'mid', 'kira', 300000),
  META: S('Meta Platforms', '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', '0x7C38C00C30BEe9378381E7B6135d7283356D71b1', 'mid', 'kira', 300000),
  NVDA: S('NVIDIA', '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15', 'mid', 'kira', 300000),
  TSM: S('Taiwan Semiconductor', '0x58FfE4a942d3885bAa22D7520691F611EF09e7AA', '0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F', 'mid', 'kira', 150000),
  ASML: S('ASML Holding', '0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA', '0xB4106147E8cce40b7d46124090d373A71b70f87D', 'mid', 'kira', 150000),
  ORCL: S('Oracle', '0xb0992820E760d836549ba69BC7598b4af75dEE03', '0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844', 'mid', 'kira', 150000),
  DELL: S('Dell', '0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd', '0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b', 'mid', 'kira', 100000),
  BABA: S('Alibaba', '0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4', '0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984', 'mid', 'kira', 100000),
  INTC: S('Intel', '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681', '0x3f390C5C24628Ac7C489515402235FeAD71D1913', 'mid', 'kira', 100000),
  // raiden: momentum and small caps
  TSLA: S('Tesla', '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', '0x4A1166a659A55625345e9515b32adECea5547C38', 'mid', 'raiden', 200000),
  AMD: S('AMD', '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', '0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72', 'mid', 'raiden', 100000),
  MU: S('Micron Technology', '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD', '0x425EEFdCf05ed6526C3cE61Af99429A228a6d596', 'mid', 'raiden', 100000),
  PLTR: S('Palantir', '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', '0x820ABedFF239034956B7A9d2F0a331f9F075eB4c', 'mid', 'raiden', 100000),
  SPCX: S('SpaceX', '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', '0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb', 'mid', 'raiden', 100000),
  COIN: S('Coinbase', '0x6330D8C3178a418788dF01a47479c0ce7CCF450b', '0xA3a468A452940B7D6b69991207B508c609a98Ef2', 'low', 'raiden', 50000),
  MSTR: S('Strategy', '0xec262a75e413fAfD0dF80480274532C79D42da09', '0x396118bdFB181e6240E74D243F266B061c0edc3D', 'low', 'raiden', 50000),
  GME: S('GameStop', '0x1b0E319c6A659F002271B69dB8A7df2F911c153E', '0x27C71df6A64fB476468EdF256CF72c038baB5B67', 'low', 'raiden', 25000),
  SNDK: S('Sandisk', '0xB90A19fF0Af67f7779afF50A882A9CfF42446400', '0xfb133Fa4B7b385802B693a293606682Df47109A3', 'low', 'raiden', 25000),
  CRCL: S('Circle', '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5', '0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a', 'low', 'raiden', 25000),
  CRWV: S('CoreWeave', '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3', '0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C', 'low', 'raiden', 25000),
  NBIS: S('Nebius Group', '0x9D9c6684F596F66a64C030B93A886D51Fd4D7931', '0xE1D87B116Ba0fe898998f1D140339D1fA1E09705', 'low', 'raiden', 25000),
  RKLB: S('Rocket Lab', '0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2', '0x045477BF65Aef6f4F2386ad0164579e48381CC74', 'low', 'raiden', 25000),
  USAR: S('USA Rare Earth', '0xd917B029C761D264c6A312BBbcDA868658eF86a6', '0xA994d3684e8400A6c8078226925779FdeE682DD9', 'low', 'raiden', 25000),
  IONQ: S('IonQ', '0x558378E000D634A36593E338eBacdd6207640EfE', '0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb', 'low', 'raiden', 25000),
  RGTI: S('Rigetti Computing', '0x284358abc07F9359f19f4b5b4aC91901Be2597Ba', '0x2A045cF1C49c61c166C036d2f06FA2D2d984f765', 'low', 'raiden', 10000),
  CLSK: S('CleanSpark', '0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3', '0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF', 'low', 'raiden', 10000),
});
export const SYMBOLS = Object.freeze(Object.keys(STOCKS));
export const stockLogo = (symbol) => `/img/stocks/${symbol}.png`;

// The three farms. Each is a Morpho Vault V2 lending USDG to its stocks' markets, run by its agent (TetsuAgent).
export const FARMS = Object.freeze([
  Object.freeze({
    key: 'sora', agent: 'SORA-01', kana: 'ソラ', role: 'Index cruiser', vaultName: 'Tetsu Sora Index USDG', vaultSymbol: 'tsSORA',
    risk: 'Lowest', blurb: 'Lends against index funds, treasuries and commodity funds. Slow and steady: the steadiest collateral.',
    buffer: 2000, img: 'sora',
  }),
  Object.freeze({
    key: 'kira', agent: 'KIRA-02', kana: 'キラ', role: 'Blue chip scout', vaultName: 'Tetsu Kira Blue Chip USDG', vaultSymbol: 'tsKIRA',
    risk: 'Medium', blurb: 'Lends against the largest companies: Apple, Microsoft, NVIDIA and their neighbours.',
    buffer: 1500, img: 'kira',
  }),
  Object.freeze({
    key: 'raiden', agent: 'RAIDEN-03', kana: 'ライデン', role: 'Momentum walker', vaultName: 'Tetsu Raiden Momentum USDG', vaultSymbol: 'tsRAIDEN',
    risk: 'Highest', blurb: 'Lends against fast movers and small caps: most at a 62.5% line, the most volatile at 38.5%. Expect more liquidations.',
    buffer: 500, img: 'raiden',
  }),
]);
export const farmOf = (symbol) => FARMS.find((f) => f.key === STOCKS[symbol]?.farm) || null;
export const stocksOf = (key) => SYMBOLS.filter((s) => STOCKS[s].farm === key);

// TetsuAgent parameters (same for every farm except the buffer above)
export const AGENT = Object.freeze({
  targetUtilization: '900000000000000000', // 90%, the Adaptive Curve IRM's own target
  idleBps: 500, // 5% of a farm kept idle for withdrawals
  minMove: '1000000', // 1 USDG
  workInterval: 600, // seconds between public work() calls
});

// Vault V2 settings applied at launch
export const VAULT = Object.freeze({
  performanceFee: '100000000000000000', // 10% of the interest, to the treasury
  managementFee: '0',
  forceDeallocatePenalty: '5000000000000000', // 0.5%
  maxRate: '63419583967', // MAX_MAX_RATE: 200% APR per second, in WAD
  timelock: 259200, // 3 days on every risk-raising curator action
  adapterCap: 5000000, // USDG, per farm
});

export const ORACLE = Object.freeze({ maxFeedAge: 432000 }); // 5 days

// GENERATED:DEPLOY:BEGIN
export const DEPLOY = {
  block: 95057865, at: 1792666466, treasury: '0xb53cB636243AAD194628B88Cfcd770fFBE0cEDd8',
  oracles: {
    SPY: '0x4230F719014982c5c975A74167B75E838775cb59',
    QQQ: '0x6346c2DB5517C6984a8Cdb2D78C24eA392bD3E04',
    SGOV: '0x52C8CBfe24c337C6715CCF6e3Ea295c91059c580',
    EWY: '0xbe1A7CF2D79ef0fa3D288c261f4Cc1EF34494AAA',
    SLV: '0xFfbE03c99092b6E2B435dB22620644a9d75113BD',
    USO: '0xEF2BB12751Fe1D4B437011c129BB6b9711969663',
    AAPL: '0x20EBd181B0337b0c20acC8ad81dd6422e0f33BBD',
    MSFT: '0x777E4504768982A5F11d4A55415A493D50AFe265',
    GOOGL: '0xd0bFe203E1A226d69e5B31C776A624e49B7EB28c',
    AMZN: '0xAd1a720E543dCFd962dd9E80Fc00e746CdbB5019',
    META: '0x6cA20C54693c4F91e25D8AA321d636F21b91AB84',
    NVDA: '0x6603EaEd79775325CD2C8E639e63F75bFACF1474',
    TSM: '0x7A0E9c41b1B6339910e99369a901e229C138599a',
    ASML: '0x4AEdCa399E1f930218F604c76FD62010211107AB',
    ORCL: '0x48ba356E8A6829ae1c4fd4fC4D81fa012DAC3014',
    DELL: '0x9ec6E2095B59542557af488eF1d064A6e6D56c1E',
    BABA: '0x65141Ff76411a15F0Dd36E3E5D953939da0E0Bd3',
    INTC: '0x6d2608A7D3C906adC4ED5d7f0e181CCA05AeCb64',
    TSLA: '0x03237E85D1676e7Cf0220e27fBC500600Ba0f0dC',
    AMD: '0x4cbBeD06E16B41e5700AA1DB4bECb166138f9966',
    MU: '0x11D4c0B7c390F696b3255F9002731AeF7E0bD9bC',
    PLTR: '0x3885F1CE837D6E48108a4b98A21f9dE04D07Fb7E',
    SPCX: '0xf6480E0b3453771739291d7333649ECeaEEa64F4',
    COIN: '0x20C44e7957387AA27799CB6Cb535D88Ba7805020',
    MSTR: '0x060567d35d65124c98469c05592Ce5c50E43E0c9',
    GME: '0x2cC36eA6692be509870b7c99eE5e83c10662A5DB',
    SNDK: '0x4781D8B3e288a49aF31C7C042065F0aCEDa9Aab6',
    CRCL: '0x30db01f566017231195466f5567AC6891745cC23',
    CRWV: '0x34D3DEA62935b67B1b86f102aD5153c95810B6F3',
    NBIS: '0x855e58f8A27Ca71a9Fa37C6e98FFA37a79Ef1DA4',
    RKLB: '0x7744B86C97455a8740E8918F595a128dd0513832',
    USAR: '0x95EC8d6dd5e718a72876e3a40C650cD21bfCA7cA',
    IONQ: '0xbFdf14027761c754281aC106294D48485ba7c581',
    RGTI: '0x40E4b1255584811715dE85f12506275c9c8708Fb',
    CLSK: '0xE348bb9D5008Dbe49A30B5A4a4702Dd59Aa163BB',
  },
  markets: {
    SPY: { id: '0x23c0167aadf110116e6c097c19c1df7821e14b2a41c59feffb48382a7c8adc83', oracle: '0x4230F719014982c5c975A74167B75E838775cb59', lltv: '770000000000000000' },
    QQQ: { id: '0x450ff6334e7c184fed83e75b60728ad345ef5225d9abe706bfe11afb6c69e6ba', oracle: '0x6346c2DB5517C6984a8Cdb2D78C24eA392bD3E04', lltv: '770000000000000000' },
    SGOV: { id: '0xac906b22ff796d37cdd6386cd2ac61b6cf16763da9e7db9610ae9380e087755f', oracle: '0x52C8CBfe24c337C6715CCF6e3Ea295c91059c580', lltv: '860000000000000000' },
    EWY: { id: '0x7395d94aa9a6c7aa3cd752fc5c92f2f4a231e65e6aec1cac5a06c6cacd495b39', oracle: '0xbe1A7CF2D79ef0fa3D288c261f4Cc1EF34494AAA', lltv: '625000000000000000' },
    SLV: { id: '0x8a0d62ab140e38fc191182f355c1d07c044ac5cd6b453fbb68207ebc7f45ed25', oracle: '0xFfbE03c99092b6E2B435dB22620644a9d75113BD', lltv: '625000000000000000' },
    USO: { id: '0xa043b04de6a5a79165791bad1ffd83be5711e2777359a0c1573c9457acd43525', oracle: '0xEF2BB12751Fe1D4B437011c129BB6b9711969663', lltv: '625000000000000000' },
    AAPL: { id: '0x267631a84fd19ad83507b01a8ea998e7f4fed6176225f91cfd8f51a8d5dd70cf', oracle: '0x20EBd181B0337b0c20acC8ad81dd6422e0f33BBD', lltv: '625000000000000000' },
    MSFT: { id: '0x0a0aaf0d246540dda02cf1b8d96cd9463285a74288811b1ec93fa5de58858b96', oracle: '0x777E4504768982A5F11d4A55415A493D50AFe265', lltv: '625000000000000000' },
    GOOGL: { id: '0x3d1ee48fa4e9154b7db671908accc0a3b7a19cbed1bfdfe441de57320c419b43', oracle: '0xd0bFe203E1A226d69e5B31C776A624e49B7EB28c', lltv: '625000000000000000' },
    AMZN: { id: '0x9e3eb14761cca8f142028e5b9c9e1baac6fe9dfd5fb9e1d1c740dd44f7f6377f', oracle: '0xAd1a720E543dCFd962dd9E80Fc00e746CdbB5019', lltv: '625000000000000000' },
    META: { id: '0x9f68e9e709d8a8325d103eb9966bac95da91f5260d3497b16aa513d36c27970f', oracle: '0x6cA20C54693c4F91e25D8AA321d636F21b91AB84', lltv: '625000000000000000' },
    NVDA: { id: '0xd7332755b50c2b6224837fbeb97676fccd93a92cc7aa3e319674afae0e802cf9', oracle: '0x6603EaEd79775325CD2C8E639e63F75bFACF1474', lltv: '625000000000000000' },
    TSM: { id: '0x64c8368644dd17f4b91751db89d4a60dc39d8b26c87b2260835e859e88f9287c', oracle: '0x7A0E9c41b1B6339910e99369a901e229C138599a', lltv: '625000000000000000' },
    ASML: { id: '0x2e4e2917cbbaf4044f51ce19b73a562534a5bb4e74a947b2d38bf78d137d4da2', oracle: '0x4AEdCa399E1f930218F604c76FD62010211107AB', lltv: '625000000000000000' },
    ORCL: { id: '0x46d0643ec205745da7e9f204eb45b18e0421dbf92e79fea668e7d9e453392933', oracle: '0x48ba356E8A6829ae1c4fd4fC4D81fa012DAC3014', lltv: '625000000000000000' },
    DELL: { id: '0x196d28d94d07ea6ccdc37afdd8e6fc102c0bf95ad838fd52df29c0c73e5b1373', oracle: '0x9ec6E2095B59542557af488eF1d064A6e6D56c1E', lltv: '625000000000000000' },
    BABA: { id: '0x5a24d241e793d13a504f1dcc8d184ef0e2e73d929e7932fa74085f5eb551eb17', oracle: '0x65141Ff76411a15F0Dd36E3E5D953939da0E0Bd3', lltv: '625000000000000000' },
    INTC: { id: '0x185417b9e084506510dada65c4323057aa0e88f5214de5ebbbb121a887f99df5', oracle: '0x6d2608A7D3C906adC4ED5d7f0e181CCA05AeCb64', lltv: '625000000000000000' },
    TSLA: { id: '0xf29691a2b64f8febf488673b4539620dabf78873c1716572381c7a5b4c1fa1b5', oracle: '0x03237E85D1676e7Cf0220e27fBC500600Ba0f0dC', lltv: '625000000000000000' },
    AMD: { id: '0x045452491ffeba4c8f4d1406fac88b1f6fc0f9d464922e100c67580159164759', oracle: '0x4cbBeD06E16B41e5700AA1DB4bECb166138f9966', lltv: '625000000000000000' },
    MU: { id: '0x128e56059bce2368bb009befb920fbae224f82e1025d532acc9546dfa4701b70', oracle: '0x11D4c0B7c390F696b3255F9002731AeF7E0bD9bC', lltv: '625000000000000000' },
    PLTR: { id: '0x6e76af7c6b6ee4e0a60d5acc4f918fe4a132280ec070a0521498bdff8727141c', oracle: '0x3885F1CE837D6E48108a4b98A21f9dE04D07Fb7E', lltv: '625000000000000000' },
    SPCX: { id: '0x7f409a542c8631e0166baab271519a64974630843e431aa26f3b8eb0cc9cd99f', oracle: '0xf6480E0b3453771739291d7333649ECeaEEa64F4', lltv: '625000000000000000' },
    COIN: { id: '0x8c8b82adeaa569220b0ef47b40c3f89eceb36ab5e7770da7462b1bee60aa8645', oracle: '0x20C44e7957387AA27799CB6Cb535D88Ba7805020', lltv: '385000000000000000' },
    MSTR: { id: '0x8cd1c04d0a0abeeaaf52884f245f8f7d6753c67b7604920bd3edae40ae2484ff', oracle: '0x060567d35d65124c98469c05592Ce5c50E43E0c9', lltv: '385000000000000000' },
    GME: { id: '0x84eb03146feafc87eab0ab68c0b7205f97d014d4d00cf6c7a36a2a71b342aa66', oracle: '0x2cC36eA6692be509870b7c99eE5e83c10662A5DB', lltv: '385000000000000000' },
    SNDK: { id: '0x8834e2bc4fb3c2779fb1dcc494d9d9e9f1ace039ea5033bc9d40df349a087ee8', oracle: '0x4781D8B3e288a49aF31C7C042065F0aCEDa9Aab6', lltv: '385000000000000000' },
    CRCL: { id: '0x3bd9724f1ac9d1def7d7fddc70bfb86f37cae7b4f1f47a6401e79b4662f79296', oracle: '0x30db01f566017231195466f5567AC6891745cC23', lltv: '385000000000000000' },
    CRWV: { id: '0x92c49cce11a426d8aefa7202699e29cc79e7e5bccf14b1c750e528b7c0d62601', oracle: '0x34D3DEA62935b67B1b86f102aD5153c95810B6F3', lltv: '385000000000000000' },
    NBIS: { id: '0xefa03a0f992883f241bdddcdaa3af5e21b0d8d6e733b878071c22162a2a62d05', oracle: '0x855e58f8A27Ca71a9Fa37C6e98FFA37a79Ef1DA4', lltv: '385000000000000000' },
    RKLB: { id: '0xe799b12f5a09ce8ff0f4656ee957f35a4bf595ace1613217a5bff68a7becdb6f', oracle: '0x7744B86C97455a8740E8918F595a128dd0513832', lltv: '385000000000000000' },
    USAR: { id: '0x182b1eb9e77bf627b39cf287d89ba07e278ab44c1f5f574651f6db90e8878438', oracle: '0x95EC8d6dd5e718a72876e3a40C650cD21bfCA7cA', lltv: '385000000000000000' },
    IONQ: { id: '0x342021bd29f097577ef3c64844819705ae9732dfd919f1598c3260ae9318965c', oracle: '0xbFdf14027761c754281aC106294D48485ba7c581', lltv: '385000000000000000' },
    RGTI: { id: '0x63573721ba85236bcdef4ed9ea85cf748354cb4b927a33e03430c1a3709e1c18', oracle: '0x40E4b1255584811715dE85f12506275c9c8708Fb', lltv: '385000000000000000' },
    CLSK: { id: '0x3e038f48e44dd03a92d2598cbffdcf66141a13546f3b20ecc6c527d98581ac3d', oracle: '0xE348bb9D5008Dbe49A30B5A4a4702Dd59Aa163BB', lltv: '385000000000000000' },
  },
  farms: [
    { key: 'sora', vault: '0x35F5c4BBF31363ed422d5346bF62BD26b1eE43dB', adapter: '0x64176fB23843b62408F92833148703408479675d', agent: '0xA574B90c008F23fC5892b9A4e876157B0e63f4e5' },
    { key: 'kira', vault: '0xFFf57098678DdE39705Dc707879613c385f9Cc3B', adapter: '0x1fBe050cf105AEFd930d9b8E09eE5a73D819D42c', agent: '0x237AABD1b13fDc730C4C176ff2C08aA801371b99' },
    { key: 'raiden', vault: '0xEBdFB33a2F2F302DD72d0660181a24194D1c35F6', adapter: '0x29fac68e7298dBfA957E4A47C5738e246f37C535', agent: '0xe5Cc5CE06A1cf1B58fd299bBdFA562a51918AB58' },
  ],
};
// GENERATED:DEPLOY:END

export const isLaunched = (d = DEPLOY) => Array.isArray(d.farms) && d.farms.length > 0 && /^0x[0-9a-fA-F]{40}$/.test(d.farms[0].vault || '');

/*
 * Local testing against a fork. Honoured only when the page is served from 127.0.0.1 or localhost:
 *   /app?deploy=/data/fork-deploy.json&rpc=http://127.0.0.1:8872
 * `deploy` is a same-origin URL of a deployments JSON in the DEPLOY shape, `rpc` a loopback node URL.
 * Returns { deploy, rpc, local } with the production values when there is no override.
 */
export const isLocalHost = () =>
  typeof location !== 'undefined' && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);

export async function runtime() {
  const out = { deploy: DEPLOY, rpc: CHAIN.rpcProxy, local: false };
  if (!isLocalHost()) return out;
  const q = new URLSearchParams(location.search);
  const remember = (k, v) => { try { if (v) globalThis.sessionStorage.setItem('tsu.' + k, v); } catch {} };
  const recall = (k) => { try { return globalThis.sessionStorage.getItem('tsu.' + k) || ''; } catch { return ''; } };
  const deployUrl = q.get('deploy') || recall('deploy');
  const rpc = q.get('rpc') || recall('rpc');
  remember('deploy', q.get('deploy'));
  remember('rpc', q.get('rpc'));
  if (rpc && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/.test(rpc)) { out.rpc = rpc; out.local = true; }
  if (deployUrl && deployUrl.startsWith('/')) {
    try {
      const j = await (await fetch(deployUrl, { cache: 'no-store' })).json();
      out.deploy = { block: j.block || 0, at: j.at || 0, treasury: j.treasury || '', oracles: j.oracles || {}, markets: j.markets || {}, farms: j.farms || [] };
      out.local = true;
    } catch {}
  }
  return out;
}
