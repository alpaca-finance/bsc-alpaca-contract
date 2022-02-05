import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import "solidity-coverage";

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337,
      gas: 12000000,
      blockGasLimit: 0x1fffffffffffff,
      allowUnlimitedContractSize: true,
      timeout: 1800000,
      accounts: [
        {
          privateKey: process.env.LOCAL_PRIVATE_KEY_1,
          balance: "10000000000000000000000",
        },
        {
          privateKey: process.env.LOCAL_PRIVATE_KEY_2,
          balance: "10000000000000000000000",
        },
        {
          privateKey: process.env.LOCAL_PRIVATE_KEY_3,
          balance: "10000000000000000000000",
        },
        {
          privateKey: process.env.LOCAL_PRIVATE_KEY_4,
          balance: "10000000000000000000000",
        },
      ],
    },
    testnet: {
      url: "https://data-seed-prebsc-2-s2.binance.org:8545/",
      accounts: [process.env.BSC_TESTNET_PRIVATE_KEY],
    },
    mainnet: {
      url: process.env.BSC_MAINNET_RPC,
      accounts: [process.env.BSC_MAINNET_PRIVATE_KEY],
    },
    kovan: {
      url: process.env.ETH_KOVAN_RPC,
      accounts: [process.env.ETH_TESTNET_PRIVATE_KEY],
    },
    ethereum: {
      url: process.env.ETH_MAINNET_RPC,
      accounts: [process.env.ETH_MAINNET_PRIVATE_KEY],
    },
    fantom_testnet: {
      url: "https://rpc.testnet.fantom.network/",
      accounts: [process.env.FANTOM_TESTNET_PRIVATE_KEY],
    },
    fantom_mainnet: {
      url: "https://rpc.ftm.tools/",
      accounts: [process.env.FANTOM_MAINNET_PRIVATE_KEY],
    },
    mainnetfork: {
      url: "http://127.0.0.1:8545",
      accounts: [process.env.BSC_MAINNET_PRIVATE_KEY, process.env.QA_PRIVATE_KEY],
      timeout: 500000,
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  solidity: {
    version: "0.6.6",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      evmVersion: "istanbul",
      outputSelection: {
        "*": {
          "": ["ast"],
          "*": [
            "evm.bytecode.object",
            "evm.deployedBytecode.object",
            "abi",
            "evm.bytecode.sourceMap",
            "evm.deployedBytecode.sourceMap",
            "metadata",
          ],
        },
      },
    },
  },
  paths: {
    sources: "./contracts/6",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "./typechain",
    target: process.env.TYPECHAIN_TARGET || "ethers-v5",
  },
  mocha: {
    timeout: 100000,
  },
};
