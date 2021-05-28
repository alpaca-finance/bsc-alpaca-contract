import { ethers, upgrades, waffle, network } from "hardhat";
import { Overrides, Signer, BigNumberish, utils, Wallet } from "ethers";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import "@openzeppelin/test-helpers";
import {
  PancakeswapV2Worker__factory, Vault__factory,
} from "../typechain";
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

async function main() {
  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  
  for(let i = 0; i < config.Vaults.length; i++) {
    const vault = Vault__factory.connect(config.Vaults[i].address, ethers.provider)

    for(let j = 0; j < config.Vaults[i].workers.length; j++) {
      console.log(`> validating ${config.Vaults[i].workers[j].name}`)
      if (config.Vaults[i].workers[j].name.indexOf("PancakeswapWorker")) {
        const worker = PancakeswapV2Worker__factory.connect(config.Vaults[i].workers[j].address, ethers.provider)
        expect(config.Vaults[i].address).to.be.eq(await worker.operator())
        expect(config.Vaults[i].workers[j].lp).to.be.eq(await worker.lpToken())
        expect(config.Vaults[i].workers[j].pId).to.be.eq(await worker.pid())
        expect(config.Vaults[i].workers[j].stakingLpAt).to.be.eq(await worker.masterChef())
        // @notice handle BETH-ETH as it is the old version of PancakeswapWorker
        expect(await worker.baseToken()).to.be.eq(await vault.token())
        if (config.Vaults[i].workers[j].name !== "BETH-ETH PancakeswapWorker") {
          expect(await worker.fee()).to.be.eq('9975')
          expect(await worker.feeDenom()).to.be.eq('10000')
        }
        expect(await worker.okStrats(config.Vaults[i].workers[j].strategies.StrategyAddAllBaseToken)).to.be.true
        expect(await worker.okStrats(config.Vaults[i].workers[j].strategies.StrategyLiquidate)).to.be.true
        expect(await worker.okStrats(config.Vaults[i].workers[j].strategies.StrategyAddTwoSidesOptimal)).to.be.true
        expect(await worker.okStrats(config.Vaults[i].workers[j].strategies.StrategyWithdrawMinimizeTrading)).to.be.true
      }
      console.log("> ✅ done, no problem found")
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })