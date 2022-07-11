import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Ownable__factory } from "../../../../typechain";
import { ethers } from "hardhat";
import { ConfigEntity } from "../../../entities";

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
    "0x42dA676116DF26EE9bb71595fFe7c18343FB2b64",
    "0x83A5d5c54Ad83bBeA8667B3B95d7610E16e52723",
    "0xFa4B1e50f6EF51D0DaB5c2EEA7434cE6974Fa832",
    "0x07767daF4e84bDAaBf3A72c80cec8C8Eb962f3Ae",
    "0xae2b281719f2D27C1478a53995Afed82Ccd8B051",
    "0xb4FF3828d9d8eE0997cc29fF173A1C621D797bD7",
    "0x1CaB044765F69a8db621a71b05BdD0fb36D0c51c",
    "0x3A0062Ca77Bd1926a1DCBfd436701314e483aa81",
    "0x676Fe5f796C1C5F6FC7135CE3d5821a65e134506",
    "0xf8EE10951021F606cDe1eB700Fe910d90903121e",
    "0x79A499228e3A2ae0168f3fbD2019EeF991A43B41",
    "0x11873b84BcAeaec816f41c8DD46ED529D85daD45",
    "0x12aa5b890a125010Ec58337b2aA975e2A1295cDf",
    "0xBbFACE35322D6d04E0Cf911626Fa54B55ADf8fB8",
    "0x02DB090d70A20D9f563835B2D5DcF14448A1B116",
    "0x661C9Bb0Da0a7A6E4f6Ec6E49cf760Bc570B12A9",
    "0xE0e4e9F91d26647265Be902d012C6fDc0f4fd4e5",
    "0xd60f6bb9e2a1e6C44Bd1Df3946d76cBd79C9636F",
    "0x54D3218787060463EEb944fa01b0cbE745Ef4DB5",
    "0x59984D70342dB0A4797D6C6E256d9445efeeb949",
    "0xF15416004Bd51Fe99328C27C6DB62953CB078bB2",
    "0xa15665BedecbEa17D8c0C21067743Db6fDD343F4",
    "0x100aBb8EF81470F5A83A078c76B1cA74d33e4b92",
    "0x071ac07A287C643b193bc107D29DF4D53BFFAFf7",
    "0xdAa4D6FfF2055Fa2A3936190EA4FcC682Dc46898",
    "0x287705baa115e927998eE8D1941397C9977ebd89",
    "0x12A046476bC81DbE23608a81C9A069b8655698F8",
    "0x63D0eF9F8e26ddc8371B64F2Fd326a5eC1637f12",
    "0x50657a0395bCC066dcEAc86152208c000D994a46",
    "0xe3bD3d71C87fC21427458ea90c0FceD155A486D9",
    "0x8EF56e94bbaEe1638C3c87D3ab0de0a90e2cB067",
    "0x4b70c41F514FBBEa718234Ac72f36c1b077a4162",
    "0x0d9fAF7023976B45b220b692699C5f5E9432EFD9",
    "0xCB0531f17ff9f4FF3FbEdA38A63250706BE2B853",
    "0x606959Ec174624627178Be2a6888ED6E5A036D22",
    "0x47E6Bc836A82cb5A38545607dAEe7b6A8B334AbA",
    "0x3C26EaC5F59A1CbDff9208c72E77aD59e7238506",
    "0x6F389b78b40FA1C11b0E73B43e0C3f72e31B4e13",
    "0x9638A202B9Ae27650e7c40153590D666F67fFceF",
    "0x4DD4CAc8FA9B8032A1205b0dd0b81b7a3cA89BE7",
    "0xE5747D8fa3418FD4E0097E526D98daf08Ff40A01",
    "0x7DE458Db800eFF41Daa1e3c67B5fA8689EF2908e",
    "0xf58f039B76F4094cA324eEA291bE56838789BB56",
    "0x4acFecBbe2965119DB6c9d539e4aF4A1DA9bD43B",
    "0x6A96fE4739640B136a434E255E53fB7d8249b3CF",
    "0xE3CADBF72F99eDD1f0eE0d97c0e395C312b5b07E",
    "0x93269F1600C19FeD0a378b242B698f647E48A6ed",
    "0x3F89B3198cB710248136bbB640e88C1618436d20",
    "0x63AA720547385e9a3f4E240A13C3007F94664f72",
    "0x6fff1F59Ecdb163b59dfc0005aF2A89ff86A3587",
    "0xBEd0673c5795367Afa01BB294DE505B573fa5a29",
    "0x676f1A2D354c6f11C23183E18DDd06B317331453",
    "0x3Afc9A1B8A42C77aE7d23463c6FED26615827291",
  ];

  const config = ConfigEntity.getConfig();
  const deployer = (await ethers.getSigners())[0];
  let nonce = await deployer.getTransactionCount();

  for (let i = 0; i < TO_BE_LOCKED.length; i++) {
    console.log(`>> Transferring ownership of ${TO_BE_LOCKED[i]} to TIMELOCK`);
    const ownable = Ownable__factory.connect(TO_BE_LOCKED[i], deployer);
    await ownable.transferOwnership(config.Timelock, {
      gasPrice: ethers.utils.parseUnits("8", "gwei"),
      nonce: nonce++,
    });
    console.log("✅ Done");
  }
};

export default func;
func.tags = ["TransferOwnershipToTimeLock"];
