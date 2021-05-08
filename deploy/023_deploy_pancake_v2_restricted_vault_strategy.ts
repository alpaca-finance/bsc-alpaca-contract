import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, upgrades } from 'hardhat';
import {
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal,
  PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory } from '../typechain';

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

  const NEW_PARAMS = [{
    VAULT_ADDR: '0xf9d32C5E10Dd51511894b360e6bD39D7573450F9',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    WHITELIST_WORKER: [
      '0x2c12663339Fdce1A3088C0245FC2499255ccF7eC',
      '0xf20E73385397284f37c47963E2515156fCf33360',
      '0xA950ee51Ac3b27a1a6C87D6448D6717ACBc7b0A8',
      '0x8Da719444090875B476A7163F8A363fB30F2440c',
      '0x09207DF4c9D3E62346997e39526fb0e46Ce45539',
      '0x87501549129FB8A960F870CCcDc0153D8b926b4E',
      '0x9d25cEec06a6A732c8647BA717f986Bf67794a80',
      '0xF4964FDD35D9443b766adD8bdEb98C4E8592a7ea',
      '0x933d7fABE41cBc5e9483bD8CD0407Cf375a8e0C3',
      '0x3C437EBe897fd8A624F762A1c9e79A3759b57615',
      '0x7b3cD9e6C631Fbeac75A4f017DDa06009C32Ab63',
      '0x4cE3C78b1706FbC6070451A184D2d4E52145A51b',
      '0xA498326A4A481832bb6Ca97cC98dA47dc0452618',
    ]
  }, {
    VAULT_ADDR: '0xe5ed8148fE4915cE857FC648b9BdEF8Bb9491Fa5',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    WHITELIST_WORKER: [
      '0xDf605784D78D42b5507Be14D6533a835E2692A16',
      '0x29000295C94a9739cB6F6A7Bf407684f6c372286',
      '0xcF133249342444781ac4Fd5C101a0874ef88BA3A',
      '0x8B9e246D217e94ff67EA2d48fC6299366D3f984b',
      '0xA06635050bA513B872a24F3316b68fdD98C424D3',
      '0xa7133b1e009e542ee5f6F6Dd786D9B35382600a2',
      '0xeC1928f6dC3aa5069A6837f390f803f996A65285'
    ]
  }, {
    VAULT_ADDR: '0x3F1D4A430C213bd9D4c9a12E4F382270505fCeA1',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    WHITELIST_WORKER: [
      '0xC8149CAc51AC1bb5009Dd71e50C54a7dec96aB30',
      '0xd9811CeD97545243a13608924d6648251B07ed1A',
    ]
  },{
    VAULT_ADDR: '0x6ad3A0d891C59677fbbB22E071613253467C382A',
    ROUTER: '0x367633909278A3C91f4cB130D8e56382F00D1071',
    WHITELIST_WORKER: [
      '0x4Ce9EBac0b85c406af33d2Ba92502F4317511e18'
    ]
  }]








  for(let i = 0; i < NEW_PARAMS.length; i++ ) {
    console.log(">> Deploying an upgradable Restricted StrategyAddTwoSidesOptimalV2 contract");
    const StrategyRestrictedAddTwoSidesOptimal = (await ethers.getContractFactory(
      'PancakeswapV2RestrictedStrategyAddTwoSidesOptimal',
      (await ethers.getSigners())[0]
    )) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal__factory;
    const strategyRestrictedAddTwoSidesOptimal = await upgrades.deployProxy(
      StrategyRestrictedAddTwoSidesOptimal,[NEW_PARAMS[i].ROUTER, NEW_PARAMS[i].VAULT_ADDR]
    ) as PancakeswapV2RestrictedStrategyAddTwoSidesOptimal;
    await strategyRestrictedAddTwoSidesOptimal.deployed();
    console.log(`>> Deployed at ${strategyRestrictedAddTwoSidesOptimal.address}`);

    console.log(">> Whitelisting Workers")
    const tx = await strategyRestrictedAddTwoSidesOptimal.setWorkersOk(NEW_PARAMS[i].WHITELIST_WORKER, true)
    console.log(">> Done at: ", tx.hash)
  }
};

export default func;
func.tags = ['RestrictedVaultStrategiesV2'];