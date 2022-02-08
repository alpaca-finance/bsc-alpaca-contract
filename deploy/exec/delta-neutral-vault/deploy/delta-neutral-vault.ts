import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  BEP20__factory,
  DeltaNeutralVault,
  DeltaNeutralVaultConfig__factory,
  DeltaNeutralVault__factory,
  DeltaNeutralOracle__factory,
} from "../../../../typechain";
import { ConfigEntity } from "../../../entities";
import { BigNumber } from "ethers";
import { formatEther } from "ethers/lib/utils";

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
  interface IDeltaNeutralVaultInput {
    name: string;
    symbol: string;
    stableVaultSymbol: string;
    assetVaultSymbol: string;
    stableSymbol: string;
    assetSymbol: string;
    stableDeltaWorker: string;
    assetDeltaWorker: string;
    lpName: string;
    deltaNeutralVaultConfig: string;
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

  const deltaVaultInputs: IDeltaNeutralVaultInput[] = [
    {
      name: "DeltaNeutralVault WBNB-BUSD",
      symbol: "WBNB-BUSD",
      stableVaultSymbol: "ibBUSD",
      assetVaultSymbol: "ibWBNB",
      stableSymbol: "BUSD",
      assetSymbol: "WBNB",
      stableDeltaWorker: "0x7eA2725CA438D9FE62f304EEA9183E1cF6402D5A",
      assetDeltaWorker: "0x060d52772feFeD66d194496BAE7EEe3288F41Aa4",
      lpName: "WBNB-BUSD LP",
      deltaNeutralVaultConfig: "0xfd241a4a391Bc05e75775F69f4F0635C1AE80493",
    },
  ];
  const DELTA_NEUTRAL_ORACLE_ADDR = "0x8fb045216C5486A010b0b9B561904005de0b8DA4";

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  const alpacaTokenAddress = config.Tokens.ALPACA;
  const tokenLists: any = config.Tokens;
  for (let i = 0; i < deltaVaultInputs.length; i++) {
    const stableVault = config.Vaults.find((v) => v.symbol === deltaVaultInputs[i].stableVaultSymbol);
    const assetVault = config.Vaults.find((v) => v.symbol === deltaVaultInputs[i].assetVaultSymbol);
    const lpPair = config.Exchanges.Mdex.LpTokens.find((lp) => lp.name === deltaVaultInputs[i].lpName);
    if (stableVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInputs[i].stableVaultSymbol}`;
    }
    if (assetVault === undefined) {
      throw `error: unable to find vault from ${deltaVaultInputs[i].assetVaultSymbol}`;
    }
    if (lpPair === undefined) {
      throw `error: unable to find LP token from ${deltaVaultInputs[i].lpName}`;
    }

    const stableTwoSidesStrat = stableVault.StrategyAddTwoSidesOptimal.Mdex;
    const assetTwoSidesStrat = assetVault.StrategyAddTwoSidesOptimal.Mdex;
    const DeltaNeutralVault = (await ethers.getContractFactory(
      "DeltaNeutralVault",
      deployer
    )) as DeltaNeutralVault__factory;

    console.log("===================================================================================");
    console.log(`>> Deploying a DeltaNeutralVault ${deltaVaultInputs[i].name}`);
    const deltaNeutralVault = (await upgrades.deployProxy(DeltaNeutralVault, [
      deltaVaultInputs[i].name,
      deltaVaultInputs[i].symbol,
      stableVault.address,
      assetVault.address,
      deltaVaultInputs[i].stableDeltaWorker,
      deltaVaultInputs[i].assetDeltaWorker,
      lpPair.address,
      alpacaTokenAddress,
      DELTA_NEUTRAL_ORACLE_ADDR,
      deltaVaultInputs[i].deltaNeutralVaultConfig,
    ])) as DeltaNeutralVault;
    await deltaNeutralVault.deployed();
    console.log(`>> Deployed at ${deltaNeutralVault.address}`);
    console.log("✅ Done");

    console.log(">> Initializing position");
    const deltaNeutralVaultConfig = DeltaNeutralVaultConfig__factory.connect(
      deltaVaultInputs[i].deltaNeutralVaultConfig,
      deployer
    );
    await deltaNeutralVaultConfig.setLeverageLevel(3);

    const stableToken = tokenLists[deltaVaultInputs[i].stableSymbol];
    const assetToken = tokenLists[deltaVaultInputs[i].assetSymbol];
    const stableTokenAsDeployer = BEP20__factory.connect(stableToken, deployer);
    const assetTokenAsDeployer = BEP20__factory.connect(assetToken, deployer);

    await stableTokenAsDeployer.approve(deltaNeutralVault.address, ethers.constants.MaxUint256);
    await assetTokenAsDeployer.approve(deltaNeutralVault.address, ethers.constants.MaxUint256);

    const deltaNeutralOracle = DeltaNeutralOracle__factory.connect(DELTA_NEUTRAL_ORACLE_ADDR, deployer);
    const [stablePrice] = await deltaNeutralOracle.getTokenPrice(stableToken);
    const [assetPrice] = await deltaNeutralOracle.getTokenPrice(assetToken);

    console.log(`stablePrice: ${stablePrice}`);
    console.log(`assetPrice: ${assetPrice}`);

    // open position1

    const assetAmount = ethers.utils.parseEther("4");
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
    const principalAssetPosition = ethers.utils.parseEther("3");
    console.log(`>> principalAssetPosition: ${principalAssetPosition}`);
    const farmingTokenAssetPosition = principalStablePosition.mul(BigNumber.from(3));
    console.log(`>> farmingTokenAssetPosition: ${farmingTokenAssetPosition}`);

    const borrowAmountAssetPosition = principalAssetPosition.mul(4);
    console.log(`>> borrowAmountAssetPosition: ${borrowAmountAssetPosition}`);

    const stableWorkbyteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: stableVault.address,
      workerAddress: deltaVaultInputs[i].stableDeltaWorker,
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
      workerAddress: deltaVaultInputs[i].assetDeltaWorker,
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
    // shareReceive  = depositValue * totalSupply / Equity
    // since totalSupply = 0, shareReceive = depositValue = (1*500 + 1*500) = 1000
    const minSharesReceive = ethers.utils.parseEther("1000");
    const initTx = await deltaNeutralVault.initPositions(principalStableAmount, assetAmount, minSharesReceive, data, {
      value: assetAmount,
    });

    const stablePosId = await deltaNeutralVault.stableVaultPosId();
    const assetPostId = await deltaNeutralVault.assetVaultPosId();

    console.log(`>> Stable Vault Position ID: ${stablePosId}`);
    console.log(`>> Asset Vault Position ID: ${assetPostId}`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
