import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { TimelockEntity } from "../../../entities";
import { mapWorkers } from "../../../entities/worker";
import { fileService, TimelockService } from "../../../services";
import { ethers } from "hardhat";
/**
 * @description Deployment script for upgrades workers to 02 version
 * @param  {HardhatRuntimeEnvironment} hre
 */
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
  const fileName = "mainnet-xALPACA-set-treasury-config-pcs";
  const workerInputs: Array<string> = [
    "USDT-BTCB MdexWorker",
    "ETH-BTCB MdexWorker",
    "WBNB-BTCB MdexWorker",
    "BTCB-USDT MdexWorker",
    "ETH-USDT MdexWorker",
    "WBNB-USDT MdexWorker",
    "USDC-USDT MdexWorker",
    "DAI-USDT MdexWorker",
    "USDT-ETH MdexWorker",
    "WBNB-ETH MdexWorker",
    "BTCB-ETH MdexWorker",
    "MDX-BUSD MdexWorker",
    "WBNB-BUSD MdexWorker",
    "MDX-WBNB MdexWorker",
    "BUSD-WBNB MdexWorker",
    "ETH-WBNB MdexWorker",
    "USDT-WBNB MdexWorker",
    "BTCB-WBNB MdexWorker",
    "BUSD-TUSD PancakeswapWorker",
    "ETH-BTCB PancakeswapWorker",
    "BUSD-BTCB PancakeswapWorker",
    "WBNB-BTCB PancakeswapWorker",
    "USDC-USDT PancakeswapWorker",
    "CAKE-USDT PancakeswapWorker",
    "WBNB-USDT PancakeswapWorker",
    "BUSD-USDT PancakeswapWorker",
    "BUSD-ALPACA PancakeswapWorker",
    "BTCB-ETH PancakeswapWorker",
    "WBNB-ETH PancakeswapWorker",
    "SUSHI-ETH PancakeswapWorker",
    "COMP-ETH PancakeswapWorker",
    "BMON-BUSD PancakeswapWorker",
    "POTS-BUSD PancakeswapWorker",
    "PHA-BUSD PancakeswapWorker",
    "PMON-BUSD PancakeswapWorker",
    "BTT-BUSD PancakeswapWorker",
    "TRX-BUSD PancakeswapWorker",
    "ORBS-BUSD PancakeswapWorker",
    "TUSD-BUSD PancakeswapWorker",
    "FORM-BUSD PancakeswapWorker",
    "CAKE-BUSD PancakeswapWorker",
    "ALPACA-BUSD PancakeswapWorker",
    "BTCB-BUSD PancakeswapWorker",
    "UST-BUSD PancakeswapWorker",
    "DAI-BUSD PancakeswapWorker",
    "USDC-BUSD PancakeswapWorker",
    "VAI-BUSD PancakeswapWorker",
    "WBNB-BUSD PancakeswapWorker",
    "USDT-BUSD PancakeswapWorker",
    "SPS-WBNB PancakeswapWorker",
    "BMON-WBNB PancakeswapWorker",
    "QBT-WBNB PancakeswapWorker",
    "DVI-WBNB PancakeswapWorker",
    "MBOX-WBNB PancakeswapWorker",
    "NAOS-WBNB PancakeswapWorker",
    "AXS-WBNB PancakeswapWorker",
    "ADA-WBNB PancakeswapWorker",
    "ODDZ-WBNB PancakeswapWorker",
    "USDT-WBNB PancakeswapWorker",
    "DODO-WBNB PancakeswapWorker",
    "SWINGBY-WBNB PancakeswapWorker",
    "pCWS-WBNB PancakeswapWorker",
    "BELT-WBNB PancakeswapWorker",
    "bMXX-WBNB PancakeswapWorker",
    "BUSD-WBNB PancakeswapWorker",
    "YFI-WBNB PancakeswapWorker",
    "XVS-WBNB PancakeswapWorker",
    "LINK-WBNB PancakeswapWorker",
    "UNI-WBNB PancakeswapWorker",
    "DOT-WBNB PancakeswapWorker",
    "ETH-WBNB PancakeswapWorker",
    "BTCB-WBNB PancakeswapWorker",
    "CAKE-WBNB PancakeswapWorker",
  ];
  const TREASURY_ACCOUNT = "0xe45216Ac4816A5Ec5378B1D13dE8aA9F262ce9De";
  const TREASURY_BOUNTY_BPS = "900";
  const EXACT_ETA = "1640242800";

  const targetedWorkers = mapWorkers(workerInputs);
  const deployer = (await ethers.getSigners())[0];
  const timelockTransactions: Array<TimelockEntity.Transaction> = [];
  let nonce = await deployer.getTransactionCount();

  for (const targetedWorker of targetedWorkers) {
    timelockTransactions.push(
      await TimelockService.queueTransaction(
        `set treasury config for ${targetedWorker.name}`,
        targetedWorker.address,
        "0",
        "setTreasuryConfig(address,uint256)",
        ["address", "uint256"],
        [TREASURY_ACCOUNT, TREASURY_BOUNTY_BPS],
        EXACT_ETA,
        { nonce: nonce++ }
      )
    );
  }

  fileService.writeJson(fileName, timelockTransactions);
};

export default func;
func.tags = ["TimelockAddTreasuryFieldsWorkers02"];
