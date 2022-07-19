import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getDeployer } from "../../../../utils/deployer-helper";
import { ConfigFileHelper } from "../../../helper";
import { NFTBoostedLeverageController__factory } from "../../../../typechain";
interface BoostedConfig {
  workerAddress: string;
  nftAddress: string;
  workFactor: number;
  killFactor: number;
}

interface BoostedConfigInput {
  workerName: string;
  nftAddress: string;
  workFactor: number;
  killFactor: number;
}

interface IWorker {
  workerName: string;
  workerAddress: string;
}

type IWorkers = Array<IWorker>;

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

  const Alpies = "0x57A7c5d10c3F87f5617Ac1C60DA60082E44D539e";
  const AlpiesWormhole = "0x077dc15c7ef8107e77daad8139158d9391261d40";

  const collections = [Alpies, AlpiesWormhole];
  const inputs = [
    {
      workerName: "WBNB-USDT PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-WBNB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-BUSD PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BUSD-WBNB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BTCB-BUSD PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BUSD-BTCB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "ETH-USDC PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDC-ETH PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "ETH-WBNB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-ETH PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BTCB-WBNB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-BTCB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "CAKE-WBNB PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-CAKE PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "CAKE-BUSD PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BUSD-CAKE PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "CAKE-USDT PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-CAKE PancakeswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-USDT BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-WBNB BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-BUSD BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BUSD-WBNB BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BTCB-USDT BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-BTCB BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "WBNB-USDC BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDC-WBNB BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "ETH-USDT BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-ETH BiswapWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "BTCB-USDT MdexWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-BTCB MdexWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "ETH-USDT MdexWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
    {
      workerName: "USDT-ETH MdexWorker",
      workFactor: 8000,
      killFactor: 8500,
    },
  ];

  const boostedInputs: BoostedConfigInput[] = [];
  for (const collection of collections) {
    const inputWithCollection = inputs.map((input) => {
      return { ...input, nftAddress: collection };
    });
    boostedInputs.push(...inputWithCollection);
  }

  const deployer = await getDeployer();
  const configFileHelper = new ConfigFileHelper();
  const config = configFileHelper.getConfig();

  const allWorkers: IWorkers = config.Vaults.reduce((accum, vault) => {
    return accum.concat(
      vault.workers.map((worker) => {
        return {
          workerName: worker.name,
          workerAddress: worker.address,
        };
      })
    );
  }, [] as IWorkers);

  const boostedConfigs: BoostedConfig[] = boostedInputs.map((input) => {
    const worker = allWorkers.find((worker) => {
      return worker.workerName === input.workerName;
    });

    if (!worker) throw Error(`Worker not found ${input}`);

    return {
      workerAddress: worker.workerAddress,
      nftAddress: input.nftAddress,
      workFactor: input.workFactor,
      killFactor: input.killFactor,
    };
  });

  console.log(">> Start Set Boosted for NFTBoostedLeverageController");
  if (!config.NFT?.NFTBoostedLeverageController) throw Error("NFTBoostedLeverageController address not found");

  const NFTBoostedLeverageController = NFTBoostedLeverageController__factory.connect(
    config.NFT.NFTBoostedLeverageController,
    deployer
  );

  await NFTBoostedLeverageController.setBoosted(
    boostedConfigs.map((b) => b.nftAddress),
    boostedConfigs.map((b) => b.workerAddress),
    boostedConfigs.map((b) => b.workFactor),
    boostedConfigs.map((b) => b.killFactor)
  );

  console.log("✅ Done");

  console.table(boostedConfigs);
};

export default func;
func.tags = ["NFTBoostedLeverageControllerSetBoosted"];
