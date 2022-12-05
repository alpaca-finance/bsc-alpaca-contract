import { ERC20__factory } from "./../../../../typechain/factories/ERC20__factory";
import { parseEther } from "ethers/lib/utils";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { MerkleDistributor__factory } from "../../../../typechain";
import { compare } from "../../../../utils/address";
import { getDeployer, isFork } from "../../../../utils/deployer-helper";
import { getConfig } from "../../../entities/config";

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
  const config = getConfig();
  const deployer = await getDeployer();

  const FEATURE_TOKEN_ADDRESS = config.Tokens.pSTAKE!;
  const DEPOSIT_AMOUNT = parseEther("590748");
  const merkleDistributor = MerkleDistributor__factory.connect(config.MerkleDistributor!["pSTAKE-batch-2"], deployer);

  console.log(">> Depositing token to Merkle distributor contract");

  const merkleToken = await merkleDistributor.token();

  // validating token
  if (!compare(merkleToken, FEATURE_TOKEN_ADDRESS)) {
    throw new Error("MerkleDistributorDeposit wrong config token");
  }

  const ops = isFork() ? { gasLimit: 2000000 } : {};

  const token = ERC20__factory.connect(FEATURE_TOKEN_ADDRESS, deployer);
  const approveTx = await token.approve(merkleDistributor.address, DEPOSIT_AMOUNT, ops);
  await approveTx.wait(3);

  const depositTx = await merkleDistributor.deposit(DEPOSIT_AMOUNT, ops);
  const depositReceipt = await depositTx.wait(3);
  console.log(`>> Done at ${depositReceipt.transactionHash}`);
};

export default func;
func.tags = ["MerkleDistributorDeposit"];
