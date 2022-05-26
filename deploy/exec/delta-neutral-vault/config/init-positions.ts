import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  BEP20__factory,
  DeltaNeutralVault__factory,
  DeltaNeutralOracle__factory,
  ConfigurableInterestVaultConfig__factory,
} from "../../../../typechain";
import { BigNumber } from "ethers";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { formatEther } from "ethers/lib/utils";

// WARING: this version is deprecated, please use init-positions-v2
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

  interface IInitPositionInputs {
    symbol: string;
    stableVaultSymbol: string;
    assetVaultSymbol: string;
    stableSymbol: string;
    assetSymbol: string;
    stableAmount: string;
    leverage: number;
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

  const initPositionInputs: IInitPositionInputs[] = [
    {
      symbol: "L3x-BUSDBTCB-PCS2",
      stableVaultSymbol: "ibUSDT",
      assetVaultSymbol: "ibETH",
      stableSymbol: "USDT",
      assetSymbol: "ETH",
      stableAmount: "300", // stable token amount to open the positions
      leverage: 3,
    },
  ];
  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();

  const tokenLists: any = config.Tokens;
  let nonce = await deployer.getTransactionCount();
  let stableTwoSidesStrat: string;
  let assetTwoSidesStrat: string;

  for (let i = 0; i < initPositionInputs.length; i++) {
    const initPosition = initPositionInputs[i];
    console.log("===================================================================================");
    console.log(`>> Initializing position at ${initPosition.symbol}`);
    const deltaNeutralVaultInfo = config.DeltaNeutralVaults.find((v) => v.symbol === initPosition.symbol);
    const stableVault = config.Vaults.find((v) => v.symbol === initPosition.stableVaultSymbol);
    const assetVault = config.Vaults.find((v) => v.symbol === initPosition.assetVaultSymbol);
    const stableToken = tokenLists[initPosition.stableSymbol];
    const assetToken = tokenLists[initPosition.assetSymbol];
    const stableTokenAsDeployer = BEP20__factory.connect(stableToken, deployer);
    const assetTokenAsDeployer = BEP20__factory.connect(assetToken, deployer);

    const [stableDecimal, assetDecimal] = await Promise.all([
      stableTokenAsDeployer.decimals(),
      assetTokenAsDeployer.decimals(),
    ]);

    if (!deltaNeutralVaultInfo) {
      throw new Error(`error: unable to find delta neutral vault info for ${initPosition.symbol}`);
    }
    if (!stableVault) {
      throw new Error(`error: unable to find vault from ${initPosition.stableVaultSymbol}`);
    }
    if (!assetVault) {
      throw new Error(`error: unable to find vault from ${initPosition.assetVaultSymbol}`);
    }
    if (stableDecimal > 18) {
      throw new Error(`error:not supported stableTokenDecimal > 18, value  ${stableDecimal}`);
    }
    if (assetDecimal > 18) {
      throw new Error(`error:not supported assetDecimal > 18, value  ${assetDecimal}`);
    }

    if (initPosition.symbol.includes("PCS")) {
      stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Pancakeswap!;
      assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Pancakeswap!;
    } else if (initPosition.symbol.includes("MDEX")) {
      stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Mdex!;
      assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Mdex!;
    } else if (initPosition.symbol.includes("SPK")) {
      stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.SpookySwap!;
      assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.SpookySwap!;
    } else if (initPosition.symbol.includes("BS")) {
      stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Biswap!;
      assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Biswap!;
    } else {
      throw new Error(`err: no symbol is not match any strategy, value ${initPosition.symbol}`);
    }

    console.log(">> Check allowance");
    const stableTokenAllowance = await stableTokenAsDeployer.allowance(deployer.address, deltaNeutralVaultInfo.address);
    const assetTokenAllowance = await assetTokenAsDeployer.allowance(deployer.address, deltaNeutralVaultInfo.address);
    if (stableTokenAllowance.eq(0) || assetTokenAllowance.eq(0)) {
      console.log(">> Approve vault to spend stable tokens");
      await stableTokenAsDeployer.approve(deltaNeutralVaultInfo.address, ethers.constants.MaxUint256, {
        nonce: nonce++,
      });
    }
    if (assetTokenAllowance.eq(0)) {
      console.log(">> Approve vault to spend asset tokens");
      await assetTokenAsDeployer.approve(deltaNeutralVaultInfo.address, ethers.constants.MaxUint256, {
        nonce: nonce++,
      });
    }
    console.log(">> Allowance ok");

    const deltaNeutralOracle = DeltaNeutralOracle__factory.connect(config.Oracle.DeltaNeutralOracle!, deployer);
    const [stablePrice] = await deltaNeutralOracle.getTokenPrice(stableToken);
    const [assetPrice] = await deltaNeutralOracle.getTokenPrice(assetToken);

    console.log(`stablePrice: ${stablePrice}`);
    console.log(`assetPrice: ${assetPrice}`);

    // open position1
    console.log(">> Preparing input for position 1 (StableVaults)");

    const stableAmount = ethers.utils.parseUnits(initPosition.stableAmount, stableDecimal);
    console.log(`>> Stable amount: ${stableAmount}`);

    const assetAmount = ethers.utils.parseUnits("0", assetDecimal);
    console.log(`>> assetAmount: ${assetAmount}`);

    const leverage = BigNumber.from(initPosition.leverage);

    // (lev -2) / (2lev - 2) for long equity amount
    const numeratorLongPosition = leverage.sub(2);
    const denumeratorLongPosition = leverage.mul(2).sub(2);
    const principalStablePosition = stableAmount.mul(numeratorLongPosition).div(denumeratorLongPosition);
    console.log(`>> principalStablePosition: ${formatEther(principalStablePosition)}`);

    const farmingTokenStablePosition = ethers.utils.parseEther("0");
    console.log(`>> farmingTokenStablePosition: ${farmingTokenStablePosition}`);

    const borrowMultiplierPosition = leverage.sub(1);
    const borrowAmountStablePosition = principalStablePosition.mul(borrowMultiplierPosition);
    console.log(`>> borrowAmountStablePosition: ${formatEther(borrowAmountStablePosition)}`);

    //open position 2
    console.log(">> Preparing input for position 2 (AssetVaults)");
    const principalAssetPosition = ethers.utils.parseEther("0");
    console.log(`>> principalAssetPosition: ${formatEther(principalAssetPosition)}`);

    // (lev) / (2lev - 2) for short equity amount
    const numeratorShortPosition = leverage;
    const denumeratorShortPosition = leverage.mul(2).sub(2);
    const farmingTokenAssetPosition = stableAmount.mul(numeratorShortPosition).div(denumeratorShortPosition);
    console.log(`>> farmingTokenAssetPosition: ${formatEther(farmingTokenAssetPosition)}`);

    //(farmingTokenAssetPosition / assetPrice) * (lev-1)
    const assetTokenConversionFactor = assetDecimal - stableDecimal;
    const borrowAmountAssetPosition = farmingTokenAssetPosition
      .mul(ethers.constants.WeiPerEther)
      .mul(borrowMultiplierPosition)
      .mul(10 ** assetTokenConversionFactor)
      .div(assetPrice);

    console.log(`>> borrowAmountAssetPosition: ${formatEther(borrowAmountAssetPosition)}`);

    const stableWorkbyteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: stableVault.address,
      workerAddress: deltaNeutralVaultInfo.stableDeltaWorker,
      twoSidesStrat: stableTwoSidesStrat,
      principalAmount: principalStablePosition,
      borrowAmount: borrowAmountStablePosition,
      farmingTokenAmount: farmingTokenStablePosition,
      maxReturn: BigNumber.from(0),
      minLpReceive: BigNumber.from(0),
    };

    const assetWorkbyteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: assetVault.address,
      workerAddress: deltaNeutralVaultInfo.assetDeltaWorker,
      twoSidesStrat: assetTwoSidesStrat,
      principalAmount: principalAssetPosition,
      borrowAmount: borrowAmountAssetPosition,
      farmingTokenAmount: farmingTokenAssetPosition,
      maxReturn: BigNumber.from(0),
      minLpReceive: BigNumber.from(0),
    };

    const stableWorkByte = buildDepositWorkByte(stableWorkbyteInput);
    const assetWorkByte = buildDepositWorkByte(assetWorkbyteInput);

    const data = ethers.utils.defaultAbiCoder.encode(
      ["uint8[]", "uint256[]", "bytes[]"],
      [
        [1, 1],
        [0, 0],
        [stableWorkByte, assetWorkByte],
      ]
    );

    const deltaNeutralVault = DeltaNeutralVault__factory.connect(deltaNeutralVaultInfo.address, deployer);

    console.log(">> Calling openPosition");
    const minSharesReceive = ethers.utils.parseEther("0");
    const initTx = await (
      await deltaNeutralVault.initPositions(stableAmount, assetAmount, minSharesReceive, data, {
        value: assetAmount,
        nonce: nonce++,
        gasLimit: 8000000,
      })
    ).wait(3);
    console.log(">> initTx: ", initTx.transactionHash);
    console.log("✅ Done");

    const stablePosId = await deltaNeutralVault.stableVaultPosId();
    const assetPostId = await deltaNeutralVault.assetVaultPosId();

    console.log(`>> Stable Vault Position ID: ${stablePosId}`);
    console.log(`>> Asset Vault Position ID: ${assetPostId}`);
    console.log("✅ Done");

    config = configFileHelper.setDeltaNeutralVaultsInitPositionIds(initPosition.symbol, {
      stableVaultPosId: stablePosId.toString(),
      assetVaultPosId: assetPostId.toString(),
    });
  }
};

export default func;
func.tags = ["DeltaNeutralVaultInitPositions"];
