import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";

type ParamData = string | number | string[];

interface DeployResponse<C> {
  contract: C;
  deployedBlock: number;
}

abstract class IContractDeployer<C> {
  protected deployer: SignerWithAddress;
  protected contract: string;
  protected key?: string;

  // for specific contract
  constructor(_deployer: SignerWithAddress, _contract: string, _key?: string) {
    this.deployer = _deployer;
    this.contract = _contract;
    this.key = _key;
  }

  // retrun deployed address
  public abstract deploy(args: ParamData[]): Promise<DeployResponse<C>>;
}

export class UpgradeableContractDeployer<C extends Contract> extends IContractDeployer<C> {
  constructor(_deployer: SignerWithAddress, _contract: string, _key?: string) {
    super(_deployer, _contract, _key);
  }

  public async deploy(args: ParamData[]): Promise<DeployResponse<C>> {
    console.log("================================================================================");
    if (!!this.key) {
      console.log(`>> Deploying an upgradable ${this.contract} contract for ${this.key}`);
    } else {
      console.log(`>> Deploying an upgradable ${this.contract}`);
    }

    const ContractFactory = await ethers.getContractFactory(this.contract, this.deployer);
    const deployedContract = (await upgrades.deployProxy(ContractFactory, args)) as C;
    const deployedTx = await deployedContract.deployTransaction.wait(3);
    console.log(`>> Deployed at ${deployedContract.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log("✅ Done");

    return {
      contract: deployedContract,
      deployedBlock: deployedTx.blockNumber,
    };
  }
}

export class ContractDeployer<C extends Contract> extends IContractDeployer<C> {
  constructor(_deployer: SignerWithAddress, _contract: string, _key?: string) {
    super(_deployer, _contract, _key);
  }

  public async deploy(args: ParamData[]): Promise<DeployResponse<C>> {
    console.log("================================================================================");
    if (!!this.key) {
      console.log(`>> Deploying an upgradable ${this.contract} contract for ${this.key}`);
    } else {
      console.log(`>> Deploying an upgradable ${this.contract}`);
    }

    const ContractFactory = await ethers.getContractFactory(this.contract, this.deployer);
    const deployedContract = (await ContractFactory.deploy(...args)) as C;
    const deployedTx = await deployedContract.deployTransaction.wait(3);
    console.log(`>> Deployed at ${deployedContract.address}`);
    console.log(`>> Deployed block: ${deployedTx.blockNumber}`);
    console.log("✅ Done");

    return {
      contract: deployedContract,
      deployedBlock: deployedTx.blockNumber,
    };
  }
}
