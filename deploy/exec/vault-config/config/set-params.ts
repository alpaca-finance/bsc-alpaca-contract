import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { ConfigEntity, TimelockEntity } from "../../../entities";
import { fileService, TimelockService } from "../../../services";
import { getConfig } from "../../../entities/config";
import { ConfigurableInterestVaultConfig__factory } from "../../../../typechain";
import { Multicall2Service } from "../../../services/multicall/multicall2";
import { BigNumber, BigNumberish } from "ethers";
import { compare } from "../../../../utils/address";
import { ConfigFileHelper } from "../../../helper";

interface SetParamsInput {
  VAULT_SYMBOL: string;
  MIN_DEBT_SIZE_WEI?: BigNumberish;
  RESERVE_POOL_BPS?: BigNumberish;
  KILL_PRIZE_BPS?: BigNumberish;
  INTEREST_MODEL?: string;
  TREASURY_KILL_BPS?: BigNumberish;
  TREASURY_ADDR?: string;
  EXACT_ETA: string;
}

interface SetParamsDerivedInput {
  OWNER: string;
  VAULT_SYMBOL: string;
  MIN_DEBT_SIZE_WEI: BigNumberish;
  RESERVE_POOL_BPS: BigNumberish;
  KILL_PRIZE_BPS: BigNumberish;
  INTEREST_MODEL: string;
  TREASURY_KILL_BPS: BigNumberish;
  TREASURY_ADDR: string;
  WRAPPED_NATIVE: string;
  WNATIVE_RELAYER: string;
  FAIRLAUNCH: string;
  VAULT_CONFIG: string;
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
  const TITLTE = "update_triple_slope";
  const NEW_PARAMS: Array<SetParamsInput> = [
    {
      VAULT_SYMBOL: "ibALPACA",
      INTEREST_MODEL: "0xa79Ec28a02Ecb05Fb15fEc5Ec83672a93c4f8313",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibWBNB",
      INTEREST_MODEL: "0x25e1A59d7Cb79A691983a546556E434A1AE5BDCe",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibBUSD",
      INTEREST_MODEL: "0xAB7B245f9265F0310998740F6585Ca8eD84896a9",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibUSDT",
      INTEREST_MODEL: "0x0267231E83F0d0518bE27CC0E0FE398E9e5468cC",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibUSDC",
      INTEREST_MODEL: "0xa79Ec28a02Ecb05Fb15fEc5Ec83672a93c4f8313",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibTUSD",
      INTEREST_MODEL: "0xa79Ec28a02Ecb05Fb15fEc5Ec83672a93c4f8313",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibBTCB",
      INTEREST_MODEL: "0xa79Ec28a02Ecb05Fb15fEc5Ec83672a93c4f8313",
      EXACT_ETA: "1678343400",
    },
    {
      VAULT_SYMBOL: "ibETH",
      INTEREST_MODEL: "0x049eE7f41417fCc0f7Dd089f8dE7079030A51f3E",
      EXACT_ETA: "1678343400",
    },
  ];

  let config = ConfigEntity.getConfig();
  const configFileHelper = new ConfigFileHelper();
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  const deployer = (await ethers.getSigners())[0];
  const chainId = await deployer.getChainId();
  const multicallService = new Multicall2Service(config.MultiCall, deployer);
  let nonce = await deployer.getTransactionCount();
  const ts = Math.floor(Date.now() / 1000);

  /// @dev derived input
  const infos: Array<SetParamsDerivedInput> = await Promise.all(
    NEW_PARAMS.map(async (n) => {
      const vault = config.Vaults.find((v) => v.symbol === n.VAULT_SYMBOL);
      if (vault === undefined) throw new Error(`error: unable to map ${n.VAULT_SYMBOL} to any vault`);

      const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(vault.config, deployer);
      const [
        owner,
        minDebtSize,
        reservePoolBps,
        killBps,
        interestModel,
        treasury,
        treasuryKillBps,
        wrappedNative,
        wnativeRelayer,
        fairlaunch,
      ] = await multicallService.multiContractCall<
        [string, BigNumber, BigNumber, BigNumber, string, string, BigNumber, string, string, string]
      >([
        { contract: vaultConfig, functionName: "owner" },
        { contract: vaultConfig, functionName: "minDebtSize" },
        { contract: vaultConfig, functionName: "getReservePoolBps" },
        { contract: vaultConfig, functionName: "getKillBps" },
        { contract: vaultConfig, functionName: "interestModel" },
        { contract: vaultConfig, functionName: "treasury" },
        { contract: vaultConfig, functionName: "getKillTreasuryBps" },
        { contract: vaultConfig, functionName: "getWrappedNativeAddr" },
        { contract: vaultConfig, functionName: "getWNativeRelayer" },
        { contract: vaultConfig, functionName: "getFairLaunchAddr" },
      ]);

      return {
        OWNER: owner,
        VAULT_SYMBOL: n.VAULT_SYMBOL,
        VAULT_CONFIG: vault.config,
        MIN_DEBT_SIZE_WEI: n.MIN_DEBT_SIZE_WEI || minDebtSize,
        RESERVE_POOL_BPS: n.RESERVE_POOL_BPS || reservePoolBps,
        KILL_PRIZE_BPS: n.KILL_PRIZE_BPS || killBps,
        INTEREST_MODEL: n.INTEREST_MODEL || interestModel,
        TREASURY_ADDR: n.TREASURY_ADDR || treasury,
        TREASURY_KILL_BPS: n.TREASURY_KILL_BPS || treasuryKillBps,
        WRAPPED_NATIVE: wrappedNative,
        WNATIVE_RELAYER: wnativeRelayer,
        FAIRLAUNCH: fairlaunch,
        EXACT_ETA: n.EXACT_ETA,
      } as SetParamsDerivedInput;
    })
  );

  for (const info of infos) {
    // function setParams(
    // uint256 _minDebtSize,
    // uint256 _reservePoolBps,
    // uint256 _killBps,
    // InterestModel _interestModel,
    // address _getWrappedNativeAddr,
    // address _getWNativeRelayer,
    // address _getFairLaunchAddr,
    // uint256 _getKillTreasuryBps,
    // address _treasury
    // )
    if (compare(info.OWNER, config.Timelock)) {
      timelockTransactions.push(
        await TimelockService.queueTransaction(
          chainId,
          `Update ${info.VAULT_SYMBOL} Vault config`,
          info.VAULT_CONFIG,
          "0",
          "setParams(uint256,uint256,uint256,address,address,address,address,uint256,address)",
          ["uint256", "uint256", "uint256", "address", "address", "address", "address", "uint256", "address"],
          [
            info.MIN_DEBT_SIZE_WEI,
            info.RESERVE_POOL_BPS,
            info.KILL_PRIZE_BPS,
            info.INTEREST_MODEL,
            info.WRAPPED_NATIVE,
            info.WNATIVE_RELAYER,
            info.FAIRLAUNCH,
            info.TREASURY_KILL_BPS,
            info.TREASURY_ADDR,
          ],
          info.EXACT_ETA,
          { nonce: nonce++ }
        )
      );
      fileService.writeJson(`${ts}_${TITLTE}`, timelockTransactions);
    } else {
      console.log(`> Update ${info.VAULT_SYMBOL} Vault config`);
      const vaultConfig = ConfigurableInterestVaultConfig__factory.connect(info.VAULT_CONFIG, deployer);
      await vaultConfig.setParams(
        info.MIN_DEBT_SIZE_WEI,
        info.RESERVE_POOL_BPS,
        info.KILL_PRIZE_BPS,
        info.INTEREST_MODEL,
        info.WRAPPED_NATIVE,
        info.WNATIVE_RELAYER,
        info.FAIRLAUNCH,
        info.TREASURY_KILL_BPS,
        info.TREASURY_ADDR,
        { nonce: nonce++ }
      );
      console.log(`✅ Done`);
    }

    // If update interest model then update json as well.
    if (info.INTEREST_MODEL) {
      config = configFileHelper.setVaultInterestModel(info.VAULT_SYMBOL, info.INTEREST_MODEL);
    }
  }
};

export default func;
func.tags = ["TimelockSetParamsVaultConfig"];
