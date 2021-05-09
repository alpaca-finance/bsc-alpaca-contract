import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import { Timelock__factory, PancakeswapV2Worker, PancakeswapV2Worker__factory, PancakeswapV2WorkerMigrate, PancakeswapV2WorkerMigrate__factory } from '../typechain'

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
  // PROXY_ADMIN
  // Testnet: 0x2c6c09b46d00A88161B7e4AcFaFEc58990548aC2
  // Mainnet: 0x5379F32C8D5F663EACb61eeF63F722950294f452
  const PROXY_ADMIN = '0x5379F32C8D5F663EACb61eeF63F722950294f452';
  const NEW_IMPL = '0xcac73A0f24968e201c2cc326edbC92A87666b430';
  const TO_BE_UPGRADE_WORKERS = [
    // BNB (12)
    "0x7Af938f0EFDD98Dc513109F6A7E85106D26E16c4",
    "0x0aD12Bc160B523E7aBfBe3ABaDceE8F1b6116089",
    "0x831332f94C4A0092040b28ECe9377AfEfF34B25a",
    "0x05bDF33f03017eaFdEEccD68406E1281a1deF62d",
    "0xA1644132Ca692ba0657637A31CE0F6B99f052C5E",
    "0xDcd9f075B1Ff638e757226626a3b3606D7795f80",
    "0xBB77F1625c4C3374ea0BAF42FAC74F7b7Ae9E4c6",
    "0x2E7f32e38EA5a5fcb4494d9B626d2d393B176B1E",
    "0x4193D35D0cB598d92703ED69701f5d568aCa015c",
    "0xa726E9E5c007253fe7589879136FDf24dA6DA393",
    "0x9B13982d094b4fCca4aFF741A96834ff66E4d8bd",
    "0x730bce145a55A07C2D7363db7110466c5c26E472",
    // BUSD (7)
    "0xC5954CA8988988362f60498d5aDEc67BA466492B",
    "0x51782E39A0aF33f542443419c223434Bb4A5a695",
    "0x693430Fe5F1b0a61b232132d0567295c288eA482",
    "0xB82B93FcF1818513889c0E1F3628484Ce5017A14",
    "0xe632ac75f2d0A97F7b1ef3a8a16d653C4c82b1fb",
    "0xeBdECF3a21D95453A89440A4E32B9559E47073E7",
    "0x2C4a246e532542DFaE3d575003C7f5c6583BFD8c",
    // ETH (2)
    "0xd6260DB3A84C7BfdAFcD82325397B8E70B39627f",
    "0xaA5c95181c02DfB8173813149e52c8C9E4E14124",
    // ALPACA (1)
    "0xeF1C5D2c20b22Ae50437a2F3bd258Ab1117D1BaD"
  ];

  const TIMELOCK = '0x2D5408f2287BF9F9B05404794459a846651D0a59';
  const EXACT_ETA = '1620575100';









  const timelock = Timelock__factory.connect(TIMELOCK, (await ethers.getSigners())[0]);

  let newImpl = NEW_IMPL;
  console.log(`>> Upgrading Worker at ${TO_BE_UPGRADE_WORKERS} through Timelock + ProxyAdmin`);
  if (newImpl === '') {
    console.log('>> NEW_IMPL is not set. Prepare upgrade a new IMPL automatically.');
    const NewPancakeswapWorker = (await ethers.getContractFactory('PancakeswapV2Worker')) as PancakeswapV2Worker__factory;
    const preparedNewWorker = await upgrades.prepareUpgrade(TO_BE_UPGRADE_WORKERS[0], NewPancakeswapWorker)
    newImpl = preparedNewWorker;
    console.log(`>> New implementation deployed at: ${preparedNewWorker}`);
    console.log("✅ Done");
  }

  for(let i = 0; i < TO_BE_UPGRADE_WORKERS.length; i++) {
    console.log(`>> Queue tx on Timelock to upgrade the implementation`);
    await timelock.queueTransaction(PROXY_ADMIN, '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], [TO_BE_UPGRADE_WORKERS[i], newImpl]), EXACT_ETA, { gasPrice: 100000000000 });
    console.log("✅ Done");

    console.log(`>> Generate executeTransaction:`);
    console.log(`await timelock.executeTransaction('${PROXY_ADMIN}', '0', 'upgrade(address,address)', ethers.utils.defaultAbiCoder.encode(['address','address'], ['${TO_BE_UPGRADE_WORKERS[i]}','${newImpl}']), ${EXACT_ETA})`);
    console.log("✅ Done");
  }
};

export default func;
func.tags = ['UpgradeWorkers'];