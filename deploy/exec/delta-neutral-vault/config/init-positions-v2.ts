import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  BEP20__factory,
  DeltaNeutralVault__factory,
  DeltaNeutralOracle__factory,
  DeltaNeutralVaultConfig__factory,
} from "../../../../typechain";
import { BigNumber } from "ethers";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { formatEther } from "ethers/lib/utils";
import { compare } from "../../../../utils/address";
import { Tokens, VaultsEntity } from "../../../interfaces/config";

enum DeltaVaultNeutralDepositSide {
  Long = "Long",
  Short = "Short",
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
      ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
      ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
      ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
      ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
      ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
      ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
      Check all variables below before execute the deployment script
      */

  interface IInitPositionV2Inputs {
    symbol: string;
    longDepositAmount: number;
    shortDepositAmount: number;
    leverage: number;

    expectedLongVaultSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config
    expectedLongTokenSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config

    expectedShortVaultSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config
    expectedShortTokenSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config
  }

  interface IDepositWorkByte {
    posId: number;
    vaultAddress: string;
    workerAddress: string;
    twoSidesStrat: string;
    principalAmount: BigNumber;
    borrowAmount: BigNumber;
    maxReturn: BigNumber;
    farmingTokenAmount: BigNumber;
    minLpReceive: BigNumber;
  }

  function buildDepositWorkByte(input: IDepositWorkByte): string {
    const workByte = ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256", "address", "uint256", "uint256", "uint256", "bytes"],
      [
        input.vaultAddress,
        input.posId,
        input.workerAddress,
        input.principalAmount,
        input.borrowAmount,
        input.maxReturn,
        ethers.utils.defaultAbiCoder.encode(
          ["address", "bytes"],
          [
            input.twoSidesStrat,
            ethers.utils.defaultAbiCoder.encode(["uint256", "uint256"], [input.farmingTokenAmount, input.minLpReceive]),
          ]
        ),
      ]
    );
    return workByte;
  }

  const initPositionInputs: IInitPositionV2Inputs[] = [
    {
      symbol: "L3x-BUSDBNB-PCS1",
      longDepositAmount: 0,
      shortDepositAmount: 300,
      leverage: 3,
      expectedLongVaultSymbol: "ibWBNB",
      expectedLongTokenSymbol: "WBNB",
      expectedShortVaultSymbol: "ibBUSD",
      expectedShortTokenSymbol: "BUSD",
    },
  ];
  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const tokenLists: any = config.Tokens;
  let nonce = await deployer.getTransactionCount();

  for (const initPositionInput of initPositionInputs) {
    console.log("===================================================================================");
    console.log(`>> Validating input`);

    if (
      initPositionInput.longDepositAmount < 0 ||
      initPositionInput.shortDepositAmount < 0 ||
      (initPositionInput.shortDepositAmount === 0 && initPositionInput.longDepositAmount === 0)
    )
      throw new Error(
        "error: invalid input, longDepositAmount or shortDepositAmount should greater than 0 at least 1 side"
      );

    const deltaNeutralVaultEntity = config.DeltaNeutralVaults.find((v) => v.symbol === initPositionInput.symbol);
    if (!deltaNeutralVaultEntity)
      throw new Error(`error: unable to find delta neutral vault info for ${initPositionInput.symbol}`);

    console.log(`>> Validating Long Vault input`);
    const longVault = _validateDeltaNeutralVaultBySymbol(
      config.Vaults,
      deltaNeutralVaultEntity.stableVault,
      initPositionInput.expectedLongVaultSymbol
    );
    console.log(`>> Validating Short Vault input`);
    const shortVault = _validateDeltaNeutralVaultBySymbol(
      config.Vaults,
      deltaNeutralVaultEntity.assetVault,
      initPositionInput.expectedShortVaultSymbol
    );

    console.log(`>> Validating Long Token input`);
    const longTokenAddress = _validateDeltaNeutralTokenBySymbol(
      tokenLists,
      deltaNeutralVaultEntity.stableToken,
      initPositionInput.expectedLongTokenSymbol as keyof Tokens
    );

    console.log(`>> Validating Short Token input`);
    const shortTokenAddress = _validateDeltaNeutralTokenBySymbol(
      tokenLists,
      deltaNeutralVaultEntity.assetToken,
      initPositionInput.expectedShortTokenSymbol as keyof Tokens
    );

    const longTokenAsDeployer = BEP20__factory.connect(longTokenAddress, deployer);
    const shortTokenAsDeployer = BEP20__factory.connect(shortTokenAddress, deployer);

    const [longTokenDecimal, shortTokenDecimal] = await Promise.all([
      longTokenAsDeployer.decimals(),
      shortTokenAsDeployer.decimals(),
    ]);

    if (longTokenDecimal > 18) {
      throw new Error(`error:not supported Long Token Decimal > 18, value ${longTokenDecimal}`);
    }
    if (shortTokenDecimal > 18) {
      throw new Error(`error:not supported Short Token Decimal > 18, value ${shortTokenDecimal}`);
    }

    // append this when have new swap integration
    let longTwoSidesStrat: string;
    let shortTwoSidesStrat: string;
    if (initPositionInput.symbol.includes("PCS")) {
      longTwoSidesStrat = longVault.StrategyAddTwoSidesOptimal.Pancakeswap!;
      shortTwoSidesStrat = shortVault.StrategyAddTwoSidesOptimal.Pancakeswap!;
    } else if (initPositionInput.symbol.includes("MDEX")) {
      longTwoSidesStrat = longVault.StrategyAddTwoSidesOptimal.Mdex!;
      shortTwoSidesStrat = shortVault.StrategyAddTwoSidesOptimal.Mdex!;
    } else if (initPositionInput.symbol.includes("SPK")) {
      longTwoSidesStrat = longVault.StrategyAddTwoSidesOptimal.SpookySwap!;
      shortTwoSidesStrat = shortVault.StrategyAddTwoSidesOptimal.SpookySwap!;
    } else if (initPositionInput.symbol.includes("BS")) {
      longTwoSidesStrat = longVault.StrategyAddTwoSidesOptimal.Biswap!;
      shortTwoSidesStrat = shortVault.StrategyAddTwoSidesOptimal.Biswap!;
    } else {
      throw new Error(`err: no symbol is not match any strategy, value ${initPositionInput.symbol}`);
    }

    console.log("✅ Done");

    console.log("===================================================================================");
    console.log(`>> Initializing position at ${initPositionInput.symbol}`);

    const deltaNeutralVaultAddress = deltaNeutralVaultEntity.address;

    console.log(">> Check allowance");
    if (initPositionInput.longDepositAmount > 0) {
      const longTokenAllowance = await longTokenAsDeployer.allowance(deployer.address, deltaNeutralVaultAddress);
      if (longTokenAllowance.eq(0)) {
        console.log(">> Approve vault to spend stable tokens");
        await longTokenAsDeployer.approve(deltaNeutralVaultAddress, ethers.constants.MaxUint256, {
          nonce: nonce++,
        });
      }
    }

    if (initPositionInput.shortDepositAmount > 0) {
      const shortTokenAllowance = await shortTokenAsDeployer.allowance(deployer.address, deltaNeutralVaultAddress);
      if (shortTokenAllowance.eq(0)) {
        console.log(">> Approve vault to spend asset tokens");
        await shortTokenAsDeployer.approve(deltaNeutralVaultAddress, ethers.constants.MaxUint256, {
          nonce: nonce++,
        });
      }
    }
    console.log(">> Allowance ok");

    console.log(`>> Preparing input`);

    const leverage = BigNumber.from(initPositionInput.leverage);

    const deltaNeutralOracle = DeltaNeutralOracle__factory.connect(config.Oracle.DeltaNeutralOracle!, deployer);

    const longDepositAmount = ethers.utils.parseUnits(initPositionInput.longDepositAmount.toString(), longTokenDecimal);
    const shortDepositAmount = ethers.utils.parseUnits(
      initPositionInput.shortDepositAmount.toString(),
      shortTokenDecimal
    );

    const [[longTokenPrice], [shortTokenPrice]] = await Promise.all([
      deltaNeutralOracle.getTokenPrice(longTokenAddress),
      deltaNeutralOracle.getTokenPrice(shortTokenAddress),
    ]);

    const {
      principalAmount: longPositionPrincipalAmount,
      farmingAmount: longPositionFarmingTokenAmount,
      borrowAmount: longPositionBorrowAmount,
    } = _getTokenInput(
      DeltaVaultNeutralDepositSide.Long,
      [longDepositAmount, shortDepositAmount],
      leverage,
      [longTokenPrice, shortTokenPrice],
      [longTokenDecimal, shortTokenDecimal]
    );
    const {
      principalAmount: shortPositionPrincipalAmount,
      farmingAmount: shortPositionFarmingTokenAmount,
      borrowAmount: shortPositionBorrowAmount,
    } = _getTokenInput(
      DeltaVaultNeutralDepositSide.Short,
      [shortDepositAmount, longDepositAmount],
      leverage,
      [shortTokenPrice, longTokenPrice],
      [shortTokenDecimal, longTokenDecimal]
    );

    console.log(`>> [Long] TokenAmount: ${longDepositAmount}`);
    console.log(`>> [Long] PrincipalAmount: ${formatEther(longPositionPrincipalAmount)}`);
    console.log(`>> [Long] FarmingTokenAmount: ${longPositionFarmingTokenAmount}`);
    console.log(`>> [Long] BorrowAmount: ${formatEther(longPositionBorrowAmount)}`);
    console.log(`>> [Long] TokenPrice: ${formatEther(longTokenPrice)}`);

    console.log(`>> [Short] TokenAmount: ${shortDepositAmount}`);
    console.log(`>> [Short] PrincipalAmount: ${formatEther(shortPositionPrincipalAmount)}`);
    console.log(`>> [Short] FarmingTokenAmount: ${formatEther(shortPositionFarmingTokenAmount)}`);
    console.log(`>> [Short] BorrowAmount: ${formatEther(shortPositionBorrowAmount)}`);
    console.log(`>> [Short] TokenPrice: ${formatEther(shortTokenPrice)}`);

    const longPositionWorkByteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: deltaNeutralVaultEntity.stableVault,
      workerAddress: deltaNeutralVaultEntity.stableDeltaWorker,
      twoSidesStrat: longTwoSidesStrat,
      principalAmount: longPositionPrincipalAmount,
      borrowAmount: longPositionBorrowAmount,
      farmingTokenAmount: longPositionFarmingTokenAmount,
      maxReturn: BigNumber.from(0),
      minLpReceive: BigNumber.from(0),
    };

    const shortPositionWorkByteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: deltaNeutralVaultEntity.assetVault,
      workerAddress: deltaNeutralVaultEntity.assetDeltaWorker,
      twoSidesStrat: shortTwoSidesStrat,
      principalAmount: shortPositionPrincipalAmount,
      borrowAmount: shortPositionBorrowAmount,
      farmingTokenAmount: shortPositionFarmingTokenAmount,
      maxReturn: BigNumber.from(0),
      minLpReceive: BigNumber.from(0),
    };

    const longWorkByte = buildDepositWorkByte(longPositionWorkByteInput);
    const shortWorkByte = buildDepositWorkByte(shortPositionWorkByteInput);

    const data = ethers.utils.defaultAbiCoder.encode(
      ["uint8[]", "uint256[]", "bytes[]"],
      [
        [1, 1],
        [0, 0],
        [longWorkByte, shortWorkByte],
      ]
    );

    const deltaNeutralVaultAsDeployer = DeltaNeutralVault__factory.connect(deltaNeutralVaultAddress, deployer);
    const deltaNeutralVaultConfigAsDeployer = DeltaNeutralVaultConfig__factory.connect(
      deltaNeutralVaultEntity.config,
      deployer
    );

    console.log(">> Calling openPosition");

    let nativeTokenAmount = BigNumber.from(0);
    const nativeTokenAddress = await deltaNeutralVaultConfigAsDeployer.getWrappedNativeAddr();
    if (compare(nativeTokenAddress, deltaNeutralVaultEntity.stableToken)) {
      nativeTokenAmount = longDepositAmount;
    }
    if (compare(nativeTokenAddress, deltaNeutralVaultEntity.assetToken)) {
      nativeTokenAmount = shortDepositAmount;
    }

    const minSharesReceive = ethers.utils.parseEther("0");
    const initTx = await (
      await deltaNeutralVaultAsDeployer.initPositions(longDepositAmount, shortDepositAmount, minSharesReceive, data, {
        value: nativeTokenAmount,
        nonce: nonce++,
        gasLimit: 8000000,
      })
    ).wait(3);
    console.log(">> initTx: ", initTx.transactionHash);
    console.log("✅ Done");

    const stablePosId = await deltaNeutralVaultAsDeployer.stableVaultPosId();
    const assetPostId = await deltaNeutralVaultAsDeployer.assetVaultPosId();

    console.log(`>> Stable Vault Position ID: ${stablePosId}`);
    console.log(`>> Asset Vault Position ID: ${assetPostId}`);
    console.log("✅ Done");

    config = configFileHelper.setDeltaNeutralVaultsInitPositionIds(initPositionInput.symbol, {
      stableVaultPosId: stablePosId.toString(),
      assetVaultPosId: assetPostId.toString(),
    });
  }
};

function _validateDeltaNeutralVaultBySymbol(
  vaultsList: VaultsEntity[],
  targetAddress: string,
  expectedVaultSymbol?: string
): VaultsEntity {
  const vault = vaultsList.find((v) => compare(v.address, targetAddress));
  if (!vault) throw new Error(`error: unable to find vault address ${targetAddress}`);
  if (!expectedVaultSymbol) {
    console.log(
      `>> ✅ [WARNING] use vault from delta neutral config address: ${targetAddress}, symbol: ${vault.symbol}`
    );
    return vault;
  }
  if (expectedVaultSymbol !== vault.symbol)
    throw new Error(`error: vault symbol mismatched actual: ${vault.symbol}, expect: ${expectedVaultSymbol}`);

  console.log(">> ✅ Passed");
  return vault;
}

function _validateDeltaNeutralTokenBySymbol(
  tokensList: Tokens,
  targetAddress: string,
  expectedTokenSymbol?: keyof Tokens
): string {
  const tokensSymbolWithAddress = Object.entries(tokensList);
  const targetToken = tokensSymbolWithAddress.find((d) => compare(d[1], targetAddress));
  if (!targetToken) throw new Error(`error: token not found, address: ${targetAddress}`);

  const targetTokenSymbol = targetToken[0];
  if (!expectedTokenSymbol) {
    console.log(
      `>> ✅ [WARNING] use token from delta neutral config address: ${targetAddress}, symbol: ${targetTokenSymbol}`
    );
    return targetAddress;
  }
  const expectedToken = tokensList[expectedTokenSymbol];
  if (!expectedToken) throw new Error(`error: expected token not found, symbol: ${expectedTokenSymbol}`);
  if (targetTokenSymbol !== expectedTokenSymbol)
    throw new Error(`error: token symbol mismatched actual: ${targetTokenSymbol}, expect: ${expectedTokenSymbol}`);
  if (!compare(targetAddress, expectedToken)) {
    throw new Error(`error: token address mismatched actual: ${targetAddress}, expect: ${expectedToken}`);
  }

  console.log(">> ✅ Passed");
  return targetAddress;
}

function _getTokenInput(
  depositSide: DeltaVaultNeutralDepositSide,
  depositTokensAmount: [BigNumber, BigNumber],
  leverage: BigNumber,
  tokenPrices: [BigNumber, BigNumber],
  decimals: [number, number]
): {
  principalAmount: BigNumber;
  farmingAmount: BigNumber;
  borrowAmount: BigNumber;
} {
  const [baseTokenPrice, farmingTokenPrice] = tokenPrices;
  const [baseDepositAmount, farmingDepositAmount] = depositTokensAmount;
  const [baseDecimal, farmingDecimal] = decimals;
  // principal amount formula for long equity amount = depositAmount * (lev - 2) / (2lev - 2)
  // principal amount formula for short equity amount = depositAmount * (lev) / (2lev - 2)
  const numerator = depositSide === DeltaVaultNeutralDepositSide.Long ? leverage.sub(2) : leverage;
  const denumerator = leverage.mul(2).sub(2);
  const borrowMultiplier = leverage.sub(1);
  const decimalDiff = baseDecimal - farmingDecimal;

  const principalAmount = baseDepositAmount.mul(numerator).div(denumerator);
  const farmingAmount = farmingDepositAmount.mul(numerator).div(denumerator);
  const convertedDecimalFarmingValue =
    decimalDiff > 0 ? farmingAmount.mul(10 ** decimalDiff) : farmingAmount.div(10 ** Math.abs(decimalDiff));
  // borrow amount calculation
  // farmingValue = farmingAmount * farmingTokenPrice
  // convertedPrincipalAmount = farmingValue / baseTokenPrice
  // actualPrincipalAmount = principalAmount + convertedPrincipalAmount
  // borrowAmount = actualPrincipalAmount * borrowMultiplier
  return {
    principalAmount,
    farmingAmount,
    borrowAmount: convertedDecimalFarmingValue
      .mul(farmingTokenPrice) // multiply by price to find value
      .div(baseTokenPrice) // divide by base token price to convert to base token amount
      .add(principalAmount) // combined with additional principal amount
      .mul(borrowMultiplier), // multiply by borrow factor
  };
}

export default func;
func.tags = ["DeltaNeutralVaultInitPositionsV2"];
