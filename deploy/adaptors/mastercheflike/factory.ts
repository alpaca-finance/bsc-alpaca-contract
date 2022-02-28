import { ethers } from "ethers";
import { MasterChefLike } from "../../entities/masterchef-like";
import { IMasterChefLike } from "./IMasterChefLike";
import { MdexMasterChefAdaptor } from "./mdex";
import { PancakeMasterChefAdaptor } from "./pancake";
import { SpookyMasterChefAdaptor } from "./spooky";
import { TombMasterChefAdaptor } from "./tomb";

export class MasterChefLikeFactory {
  public static newMasterChefLike(which: MasterChefLike, address: string, signer: ethers.Signer): IMasterChefLike {
    if (which === MasterChefLike.mdex) return new MdexMasterChefAdaptor(address, signer);
    if (which === MasterChefLike.pancake) return new PancakeMasterChefAdaptor(address, signer);
    if (which === MasterChefLike.spooky) return new SpookyMasterChefAdaptor(address, signer);
    if (which === MasterChefLike.tomb) return new TombMasterChefAdaptor(address, signer);

    throw new Error("Unknown MasterChefLike");
  }
}
