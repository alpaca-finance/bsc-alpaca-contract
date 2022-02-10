import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import {
  BEP20__factory,
  DeltaNeutralVaultConfig__factory,
  DeltaNeutralVault__factory,
  DeltaNeutralOracle__factory,
} from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { BigNumber } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

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
    assetAmount: string;
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
      symbol: "N3-WBNB-BUSD-MDEX",
      stableVaultSymbol: "ibBUSD",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "BUSD",
      assetSymbol: "WBNB",
      stableDeltaWorker: "0xb2B70dD85Cd919B59deaF09B8Dcd58553c4bb465",
      assetDeltaWorker: "0x251388f3cC98541F91B1E425010f453CBe939fcd",
      deltaNeutralVaultConfig: "0xf58e614C615bded1d22EdC9Dd8afD1fb7126c26d",
      assetAmount: "4",
    },
  ];
  const DELTA_NEUTRAL_ORACLE_ADDR = "0x6F904F6c13EA3a80dD962f0150E49d943b7d1819";
  const config = ConfigEntity.getConfig();
  // const deployer = (await ethers.getSigners())[0];
  const DEPLOYER_ADDRESS = "0xC44f82b07Ab3E691F826951a6E335E1bC1bB0B51";
  const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_FORK_URL);
  await provider.send("hardhat_impersonateAccount", [DEPLOYER_ADDRESS]);
  const signer = provider.getSigner(DEPLOYER_ADDRESS);
  const deployer = await SignerWithAddress.create(signer);
  const tokenLists: any = config.Tokens;

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

    const stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Mdex;
    const assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Mdex;

    const deltaNeutralVaultConfig = DeltaNeutralVaultConfig__factory.connect(
      initPositionInputs[i].deltaNeutralVaultConfig,
      deployer
    );

    console.log(">> Setting leverage level at DeltaNeutralVaultConfig to be 3x");
    await deltaNeutralVaultConfig.setLeverageLevel(3);
    console.log("✅ Done");

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
    const assetAmount = ethers.utils.parseEther(initPositionInputs[i].assetAmount);
    console.log(`>> assetAmount: ${assetAmount}`);
    const principalStableAmount = assetAmount.mul(assetPrice).div(stablePrice);
    console.log(`>> principalStableAmount: ${principalStableAmount}`);

    const principalStablePosition = principalStableAmount.mul(BigNumber.from("1")).div(BigNumber.from("4"));
    console.log(`>> principalStablePosition: ${principalStablePosition}`);

    const farmingTokenStablePosition = ethers.utils.parseEther("1");
    console.log(`>> farmingTokenStablePosition: ${farmingTokenStablePosition}`);

    const borrowAmountStablePosition = principalStablePosition.mul(4);
    console.log(`>> borrowAmountStablePosition: ${borrowAmountStablePosition}`);

    //open position 2
    console.log(">> Preparing input for position 2 (AssetVaults)");
    const principalAssetPosition = ethers.utils.parseEther("3");
    console.log(`>> principalAssetPosition: ${principalAssetPosition}`);
    const farmingTokenAssetPosition = principalStablePosition.mul(BigNumber.from(3));
    console.log(`>> farmingTokenAssetPosition: ${farmingTokenAssetPosition}`);

    const borrowAmountAssetPosition = principalAssetPosition.mul(4);
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

    // shareReceive  = depositValue * totalSupply / Equity
    // since totalSupply = 0, shareReceive = depositValue = (1*500 + 1*500) = 1000
    console.log(">> Calling openPosition");
    const minSharesReceive = ethers.utils.parseEther("0");
    const initTx = await deltaNeutralVault.initPositions(principalStableAmount, assetAmount, minSharesReceive, data, {
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
