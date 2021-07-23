import { BigNumberish, Signer } from "ethers";
import {
  IERC20,
  MockERC20,
  PancakeFactory,
  PancakeFactory__factory,
  PancakeRouterV2,
  PancakeRouterV2__factory,
} from "../../typechain";

export interface ILiquidity {
  token0: IERC20;
  token1: IERC20;
  amount0desired: BigNumberish;
  amount1desired: BigNumberish;
}

export class SwapHelper {
  private FOREVER = "2000000000";
  private factory: PancakeFactory;
  private router: PancakeRouterV2;
  private signer: Signer;

  constructor(_factoryAddress: string, _routerAddress: string, _signer: Signer) {
    this.router = PancakeRouterV2__factory.connect(_routerAddress, _signer);
    this.factory = PancakeFactory__factory.connect(_factoryAddress, _signer);
    this.signer = _signer;
  }

  public async addLiquidities(liquidities: Array<ILiquidity>) {
    const wbnbAddress = await this.router.WETH();

    for (const liq of liquidities) {
      if (liq.token0.address === wbnbAddress)
        this.signer.sendTransaction({ to: wbnbAddress, value: liq.amount0desired });

      if (liq.token1.address === wbnbAddress)
        this.signer.sendTransaction({ to: wbnbAddress, value: liq.amount1desired });

      await liq.token0.approve(this.router.address, liq.amount0desired);
      await liq.token1.approve(this.router.address, liq.amount1desired);

      await this.router.addLiquidity(
        liq.token0.address,
        liq.token1.address,
        liq.amount0desired,
        liq.amount1desired,
        0,
        0,
        await this.signer.getAddress(),
        this.FOREVER
      );
    }
  }
}
