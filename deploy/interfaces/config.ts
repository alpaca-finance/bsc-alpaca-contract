export interface Config {
  ProxyAdmin: string;
  Timelock: string;
  MultiCall: string;
  Shield?: string;
  MerkleDistributor?: MerkleDistributor;
  GrazingRange?: GrazingRange;
  FairLaunch?: FairLaunch;
  MiniFL?: MiniFL;
  YieldSources: YieldSources;
  Tokens: Tokens;
  LpTokens?: LpTokens;
  SharedStrategies: SharedStrategies;
  SharedConfig: SharedConfig;
  Oracle: Oracle;
  Vaults: VaultsEntity[];
  DeltaNeutralVaults: DeltaNeutralVaultsEntity[];
  AutomatedVaultController?: AutomateVaultController;
  Creditors?: Creditor[];
  NFT?: Nft;
}

export interface Nft {
  NFTStaking: string;
}
export interface AutomateVaultController {
  address: string;
  creditors: string[];
}

export interface Creditor {
  name: string;
  address: string;
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
export interface MiniFL {
  address: string;
  deployedBlock: number;
  pools: PoolsEntity2[];
}
export interface PoolsEntity2 {
  id: number;
  stakingToken: string;
  address: string;
  rewarder: string;
}
export interface YieldSources {
  Pancakeswap?: Pancakeswap;
  PancakeswapMasterChefV2?: PancakeswapMasterChefV2;
  Waultswap?: Waultswap;
  Mdex?: Mdex;
  SpookySwap?: SpookySwap;
  TombFinance?: TombFinance;
  Biswap?: Biswap;
}

export interface Pancakeswap {
  UniswapV2Factory: string;
  UniswapV2Router02: string;
  FactoryV2: string;
  RouterV2: string;
  MasterChef: string;
  pools: YieldPoolsEntity[];
}
export interface YieldPoolsEntity {
  pId: number;
  name: string;
  address: string;
}
export interface PancakeswapMasterChefV2 {
  UniswapV2Factory: string;
  UniswapV2Router02: string;
  FactoryV2: string;
  RouterV2: string;
  MasterChefV2: string;
  pools: YieldPoolsEntity[];
}
export interface Waultswap {
  WexMaster: string;
  WaultswapRouter: string;
  WaultswapFactory: string;
  pools: YieldPoolsEntity[];
}
export interface Mdex {
  BSCPool: string;
  MdexFactory: string;
  MdexRouter: string;
  SwapMining: string;
  pools: YieldPoolsEntity[];
}
export interface SpookySwap {
  SpookyFactory: string;
  SpookyRouter: string;
  SpookyMasterChef: string;
  pools: YieldPoolsEntity[];
}
export interface TombFinance {
  SpookyFactory: string;
  SpookyRouter: string;
  TShareRewardPool: string;
  pools: YieldPoolsEntity[];
}

export interface Biswap {
  BiswapRouterV2: string;
  MasterChef: string;
  BiswapFactory: string;
  pools: YieldPoolsEntity[];
}

export interface Tokens extends DeltaNeutralVaultTokens {
  WBNB?: string;
  ALPACA?: string;
  sALPACA?: string;
  BUSD?: string;
  CAKE?: string;
  SYRUP?: string;
  USDT?: string;
  BTCB?: string;
  ETH?: string;
  DOT?: string;
  UNI?: string;
  LINK?: string;
  XVS?: string;
  YFI?: string;
  VAI?: string;
  USDC?: string;
  DAI?: string;
  UST?: string;
  BETH?: string;
  COMP?: string;
  SUSHI?: string;
  ITAM?: string;
  bMXX?: string;
  BELT?: string;
  BOR?: string;
  BRY?: string;
  pCWS?: string;
  SWINGBY?: string;
  DODO?: string;
  WEX?: string;
  BORING?: string;
  WAULTx?: string;
  ODDZ?: string;
  ADA?: string;
  FORM?: string;
  MATIC?: string;
  TUSD?: string;
  TRX?: string;
  BTT?: string;
  ORBS?: string;
  AXS?: string;
  PMON?: string;
  PHA?: string;
  WUSD?: string;
  ALM?: string;
  KALA?: string;
  SCIX?: string;
  NAOS?: string;
  MBOX?: string;
  MDX?: string;
  BMON?: string;
  ARV?: string;
  WFTM?: string;
  BOO?: string;
  USD?: string;
  TOMB?: string;
  TSHARE?: string;
  BSW?: string;
}
export interface DeltaNeutralVaultTokens {
  "n3x-BNBUSDT-PCS1"?: string;
  "n8x-BNBUSDT-PCS1"?: string;
  "n8x-BNBUSDT-PCS2"?: string;
  "n3x-BNBBUSD-PCS1"?: string;
  "n3x-BNBUSDT-PCS2"?: string;
  "n3x-BUBBUSD-PCS2"?: string;
  "n3x-BNBUSDT-BS1"?: string;
}
export interface LpTokens {
  "ALPACA-WBNB": string;
  "ALPACA-WBNB (Legacy)": string;
  "sALPACA-ALPACA": string;
}
export interface SharedStrategies {
  Pancakeswap?: SharedStrategiesGroup;
  Waultswap?: SharedStrategiesGroup;
  PancakeswapSingleAsset?: SharedStrategiesGroup;
  Mdex?: SharedStrategiesGroup;
  SpookySwap?: SharedStrategiesGroup;
  Biswap?: SharedStrategiesGroup;
}
export interface SharedStrategiesGroup {
  StrategyAddBaseTokenOnly: string;
  StrategyLiquidate: string;
  StrategyWithdrawMinimizeTrading: string;
  StrategyPartialCloseLiquidate: string;
  StrategyPartialCloseMinimizeTrading: string;
}

export interface SharedConfig {
  TwoSlopeModel?: string;
  TripleSlopeModel: string;
  TripleSlopeModelStable20Max150?: string;
  TripleSlopeModel103?: string;
  WNativeRelayer: string;
  WorkerConfig: string;
  PancakeswapSingleAssetWorkerConfig?: string;
}
export interface Oracle {
  OracleMedianizer: string;
  ChainLinkOracle: string;
  SimpleOracle: string;
  DeltaNeutralOracle?: string;
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
  Pancakeswap?: string;
  Waultswap?: string;
  PancakeswapSingleAsset?: string;
  Mdex?: string;
  SpookySwap?: string;
  Biswap?: string;
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
export interface DeltaNeutralVaultsEntity {
  name: string;
  symbol: string;
  address: string;
  deployedBlock: number;
  config: string;
  assetToken: string;
  stableToken: string;
  assetVault: string;
  stableVault: string;
  assetDeltaWorker: string;
  stableDeltaWorker: string;
  gateway: string;
  oracle: string;
  assetVaultPosId: string;
  stableVaultPosId: string;
}
