import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { BEP20__factory, DeltaNeutralVault__factory, DeltaNeutralOracle__factory } from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { BigNumber } from "ethers";

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
    deltaVaultAddress: string;
    symbol: string;
    stableVaultSymbol: string;
    assetVaultSymbol: string;
    stableSymbol: string;
    assetSymbol: string;
    stableDeltaWorker: string;
    assetDeltaWorker: string;
    deltaNeutralVaultConfig: string;
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
      deltaVaultAddress: "0xEB08e2f314B8E0E5c4B265d564d1D899a39ef2a1",
      symbol: "N3-WBNB-BUSD-PCS",
      stableVaultSymbol: "ibBUSD",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "BUSD",
      assetSymbol: "WBNB",
      stableDeltaWorker: "0xb2B70dD85Cd919B59deaF09B8Dcd58553c4bb465",
      assetDeltaWorker: "0x251388f3cC98541F91B1E425010f453CBe939fcd",
      deltaNeutralVaultConfig: "0xf58e614C615bded1d22EdC9Dd8afD1fb7126c26d",
      stableAmount: "50",
      leverage: 3,
    },
  ];
  const DELTA_NEUTRAL_ORACLE_ADDR = "";
  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const tokenLists: any = config.Tokens;
  let stableTwoSidesStrat: string;
  let assetTwoSidesStrat: string;

  for (let i = 0; i < initPositionInputs.length; i++) {
    console.log("===================================================================================");
    console.log(`>> Initializing position at ${initPositionInputs[i].symbol}`);
    const stableVault = config.Vaults.find((v) => v.symbol === initPositionInputs[i].stableVaultSymbol);
    const assetVault = config.Vaults.find((v) => v.symbol === initPositionInputs[i].assetVaultSymbol);
    if (stableVault === undefined) {
      throw `error: unable to find vault from ${initPositionInputs[i].stableVaultSymbol}`;
    }
    if (assetVault === undefined) {
      throw `error: unable to find vault from ${initPositionInputs[i].assetVaultSymbol}`;
    }

    stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Pancakeswap!;
    assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Pancakeswap!;

    if (initPositionInputs[i].symbol.includes("MDEX")) {
      stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Mdex!;
      assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Mdex!;
    }

    const stableToken = tokenLists[initPositionInputs[i].stableSymbol];
    const assetToken = tokenLists[initPositionInputs[i].assetSymbol];
    const stableTokenAsDeployer = BEP20__factory.connect(stableToken, deployer);
    const assetTokenAsDeployer = BEP20__factory.connect(assetToken, deployer);

    await stableTokenAsDeployer.approve(initPositionInputs[i].deltaVaultAddress, ethers.constants.MaxUint256);
    await assetTokenAsDeployer.approve(initPositionInputs[i].deltaVaultAddress, ethers.constants.MaxUint256);

    const deltaNeutralOracle = DeltaNeutralOracle__factory.connect(DELTA_NEUTRAL_ORACLE_ADDR, deployer);
    const [stablePrice] = await deltaNeutralOracle.getTokenPrice(stableToken);
    const [assetPrice] = await deltaNeutralOracle.getTokenPrice(assetToken);

    console.log(`stablePrice: ${stablePrice}`);
    console.log(`assetPrice: ${assetPrice}`);

    // open position1
    console.log(">> Preparing input for position 1 (StableVaults)");
    const stableAmount = ethers.utils.parseEther(initPositionInputs[i].stableAmount);
    console.log(`>> Stable amount: ${stableAmount}`);
    const assetAmount = ethers.utils.parseEther("0");
    console.log(`>> assetAmount: ${assetAmount}`);

    const leverage = BigNumber.from(initPositionInputs[i].leverage);

    // (lev -2) / (2lev - 2) for long equity amount
    const numeratorLongPosition = leverage.sub(2);
    const denumeratorLongPosition = leverage.mul(2).sub(2);
    const principalStablePosition = stableAmount.mul(numeratorLongPosition).div(denumeratorLongPosition);
    console.log(`>> principalStablePosition: ${principalStablePosition}`);

    const farmingTokenStablePosition = ethers.utils.parseEther("0");
    console.log(`>> farmingTokenStablePosition: ${farmingTokenStablePosition}`);

    const borrowMultiplierPosition = leverage.sub(1);
    const borrowAmountStablePosition = principalStablePosition.mul(borrowMultiplierPosition);
    console.log(`>> borrowAmountStablePosition: ${borrowAmountStablePosition}`);

    //open position 2
    console.log(">> Preparing input for position 2 (AssetVaults)");
    const principalAssetPosition = ethers.utils.parseEther("0");
    console.log(`>> principalAssetPosition: ${principalAssetPosition}`);

    // (lev) / (2lev - 2) for short equity amount
    const numeratorShortPosition = leverage;
    const denumeratorShortPosition = leverage.mul(2).sub(2);
    const farmingTokenAssetPosition = stableAmount.mul(numeratorShortPosition).div(denumeratorShortPosition);
    console.log(`>> farmingTokenAssetPosition: ${farmingTokenAssetPosition}`);

    //(farmingTokenAssetPosition / assetPrice) * (lev-1)
    const borrowAmountAssetPosition = farmingTokenAssetPosition
      .mul(ethers.constants.WeiPerEther)
      .div(assetPrice)
      .mul(borrowMultiplierPosition);
    console.log(`>> borrowAmountAssetPosition: ${borrowAmountAssetPosition}`);

    const stableWorkbyteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: stableVault.address,
      workerAddress: initPositionInputs[i].stableDeltaWorker,
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
      workerAddress: initPositionInputs[i].assetDeltaWorker,
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

    const deltaNeutralVault = DeltaNeutralVault__factory.connect(initPositionInputs[i].deltaVaultAddress, deployer);

    console.log(">> Calling openPosition");
    const minSharesReceive = ethers.utils.parseEther("0");
    const initTx = await deltaNeutralVault.initPositions(stableAmount, assetAmount, minSharesReceive, data, {
      value: assetAmount,
    });
    console.log(">> initTx: ", initTx.hash);
    console.log("✅ Done");

    const stablePosId = await deltaNeutralVault.stableVaultPosId();
    const assetPostId = await deltaNeutralVault.assetVaultPosId();

    console.log(`>> Stable Vault Position ID: ${stablePosId}`);
    console.log(`>> Asset Vault Position ID: ${assetPostId}`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVaultInitPositions"];
