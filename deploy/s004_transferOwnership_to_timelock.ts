import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {  Ownable__factory } from '../typechain'
import { ethers, network } from 'hardhat';
import MainnetConfig from '../.mainnet.json'
import TestnetConfig from '../.testnet.json'

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

  const TO_BE_LOCKED = [
    "0xff054a8548e5D2731f3bB4bBAFD2D8a281b49E53",
    "0xE901f33dE3a92cea4E7402285fF28Fa8ca1Fd528",
    "0xbBd660843205340AF9375214b38f65CD44FCaC86",
    "0x7b3cD9e6C631Fbeac75A4f017DDa06009C32Ab63",
    "0x4cE3C78b1706FbC6070451A184D2d4E52145A51b",
    "0xA498326A4A481832bb6Ca97cC98dA47dc0452618",
    "0xaB2069C5B29B609B2F6786F2B734FEa1f3CA9e39",
    "0x7A42aB4B5995319aF04439dfCf48c3531AaC7885",
    "0x5344f6E26D450bB923dB1e1Cb3869dA663AE0788",
    "0x2B6f36874550a52cbf4BdA26784aa3deeC66C018",
    "0x937ADf954C878155B51aAd9d7b95D5C1C13fD315",
    "0x23C94E738bF6F80f4dCd61b945d97FD012399f60",
    "0x635494D61618CC30aA0D8ea0A662cd9391ae0c74",
    "0xdf9f064e9c972f15F1805456437F062D86A7A1E1",
    "0x8C3A7921cb4e4e6f3ff8EF4565Ae6C6CbA15b141",
    "0xc3b7F9635F261e0aC98784ac5D88b91f893C604f",
    "0xeBdDbfa495f9Bb35Ed1B3d5Cb9Fd0a555648f82b",
    "0x152675291df3bb24dC2034B84D95E515Eb693536",
    "0x2AEdC93F773D6B670fe2d65f6686B14985C268E2",
    "0x2A8841df1e68e2A665832588a6a8f5CC85718ea7",
    "0xCBd46eB8Afc9a561d5F4C6a9817A411832E2dBD7",
    "0xeC1928f6dC3aa5069A6837f390f803f996A65285",
    "0x8164104FeaA27Ac52d7CD22D63a5Ef50971cB7ff",
    "0x4679eAcbeaC8CD789cf381654Ef63f12851209Ad",
    "0x5e414082Db25578C25B52FA6D181C4E2c99cFB21",
    "0xab862f352d7F79A89ECfF1c5979A29c28107ed88",
    "0xd1591b1a2d608E2ee5492C9bdCEB71c995186DfF",
    "0xaC26F9f2ccCE357fABeF82231526DaE5Ef6561Ed",
    "0x3B741d39FB2ee68B5dF8E441eF0139CA3917B9db",
    "0xBeACCC2863297E4C09954f468427Bae029185941",
    "0x6Be9Da42d3F9C81efd947C564A0a6E345E6e7d22",
    "0xa092B5315C2dEa32B449392221D13026E5A6f2A1",
    "0x00d100A9c7F1b264E876D9570A65E9aAEe705493",
    "0xe7916F8D06265dC3D0c08ef8E5EEe5b85Ca85BBE",
    "0x1aEC4033707d3514D3F0b1eF2eBE7fA35aF0381F",
    "0x80A901864232A77c118ed8B302651D13B0FeEeDA",
    "0xc2d6a8299107C33aE8d1aF2C909f09f6e71845A7",
    "0x1A5A29E3590341A56C58F15bff9f4926bCeE8e45",
    "0x756D6D8aF66a51bD8DE883fd08bfE13867B5562f",
    "0x1e16a2c609c8F527B1827aF63474C21435654Ce4",
    "0xD363A8e3998D24618B172c91B4f46e749505bB23",
    "0xe17dE073567eE3681C07543f23f5ee05646C6262",
    "0x51AE984507004aeDFB5878A69c2073B0214E23c8",
    "0x5fE86b16DaD3bA266E6019FeB5030d70F462e1BD",
    "0x8DbE625685B792889eE8Ac36BbCD6d277b9aD115",
    "0x7cb17012b50b465136304098C382BD9a72E967a2",
    "0x9AA9304659A0bc0C0C37CF94A795E7c236eb32fd",
    "0xC7c546326f30aEA6c34178c7E8622015b3596CeF",
    "0x051eA8aa73FC087ABa0e712822537D52d58786Ef",
    "0xda13B624E3D401565e86e19d524BDEd99EE0460f",
    "0x3f326a6509b6122E9d14a8f611F14ac98Aa19d23",
    "0x9D0D8db54EE1d37d08C79612920addB9fFF16d5b",
    "0x3659538Bd4c93E5f0b15C240838148dCdACa6424",
    "0x04a60075c19631575e80B3144de91dBE98af483B",
    "0x504E1FEF3578b5aAE9d85C31092F560985953187",
    "0x7cBF1b0858572A2CA39a1709800ac6C64261F947",
    "0x9335E4103eF806E74e6173c5F46d6ab95f9D6b6a",
    "0x10535742D91cc5465977De660a6007B4046c4211",
    "0xD17674684b01f455a39973A963Aefe618c47D7c7",
  ];








  const config = network.name === "mainnet" ? MainnetConfig : TestnetConfig

  for(let i = 0; i < TO_BE_LOCKED.length; i++ ) {
    console.log(`>> Transferring ownership of ${TO_BE_LOCKED[i]} to TIMELOCK`);
    const ownable = Ownable__factory.connect(TO_BE_LOCKED[i], (await ethers.getSigners())[0]);
    await ownable.transferOwnership(config.Timelock);
    console.log("✅ Done")
  }
};

export default func;
func.tags = ['TransferOwnershipToTimeLock'];