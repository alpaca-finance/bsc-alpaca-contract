import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { BEP20__factory, DeltaNeutralVaultConfig__factory, DeltaNeutralVault04__factory } from "../../../../typechain";
import { BigNumber } from "ethers";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { parseEther } from "ethers/lib/utils";
import { compare } from "../../../../utils/address";
import { Tokens } from "../../../interfaces/config";

interface IInitPositionVault04Inputs {
  symbol: string;
  longDepositAmount: number;

  expectedLongVaultSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config
  expectedLongTokenSymbol?: string; // if leave this empty that means we believe address from DeltaNuetralVault config
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
  const initPositionInputs: IInitPositionVault04Inputs[] = [
    {
      symbol: "L8x-BUSDBNB-PCS1",
      longDepositAmount: 0.3,
      expectedLongVaultSymbol: "ibWBNB",
      expectedLongTokenSymbol: "WBNB",
    },
  ];

  const deployer = await getDeployer();

  const configFileHelper = new ConfigFileHelper();
  let config = configFileHelper.getConfig();
  let nonce = await deployer.getTransactionCount();
  const tokenLists: any = config.Tokens;

  for (const initPositionInput of initPositionInputs) {
    const deltaNeutralVaultEntity = config.DeltaNeutralVaults.find((v) => v.symbol === initPositionInput.symbol);
    if (!deltaNeutralVaultEntity)
      throw new Error(`error: unable to find delta neutral vault info for ${initPositionInput.symbol}`);

    const deltaNeutralVaultAsDeployer = DeltaNeutralVault04__factory.connect(deltaNeutralVaultEntity.address, deployer);
    const deltaNeutralVaultConfigAsDeployer = DeltaNeutralVaultConfig__factory.connect(
      deltaNeutralVaultEntity.config,
      deployer
    );

    const nativeTokenAddress = await deltaNeutralVaultConfigAsDeployer.getWrappedNativeAddr();

    console.log(`>> Validating Long Token input`);
    const longTokenAddress = _validateDeltaNeutralTokenBySymbol(
      tokenLists,
      deltaNeutralVaultEntity.stableToken,
      initPositionInput.expectedLongTokenSymbol as keyof Tokens
    );

    const longTokenAsDeployer = BEP20__factory.connect(longTokenAddress, deployer);
    const isStableTokenNative = compare(nativeTokenAddress, deltaNeutralVaultEntity.stableToken);

    const longTokenDecimal = await longTokenAsDeployer.decimals();
    if (longTokenDecimal > 18) {
      throw new Error(`error:not supported Long Token Decimal > 18, value ${longTokenDecimal}`);
    }

    const _conversionFactor = BigNumber.from(10).pow(18 - longTokenDecimal);
    const longDepositAmount = parseEther(initPositionInput.longDepositAmount.toString()).div(_conversionFactor);

    console.log(">> Check allowance");
    if (!isStableTokenNative && initPositionInput.longDepositAmount > 0) {
      const longTokenAllowance = await longTokenAsDeployer.allowance(deployer.address, deltaNeutralVaultEntity.address);
      if (longTokenAllowance.eq(0)) {
        console.log(">> Approve vault to spend stable tokens");
        await longTokenAsDeployer.approve(deltaNeutralVaultEntity.address, ethers.constants.MaxUint256, {
          nonce: nonce++,
        });
      }
    }

    const emptyEncode = ethers.utils.defaultAbiCoder.encode(["uint256"], ["0"]);

    const minSharesReceive = ethers.utils.parseEther("0");
    const initTx = await (
      await deltaNeutralVaultAsDeployer.initPositions(
        longDepositAmount,
        BigNumber.from(0),
        minSharesReceive,
        emptyEncode,
        {
          value: isStableTokenNative ? longDepositAmount : BigNumber.from(0),
          nonce: nonce++,
          gasLimit: 8000000,
        }
      )
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

export default func;
func.tags = ["DeltaNeutralVaultInitPositionsVault04"];
