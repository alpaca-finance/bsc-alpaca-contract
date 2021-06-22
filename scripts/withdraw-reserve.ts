import { ethers, network } from "hardhat";
import "@openzeppelin/test-helpers";
import { PancakePair__factory, SimplePriceOracle__factory, Timelock__factory, Vault__factory, WorkerConfig__factory } from "../typechain";
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

interface IReserve {
  vault: string
  fullAmount: string
  buybackAmount: string
}

async function main() {
  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  const deployer = (await ethers.getSigners())[0]
  
  /// @dev initialized all variables
  const targetVault = ['ibWBNB', 'ibBUSD', 'ibETH', 'ibALPACA', 'ibUSDT', 'ibBTCB']
  const reserves: Array<IReserve> = []
  const eta = Math.floor(Date.now()/1000) + 86400 + 1800

  /// @dev connect to Timelock
  const timelock = Timelock__factory.connect(config.Timelock, deployer)

  /// @dev find vault and queue withdraw reserve
  for(let i = 0; i < config.Vaults.length; i++) {
    if(targetVault.indexOf(config.Vaults[i].symbol) > -1) {
      console.log(`========== queue tx for withdrawing reserve pool from ${config.Vaults[i].symbol} ==========`)
      const vault = Vault__factory.connect(config.Vaults[i].address, (await ethers.getSigners())[0])
      const reserveAmt = await vault.reservePool()

      const queueTx = await timelock.queueTransaction(
        vault.address,
        '0',
        'withdrawReserve(address,uint256)',
        ethers.utils.defaultAbiCoder.encode(['address','uint256'], [deployer.address, reserveAmt]),
        eta)
      
      console.log(`> queued tx to withdraw reserve hash: ${queueTx.hash}`)

      console.log('> generate execute command')
      console.log(`await timelock.executeTransaction('${vault.address}', '0', 'withdrawReserve(address,uint256)', ethers.utils.defaultAbiCoder.encode(['address','uint256'],['${deployer.address}', '${reserveAmt}']), ${eta})`)
      console.log('> ✅ done')

      reserves.push({
        vault: config.Vaults[i].symbol.replace("ib", ""),
        fullAmount: ethers.utils.formatEther(reserveAmt),
        buybackAmount: ethers.utils.formatEther(reserveAmt.div(2))
      })
    }
  }

  /// @dev display reserve to be withdrawn
  console.log("========== reserve withdraw summary ==========")
  console.table(reserves)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })