import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { BEP20__factory, DirectionalVault__factory, DeltaNeutralVaultConfig__factory } from "../../../../typechain";
import { BigNumber } from "ethers";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { compare } from "../../../../utils/address";
import { Tokens } from "../../../interfaces/config";

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

    expectedLongTokenSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config

    expectedShortTokenSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config
  }

  const initPositionInputs: IInitPositionV2Inputs[] = [
    {
      symbol: "bull6x-BNBUSDT-PCS1",
      longDepositAmount: 300,
      shortDepositAmount: 0,
      expectedLongTokenSymbol: "USDT",
      expectedShortTokenSymbol: "WBNB",
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

    const directionalVaultEntity = config.DeltaNeutralVaults.find((v) => v.symbol === initPositionInput.symbol);
    if (!directionalVaultEntity)
      throw new Error(`error: unable to find delta neutral vault info for ${initPositionInput.symbol}`);

    console.log(`>> Validating Long Token input`);
    const longTokenAddress = _validatedirectionalTokenBySymbol(
      tokenLists,
      directionalVaultEntity.stableToken,
      initPositionInput.expectedLongTokenSymbol as keyof Tokens
    );

    console.log(`>> Validating Short Token input`);
    const shortTokenAddress = _validatedirectionalTokenBySymbol(
      tokenLists,
      directionalVaultEntity.assetToken,
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

    console.log("✅ Done");

    console.log("===================================================================================");
    console.log(`>> Initializing position at ${initPositionInput.symbol}`);

    const directionalVaultAddress = directionalVaultEntity.address;

    console.log(">> Check allowance");
    if (initPositionInput.longDepositAmount > 0) {
      const longTokenAllowance = await longTokenAsDeployer.allowance(deployer.address, directionalVaultAddress);
      if (longTokenAllowance.eq(0)) {
        console.log(">> Approve vault to spend stable tokens");
        await longTokenAsDeployer.approve(directionalVaultAddress, ethers.constants.MaxUint256, {
          nonce: nonce++,
        });
      }
    }

    if (initPositionInput.shortDepositAmount > 0) {
      const shortTokenAllowance = await shortTokenAsDeployer.allowance(deployer.address, directionalVaultAddress);
      if (shortTokenAllowance.eq(0)) {
        console.log(">> Approve vault to spend asset tokens");
        await shortTokenAsDeployer.approve(directionalVaultAddress, ethers.constants.MaxUint256, {
          nonce: nonce++,
        });
      }
    }
    console.log(">> Allowance ok");

    console.log(`>> Preparing input`);

    const longDepositAmount = ethers.utils.parseUnits(initPositionInput.longDepositAmount.toString(), longTokenDecimal);
    const shortDepositAmount = ethers.utils.parseUnits(
      initPositionInput.shortDepositAmount.toString(),
      shortTokenDecimal
    );

    const data = ethers.utils.defaultAbiCoder.encode(["uint256"], [25]);

    const directionalVaultAsDeployer = DirectionalVault__factory.connect(directionalVaultAddress, deployer);
    const directionalVaultConfigAsDeployer = DeltaNeutralVaultConfig__factory.connect(
      directionalVaultEntity.config,
      deployer
    );

    console.log(">> Calling openPosition");

    let nativeTokenAmount = BigNumber.from(0);
    const nativeTokenAddress = await directionalVaultConfigAsDeployer.getWrappedNativeAddr();
    if (compare(nativeTokenAddress, directionalVaultEntity.stableToken)) {
      nativeTokenAmount = longDepositAmount;
    }
    if (compare(nativeTokenAddress, directionalVaultEntity.assetToken)) {
      nativeTokenAmount = shortDepositAmount;
    }

    const minSharesReceive = ethers.utils.parseEther("0");
    const initTx = await (
      await directionalVaultAsDeployer.initPositions(longDepositAmount, shortDepositAmount, minSharesReceive, data, {
        value: nativeTokenAmount,
        nonce: nonce++,
        gasLimit: 8000000,
      })
    ).wait(3);
    console.log(">> initTx: ", initTx.transactionHash);
    console.log("✅ Done");

    const stablePosId = await directionalVaultAsDeployer.stableVaultPosId();

    console.log(`>> Stable Vault Position ID: ${stablePosId}`);
    console.log("✅ Done");

    config = configFileHelper.setDeltaNeutralVaultsInitPositionIds(initPositionInput.symbol, {
      stableVaultPosId: stablePosId.toString(),
    });
  }
};

function _validatedirectionalTokenBySymbol(
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

export default func;
func.tags = ["DirectionalVaultInitPositions"];
