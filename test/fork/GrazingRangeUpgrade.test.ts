import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, network, upgrades } from "hardhat";
import { getConfig } from "../../deploy/entities/config";
import { GrazingRange, GrazingRange__factory, MockERC20, MockERC20__factory, Timelock__factory } from "../../typechain";
import * as timeHelpers from "../helpers/time";

type IPendingRewards = {
  campaignId: number;
  pendingReward: string;
  accRewardPerShare: string;
};

async function pendingReward(graze: GrazingRange, campaignId: number, account: string): Promise<IPendingRewards> {
  console.log(`query ${account} pendingReward from campaign ${campaignId}`);
  const reward = await graze.pendingReward(campaignId, account);
  const campaignInfo = await graze.campaignInfo(campaignId);
  return {
    campaignId,
    pendingReward: reward.toString(),
    accRewardPerShare: campaignInfo.accRewardPerShare.toString(),
  };
}

async function main() {
  if (network.name !== "mainnetfork") throw new Error("not mainnet fork");

  const config = getConfig();
  const [deployer, qa] = await ethers.getSigners();
  const arv = MockERC20__factory.connect(config.Tokens.ARV, deployer);
  const timelock = Timelock__factory.connect(config.Timelock, deployer);
  const eta = 1636153200;

  console.log(await ethers.provider.getNetwork());

  // Prepare the upgrade GrazingRange contract
  const GrazingRange = (await ethers.getContractFactory("GrazingRange")) as GrazingRange__factory;
  const graze = GrazingRange__factory.connect(config.GrazingRange.address, deployer);
  const preparedGrazingRangeV2: string = await upgrades.prepareUpgrade(config.GrazingRange.address, GrazingRange);

  await timelock.queueTransaction(
    config.ProxyAdmin,
    0,
    "upgradeAndCall(address,address,bytes)",
    ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes"],
      [config.GrazingRange.address, preparedGrazingRangeV2, graze.interface.encodeFunctionData("upgradePrecision")]
    ),
    eta
  );

  // Move timestamp to pass timelock
  await timeHelpers.set(ethers.BigNumber.from(eta));

  // Upgrade GrazingRange
  let promises = [];
  for (let i = 0; i < config.GrazingRange.pools.length; i++)
    promises.push(pendingReward(graze, config.GrazingRange.pools[i].id, qa.address));

  const beforeUpgradePendingRewards = await Promise.all(promises);
  console.table(beforeUpgradePendingRewards);

  await timelock.executeTransaction(
    config.ProxyAdmin,
    0,
    "upgradeAndCall(address,address,bytes)",
    ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes"],
      [config.GrazingRange.address, preparedGrazingRangeV2, graze.interface.encodeFunctionData("upgradePrecision")]
    ),
    eta
  );

  await expect(graze.upgradePrecision()).to.be.revertedWith("!proxy admin");

  promises = [];
  for (let i = 0; i < config.GrazingRange.pools.length; i++)
    promises.push(pendingReward(graze, config.GrazingRange.pools[i].id, qa.address));

  const afterUpgradePendingRewards = await Promise.all(promises);
  console.table(afterUpgradePendingRewards);

  console.log("mining..");
  await timeHelpers.advanceBlockTo(14170900);
  console.log("done");

  const qaGraze = GrazingRange__factory.connect(config.GrazingRange.address, qa);

  const arvBalanceBefore = await arv.balanceOf(qa.address);
  await qaGraze.harvest([28]);
  const arvBalanceAfter = await arv.balanceOf(qa.address);

  expect(arvBalanceAfter).to.gt(arvBalanceBefore);
  console.log(arvBalanceAfter.sub(arvBalanceBefore).toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
