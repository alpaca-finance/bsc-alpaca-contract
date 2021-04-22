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

  const MIGRATIONS: IMigrateLPParamsList = [{
    WORKER_NAME: "COMP-ETH Worker",
    WORKER_ADDR: "0xd6260DB3A84C7BfdAFcD82325397B8E70B39627f",
    ROUTER_V2: "0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56",
    NEW_POOL_ID: "189",
    TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR: "0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900",
    ADD_STRAT: "0x10e691BDd2665D0180fbC69535862874A3594236",
    LIQ_STRAT: "0xD12B1581CBcA1B82A441f7D210112a800e83353A",
    OK_STRATS: [
      "0x3be23527fF4d7881c6F5ed870Cbf89f5C24C56Eb",
      "0xC40158e78793C759Cbc1436eE1eDCE15A8F1107A",
    ],
    DISABLE_STRATS: [
      "0x1DBa79e73a7Ea9749fc28B921bc9431D09BEf2B5",
      "0xc7c025aA69F4b525E3F9f5186b524492ee1C86bB",
      "0xEb6e0B9839b297322a6FaEc0cEBC6d3e207b7480",
      "0x5e2911d70d7a659Da0dA26989F445aeCAC58f2E6"
    ],
  }, {
    WORKER_NAME: "SUSHI-ETH Worker",
    WORKER_ADDR: "0xaA5c95181c02DfB8173813149e52c8C9E4E14124",
    ROUTER_V2: "0x2AD2C5314028897AEcfCF37FD923c079BeEb2C56",
    NEW_POOL_ID: "195",
    TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR: "0x7F8BE608D72d5Eb51E231B1F9a3e25823fDe0900",
    ADD_STRAT: "0x10e691BDd2665D0180fbC69535862874A3594236",
    LIQ_STRAT: "0xD12B1581CBcA1B82A441f7D210112a800e83353A",
    OK_STRATS: [
      "0x3be23527fF4d7881c6F5ed870Cbf89f5C24C56Eb",
      "0xC40158e78793C759Cbc1436eE1eDCE15A8F1107A",
    ],
    DISABLE_STRATS: [
      "0x1DBa79e73a7Ea9749fc28B921bc9431D09BEf2B5",
      "0xc7c025aA69F4b525E3F9f5186b524492ee1C86bB",
      "0xEb6e0B9839b297322a6FaEc0cEBC6d3e207b7480",
      "0x5e2911d70d7a659Da0dA26989F445aeCAC58f2E6"
    ],
  }];
  
  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1619190000';











  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  for(let i = 0; i < MIGRATIONS.length; i++) {
    const migration = MIGRATIONS[i]
    console.log(`>> Timelock: Setting migrationLP of a worker: "${migration.WORKER_NAME}" via Timelock`);
    await timelock.queueTransaction(
        migration.WORKER_ADDR, '0',
        'migrateLP(address,uint256,address,address,address,address[],address[])',
        ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address', 'address', 'address', 'address[]', 'address[]'],
            [
                migration.ROUTER_V2,
                migration.NEW_POOL_ID,
                migration.TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR,
                migration.ADD_STRAT,
                migration.LIQ_STRAT,
                migration.OK_STRATS,
                migration.DISABLE_STRATS,
            ]
        ), EXACT_ETA
    );
    console.log("generate timelock.executeTransaction:")
    migration.OK_STRATS = migration.OK_STRATS.map((okStrat) => `'${okStrat}'`)
    migration.DISABLE_STRATS = migration.DISABLE_STRATS.map((disableStrat) => `'${disableStrat}'`)
    console.log(`await timelock.executeTransaction('${migration.WORKER_ADDR}', '0', 'migrateLP(address,uint256,address,address,address,address[],address[])', ethers.utils.defaultAbiCoder.encode(['address', 'uint256', 'address', 'address', 'address', 'address[]', 'address[]'],['${migration.ROUTER_V2}','${migration.NEW_POOL_ID}','${migration.TWOSIDE_OPTIMAL_MIGRATION_STRAT_ADDR}','${migration.ADD_STRAT}','${migration.LIQ_STRAT}',[${migration.OK_STRATS}],[${migration.DISABLE_STRATS}]]), ${EXACT_ETA})`)
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['TimelockWorkersMigrateLP'];