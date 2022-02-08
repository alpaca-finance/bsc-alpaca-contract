import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, upgrades } from "hardhat";
import {
  BEP20__factory,
  DeltaNeutralVault,
  DeltaNeutralVaultConfig__factory,
  DeltaNeutralVault__factory,
} from "../../../../typechain";
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
      name: "DeltaNeutralVault ETH-USDT",
      symbol: "ETH-USDT",
      stableVaultSymbol: "ibUSDT",
      assetVaultSymbol: "ibETH",
      stableSymbol: "USDT",
      assetSymbol: "WBNB",
      stableDeltaWorker: "0x17f153C5576cF48Bd19dC50dDEcF30F4adCd97C9",
      assetDeltaWorker: "0x50adF479Cf1A917326392e9192037Cb9570A92a9",
      lpName: "ETH-USDT LP",
      deltaNeutralVaultConfig: "",
    },
  ];
  const PRICE_HELPER_ADDR = "";

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
      PRICE_HELPER_ADDR,
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

    const depositStableTokenAmt = ethers.utils.parseEther("500");
    const depositAssetTokenAmt = ethers.utils.parseEther("500");

    const stableToken = tokenLists[deltaVaultInputs[i].stableSymbol];
    const assetToken = tokenLists[deltaVaultInputs[i].assetSymbol];
    const stableTokenAsDeployer = BEP20__factory.connect(stableToken, deployer);
    const assetTokenAsDeployer = BEP20__factory.connect(assetToken, deployer);

    await stableTokenAsDeployer.approve(deltaNeutralVault.address, ethers.constants.MaxUint256);
    await assetTokenAsDeployer.approve(deltaNeutralVault.address, ethers.constants.MaxUint256);

    const stableWorkbyteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: stableVault.address,
      workerAddress: deltaVaultInputs[i].stableDeltaWorker,
      twoSidesStrat: stableTwoSidesStrat,
      principalAmount: ethers.utils.parseEther("125"),
      borrowAmount: ethers.utils.parseEther("500"),
      farmingTokenAmount: ethers.utils.parseEther("125"),
      maxReturn: BigNumber.from(0),
      minLpReceive: BigNumber.from(0),
    };

    const assetWorkbyteInput: IDepositWorkByte = {
      posId: 0,
      vaultAddress: assetVault.address,
      workerAddress: deltaVaultInputs[i].assetDeltaWorker,
      twoSidesStrat: assetTwoSidesStrat,
      principalAmount: ethers.utils.parseEther("375"),
      borrowAmount: ethers.utils.parseEther("1500"),
      farmingTokenAmount: ethers.utils.parseEther("375"),
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
    const initTx = await deltaNeutralVault.initPositions(
      depositStableTokenAmt,
      depositAssetTokenAmt,
      minSharesReceive,
      data,
      {
        value: depositAssetTokenAmt,
      }
    );

    const stablePosId = await deltaNeutralVault.stableVaultPosId();
    const assetPostId = await deltaNeutralVault.assetVaultPosId();

    console.log(`>> Stable Vault Position ID: ${stablePosId}`);
    console.log(`>> Asset Vault Position ID: ${assetPostId}`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["DeltaNeutralVault"];
