import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";
import { DeltaNeutralVaultConfig__factory } from "../../../../typechain";
import { Multicall2Service } from "../../../services/multicall/multicall2";
import { BigNumber, BigNumberish } from "ethers";
import { compare } from "../../../../utils/address";
import { getDeployer } from "../../../../utils/deployer-helper";

interface SetParamsInput {
  VAULT_SYMBOL: string;
  REBALANCE_FACTOR?: BigNumberish;
  POSITION_VALUE_TOLERANCE?: BigNumberish;
  DEBT_RATIO_TOLERANCE?: BigNumberish;
  EXACT_ETA: string;
}

interface SetParamsDerivedInput {
  OWNER: string;
  VAULT_SYMBOL: string;
  VAULT_CONFIG: string;
  WRAPPED_NATIVE_ADDRESS: string;
  WNATIVE_RELAYER_ADDRESS: string;
  FAIRLAUNCH_ADDRESS: string;
  REBALANCE_FACTOR: BigNumberish;
  POSITION_VALUE_TOLERANCE: BigNumberish;
  DEBT_RATIO_TOLERANCE: BigNumberish;
  EXACT_ETA: string;
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
  const TITLTE = "update_rebalance_factor";
  const NEW_PARAMS: Array<SetParamsInput> = [
    {
      VAULT_SYMBOL: "n3x-BNBUSDT-PCS1",
      REBALANCE_FACTOR: "6669",
      EXACT_ETA: "1651984200",
    },
    {
      VAULT_SYMBOL: "n8x-BNBUSDT-PCS1",
      REBALANCE_FACTOR: "8750",
      EXACT_ETA: "1651984200",
    },
  ];

  const config = getConfig();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = await getDeployer();
  const multicallService = new Multicall2Service(config.MultiCall, deployer);
  let nonce = await deployer.getTransactionCount();
  const ts = Math.floor(Date.now() / 1000);

  /// @dev derived input
  const infos: Array<SetParamsDerivedInput> = await Promise.all(
    NEW_PARAMS.map(async (n) => {
      const automatedVault = config.DeltaNeutralVaults.find((v) => v.symbol === n.VAULT_SYMBOL);
      if (automatedVault === undefined) throw new Error(`error: unable to map ${n.VAULT_SYMBOL} to any vault`);

      const vaultConfig = DeltaNeutralVaultConfig__factory.connect(automatedVault.config, deployer);
      const [
        owner,
        wrappedNative,
        wnativeRelayer,
        fairlaunch,
        rebalanceFactor,
        positionValueTolerance,
        debtRatioTolerance,
      ] = await multicallService.multiContractCall<[string, string, string, string, BigNumber, BigNumber, BigNumber]>([
        { contract: vaultConfig, functionName: "owner" },
        { contract: vaultConfig, functionName: "getWrappedNativeAddr" },
        { contract: vaultConfig, functionName: "getWNativeRelayer" },
        { contract: vaultConfig, functionName: "fairLaunchAddr" },
        { contract: vaultConfig, functionName: "rebalanceFactor" },
        { contract: vaultConfig, functionName: "positionValueTolerance" },
        { contract: vaultConfig, functionName: "debtRatioTolerance" },
      ]);

      return {
        OWNER: owner,
        VAULT_SYMBOL: n.VAULT_SYMBOL,
        VAULT_CONFIG: automatedVault.config,
        WRAPPED_NATIVE_ADDRESS: wrappedNative,
        WNATIVE_RELAYER_ADDRESS: wnativeRelayer,
        FAIRLAUNCH_ADDRESS: fairlaunch,
        REBALANCE_FACTOR: n.REBALANCE_FACTOR || rebalanceFactor,
        POSITION_VALUE_TOLERANCE: n.POSITION_VALUE_TOLERANCE || positionValueTolerance,
        DEBT_RATIO_TOLERANCE: n.DEBT_RATIO_TOLERANCE || debtRatioTolerance,
        EXACT_ETA: n.EXACT_ETA,
      } as SetParamsDerivedInput;
    })
  );

  for (const info of infos) {
    // function setParams(
    //   address _getWrappedNativeAddr,
    //   address _getWNativeRelayer,
    //   address _fairLaunchAddr,
    //   uint256 _rebalanceFactor,
    //   uint256 _positionValueTolerance,
    //   uint256 _debtRatioTolerance
    // )
    if (compare(info.OWNER, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          `Update ${info.VAULT_SYMBOL} Vault config`,
          info.VAULT_CONFIG,
          "0",
          "setParams(address,address,address,uint256,uint256,uint256)",
          ["address", "address", "address", "uint256", "uint256", "uint256"],
          [
            info.WRAPPED_NATIVE_ADDRESS,
            info.WNATIVE_RELAYER_ADDRESS,
            info.FAIRLAUNCH_ADDRESS,
            info.REBALANCE_FACTOR,
            info.POSITION_VALUE_TOLERANCE,
            info.DEBT_RATIO_TOLERANCE,
          ],
          info.EXACT_ETA,
          { nonce: nonce++ }
        )
      );
      fileService.writeJson(`${ts}_${TITLTE}`, timelockTransactions);
    } else {
      console.log("-----------------");
      console.log(`> Apply set params for ${info.VAULT_SYMBOL}`);
      console.log(`> params:`);
      console.log(info);
      const vaultConfig = DeltaNeutralVaultConfig__factory.connect(info.VAULT_CONFIG, deployer);
      const setParamsTx = await vaultConfig.setParams(
        info.WRAPPED_NATIVE_ADDRESS,
        info.WNATIVE_RELAYER_ADDRESS,
        info.FAIRLAUNCH_ADDRESS,
        info.REBALANCE_FACTOR,
        info.POSITION_VALUE_TOLERANCE,
        info.DEBT_RATIO_TOLERANCE,
        { nonce: nonce++ }
      );
      console.log("> ⛓ Tx hash:", setParamsTx.hash);
    }
  }
};

export default func;
func.tags = ["DeltaNeutralVaultConfigSetParams"];
