import { ContractFactory } from "ethers";
import { getConfig } from "./config";
import { ethers } from "hardhat";

export const PANCAKESWAPv2_STRAT_ID = "PancakeswapV2";
export const PANCAKESWAPv2_SINGLE_ASSET_STRAT_ID = "PancakeswapV2SingleAsset";
export const WAULTSWAP_STRAT_ID = "WaultSwap";

interface IProxyStrat {
  proxy: string;
  strat: Strats;
}

export enum Strats {
  btokenOnly = 0,
  twosides = 1,
  liquidateAll = 2,
  withdrawMinimize = 3,
  partialCloseLiquidate = 4,
  partialCloseWithdrawMinizmie = 5,
}

export function getShareStratsProxy(group: string): Array<IProxyStrat> {
  const config = getConfig();
  if (group === PANCAKESWAPv2_STRAT_ID) {
    return [
      {
        proxy: config.SharedStrategies.Pancakeswap.StrategyAddBaseTokenOnly,
        strat: Strats.btokenOnly,
      },
      {
        proxy: config.SharedStrategies.Pancakeswap.StrategyLiquidate,
        strat: Strats.liquidateAll,
      },
      {
        proxy: config.SharedStrategies.Pancakeswap.StrategyPartialCloseLiquidate,
        strat: Strats.partialCloseLiquidate,
      },
      {
        proxy: config.SharedStrategies.Pancakeswap.StrategyPartialCloseMinimizeTrading,
        strat: Strats.partialCloseWithdrawMinizmie,
      },
      {
        proxy: config.SharedStrategies.Pancakeswap.StrategyWithdrawMinimizeTrading,
        strat: Strats.withdrawMinimize,
      },
    ];
  }
  if (group === PANCAKESWAPv2_SINGLE_ASSET_STRAT_ID) {
    return [
      {
        proxy: config.SharedStrategies.PancakeswapSingleAsset.StrategyAddBaseTokenOnly,
        strat: Strats.btokenOnly,
      },
      {
        proxy: config.SharedStrategies.PancakeswapSingleAsset.StrategyLiquidate,
        strat: Strats.liquidateAll,
      },
      {
        proxy: config.SharedStrategies.PancakeswapSingleAsset.StrategyPartialCloseLiquidate,
        strat: Strats.partialCloseLiquidate,
      },
      {
        proxy: config.SharedStrategies.PancakeswapSingleAsset.StrategyPartialCloseMinimizeTrading,
        strat: Strats.partialCloseWithdrawMinizmie,
      },
      {
        proxy: config.SharedStrategies.PancakeswapSingleAsset.StrategyWithdrawMinimizeTrading,
        strat: Strats.withdrawMinimize,
      },
    ];
  }
  if (group === WAULTSWAP_STRAT_ID) {
    return [
      {
        proxy: config.SharedStrategies.Waultswap.StrategyAddBaseTokenOnly,
        strat: Strats.btokenOnly,
      },
      {
        proxy: config.SharedStrategies.Waultswap.StrategyLiquidate,
        strat: Strats.liquidateAll,
      },
      {
        proxy: config.SharedStrategies.Waultswap.StrategyPartialCloseLiquidate,
        strat: Strats.partialCloseLiquidate,
      },
      {
        proxy: config.SharedStrategies.Waultswap.StrategyPartialCloseMinimizeTrading,
        strat: Strats.partialCloseWithdrawMinizmie,
      },
      {
        proxy: config.SharedStrategies.Waultswap.StrategyWithdrawMinimizeTrading,
        strat: Strats.withdrawMinimize,
      },
    ];
  }
  throw "error";
}

export async function getStratFactory(group: string, strat: Strats): Promise<ContractFactory> {
  let newStratImpl: ContractFactory;
  let singleAsset = group.includes("SingleAsset") ? "SingleAsset" : "";
  group = singleAsset != "" ? group.replace("SingleAsset", "") : group;

  if (strat === Strats.btokenOnly) {
    newStratImpl = await ethers.getContractFactory(`${group}Restricted${singleAsset}StrategyAddBaseTokenOnly`);
  } else if (strat === Strats.twosides) {
    newStratImpl = await ethers.getContractFactory(`${group}Restricted${singleAsset}StrategyAddTwoSidesOptimal`);
  } else if (strat === Strats.withdrawMinimize) {
    newStratImpl = await ethers.getContractFactory(`${group}Restricted${singleAsset}StrategyWithdrawMinimizeTrading`);
  } else if (strat === Strats.liquidateAll) {
    newStratImpl = await ethers.getContractFactory(`${group}Restricted${singleAsset}StrategyLiquidate`);
  } else if (strat === Strats.partialCloseLiquidate) {
    newStratImpl = await ethers.getContractFactory(`${group}Restricted${singleAsset}StrategyPartialCloseLiquidate`);
  } else if (strat === Strats.partialCloseWithdrawMinizmie) {
    newStratImpl = await ethers.getContractFactory(
      `${group}Restricted${singleAsset}StrategyPartialCloseMinimizeTrading`
    );
  } else {
    throw "not found factory";
  }

  return newStratImpl;
}
