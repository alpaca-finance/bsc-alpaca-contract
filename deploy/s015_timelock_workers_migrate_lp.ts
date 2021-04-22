import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { Timelock__factory } from '../typechain'

interface IMigrateLPParams {
    WORKER_NAME: string
    WORKER_ADDR: string
    ROUTER_V2:  string
    NEW_POOL_ID: string
    TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR: string
    ADD_STRAT: string
    LIQ_STRAT: string
    OK_STRATS: Array<string> // some other strats except add and liq strat
    DISABLE_STRATS: Array<string>
    MIN_LP_V2: string
}

type IMigrateLPParamsList = Array<IMigrateLPParams>

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
  const MIGRATIONS: IMigrateLPParamsList = [];

  const TIMELOCK = '0xb3c3aE82358DF7fC0bd98629D5ed91767e45c337';
  const EXACT_ETA = '1616681460';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < MIGRATIONS.length; i++) {
    const migration = MIGRATIONS[i]
    console.log(`>> Timelock: Setting migrationLP of a worker: "${migration.WORKER_NAME}" via Timelock`);
    await timelock.queueTransaction(
        migration.WORKER_ADDR, '0',
        'migrateLP(address,uint256,address,address,address,address[],address[],uint256)',
        ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'address', 'address', 'address[]', 'address[]', 'uint256'],
            [
                migration.ROUTER_V2,
                migration.NEW_POOL_ID,
                migration.TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR,
                migration.ADD_STRAT,
                migration.LIQ_STRAT,
                migration.OK_STRATS,
                migration.DISABLE_STRATS,
                migration.MIN_LP_V2
            ]
        ), EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    console.log(`await timelock.executeTransaction('${migration.WORKER_ADDR}', '0', 'migrateLP(address,uint256,address,address,address,address[],address[],uint256)', ethers.utils.defaultAbiCoder.encode(['address', 'uint256', 'address', 'address', 'address', 'address[]', 'address[]', 'uint256'],[${migration.ROUTER_V2},${migration.NEW_POOL_ID},${migration.TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR},${migration.ADD_STRAT},${migration.LIQ_STRAT},${migration.OK_STRATS},${migration.DISABLE_STRATS},${migration.MIN_LP_V2}]), ${EXACT_ETA}`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockWorkersMigrateLP'];