import { network } from 'hardhat';
import MainnetConfig from '../../.mainnet.json'
import TestnetConfig from '../../.testnet.json'
import { Config } from '../interfaces/config';

export function getConfig(): Config {
  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig
  return config
}