export interface Config {
  ProxyAdmin: string;
  Timelock: string;
  Shield: string;
  MerkleDistributor: MerkleDistributor;
  GrazingRange: GrazingRange;
  FairLaunch: FairLaunch;
  Exchanges: Exchanges;
  Tokens: Tokens;
  LpTokens: LpTokens;
  SharedStrategies: SharedStrategies;
  SharedConfig: SharedConfig;
  Oracle: Oracle;
  Vaults: VaultsEntity[];
}
export interface MerkleDistributor {
  "ITAM-week-1": string;
  "ITAM-week-2": string;
  "ITAM-week-3": string;
  "ITAM-week-4": string;
}
export interface GrazingRange {
  address: string;
  deployedBlock: number;
  pools: PoolsEntity[];
}
export interface PoolsEntity {
  id: number;
  name: string;
  stakingToken: string;
  rewardToken: string;
}
export interface FairLaunch {
  address: string;
  deployedBlock: number;
  pools: PoolsEntity1[];
}
export interface PoolsEntity1 {
  id: number;
  stakingToken: string;
  address: string;
}
export interface Exchanges {
  Pancakeswap: Pancakeswap;
  Waultswap: Waultswap;
  Mdex: Mdex;
}
export interface Pancakeswap {
  UniswapV2Factory: string;
  UniswapV2Router02: string;
  FactoryV2: string;
  RouterV2: string;
  MasterChef: string;
  LpTokens: LpTokensEntity[];
}
export interface LpTokensEntity {
  pId: number;
  name: string;
  address: string;
}
export interface Waultswap {
  WexMaster: string;
  WaultswapRouter: string;
  WaultswapFactory: string;
  LpTokens: LpTokensEntity[];
}
export interface Mdex {
  BSCPool: string;
  MdexFactory: string;
  MdexRouter: string;
  SwapMining: string;
  LpTokens: LpTokensEntity[];
}
export interface Tokens {
  WBNB: string;
  ALPACA: string;
  sALPACA: string;
  BUSD: string;
  CAKE: string;
  SYRUP: string;
  USDT: string;
  BTCB: string;
  ETH: string;
  DOT: string;
  UNI: string;
  LINK: string;
  XVS: string;
  YFI: string;
  VAI: string;
  USDC: string;
  DAI: string;
  UST: string;
  BETH: string;
  COMP: string;
  SUSHI: string;
  ITAM: string;
  bMXX: string;
  BELT: string;
  BOR: string;
  BRY: string;
  pCWS: string;
  SWINGBY: string;
  DODO: string;
  WEX: string;
  BORING: string;
  WAULTx: string;
  ODDZ: string;
  ADA: string;
  FORM: string;
  MATIC: string;
  TUSD: string;
  TRX: string;
  BTT: string;
  ORBS: string;
  AXS: string;
  PMON: string;
  PHA: string;
  WUSD: string;
  ALM: string;
  KALA: string;
  SCIX: string;
  NAOS: string;
  MBOX: string;
  MDX: string;
  BMON: string;
  ARV: string;
}
export interface LpTokens {
  "ALPACA-WBNB": string;
  "ALPACA-WBNB (Legacy)": string;
  "sALPACA-ALPACA": string;
}
export interface SharedStrategies {
  Pancakeswap: PancakeswapOrWaultswapOrPancakeswapSingleAsset;
  Waultswap: PancakeswapOrWaultswapOrPancakeswapSingleAsset;
  PancakeswapSingleAsset: PancakeswapOrWaultswapOrPancakeswapSingleAsset;
  Mdex: PancakeswapOrWaultswapOrPancakeswapSingleAsset;
}
export interface PancakeswapOrWaultswapOrPancakeswapSingleAsset {
  StrategyAddBaseTokenOnly: string;
  StrategyLiquidate: string;
  StrategyWithdrawMinimizeTrading: string;
  StrategyPartialCloseLiquidate: string;
  StrategyPartialCloseMinimizeTrading: string;
}
export interface SharedConfig {
  TripleSlopeModel: string;
  TripleSlopeModelStable20Max150: string;
  TripleSlopeModel103: string;
  WNativeRelayer: string;
  WorkerConfig: string;
  PancakeswapSingleAssetWorkerConfig: string;
}
export interface Oracle {
  OracleMedianizer: string;
  ChainLinkOracle: string;
  SimpleOracle: string;
}
export interface VaultsEntity {
  name: string;
  symbol: string;
  address: string;
  deployedBlock: number;
  baseToken: string;
  debtToken: string;
  config: string;
  tripleSlopeModel: string;
  StrategyAddTwoSidesOptimal: StrategyAddTwoSidesOptimal;
  workers: WorkersEntity[];
}
export interface StrategyAddTwoSidesOptimal {
  Pancakeswap: string;
  Waultswap: string;
  PancakeswapSingleAsset: string;
  Mdex: string;
}
export interface WorkersEntity {
  name: string;
  address: string;
  deployedBlock: number;
  config: string;
  pId: number;
  stakingToken: string;
  stakingTokenAt: string;
  strategies: Strategies;
}
export interface Strategies {
  StrategyAddAllBaseToken: string;
  StrategyLiquidate: string;
  StrategyAddTwoSidesOptimal: string;
  StrategyWithdrawMinimizeTrading: string;
  StrategyPartialCloseLiquidate: string;
  StrategyPartialCloseMinimizeTrading: string;
}
