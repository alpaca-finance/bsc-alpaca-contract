export interface FantomConfig {
  ProxyAdmin: string;
  Timelock: string;
  Multicall: string;
  Exchanges: Exchanges;
  Tokens: Tokens;
  SharedStrategies: SharedStrategies;
  SharedConfig: SharedConfig;
  Oracle: Oracle;
  Vaults: Vault[];
}

export interface Exchanges {
  SpookySwap: SpookySwap;
}

export interface SpookySwap {
  SpookyFactory: string;
  SpookyRouter: string;
  SpookyMasterChef: string;
  LpTokens: any[];
}

export interface Tokens {
  WFTM: string;
  BOO: string;
}

export interface SharedStrategies {
  SpookySwap: SpookySwap2;
}

export interface SpookySwap2 {
  StrategyAddBaseTokenOnly: string;
  StrategyLiquidate: string;
  StrategyWithdrawMinimizeTrading: string;
  StrategyPartialCloseLiquidate: string;
  StrategyPartialCloseMinimizeTrading: string;
}

export interface SharedConfig {
  TripleSlopeModel: string;
  WNativeRelayer: string;
  WorkerConfig: string;
}

export interface Oracle {
  OracleMedianizer: string;
  ChainLinkOracle: string;
  SimpleOracle: string;
}

export interface Vault {
  name: string;
  symbol: string;
  address: string;
  deployedBlock: number;
  baseToken: string;
  debtToken: string;
  config: string;
  tripleSlopeModel: string;
  StrategyAddTwoSidesOptimal: StrategyAddTwoSidesOptimal;
  workers: Worker[];
}

export interface StrategyAddTwoSidesOptimal {
  SpookySwap: string;
}

export interface Worker {
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
