import hre, { ethers } from "hardhat";
import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { getAddress } from "ethers/lib/utils";
import { BigNumber } from "ethers";
import { PoolItem, Whale } from "../types";
import { getOverrideOptions, setTokenBalanceInStorage } from "../../utils";
import whales from "../../../helpers/whales.json";
import {
  ERC20,
  ICurveCryptoPool,
  ICurveCryptoPool__factory,
  ICurveFactory,
  ICurveFactory__factory,
  IERC20,
  IERC20__factory,
} from "../../../typechain";
import { default as CurveExports } from "@optyfi/defi-legos/ethereum/curve/contracts";

chai.use(solidity);

const TypedWhales = whales as Whale;
export function shouldBehaveLikeCurveMetapoolSwapAdapter(token: string, pool: PoolItem): void {
  it(`should deposit ${token} and withdraw LP tokens in ${pool.pool} pool of Curve`, async function () {
    const tokenInstance = <ERC20>await hre.ethers.getContractAt("ERC20", pool.tokens[0]);
    try {
      await setTokenBalanceInStorage(tokenInstance, this.testDeFiAdapter.address, "10000");
    } catch (e) {
      console.log("Entering...");
      const whaleAddress = TypedWhales[pool.tokens[0]];
      const whale = await hre.ethers.getSigner(whaleAddress);
      const decimals = await tokenInstance.decimals();
      const balance = await tokenInstance.balanceOf(this.testDeFiAdapter.address);
      console.log("TestDefiAdapter balance before: ", balance.toString());
      console.log("Whale balance before: ", (await tokenInstance.balanceOf(whaleAddress)).toString());
      if (balance.lt(BigNumber.from("1").pow(decimals))) {
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [whaleAddress],
        });
        await this.signers.admin.sendTransaction({
          to: whaleAddress,
          value: hre.ethers.utils.parseEther("100"),
          ...getOverrideOptions(),
        });
        await tokenInstance
          .connect(whale)
          .transfer(
            this.testDeFiAdapter.address,
            BigNumber.from("1").mul(BigNumber.from(10).pow(decimals - 6)),
            getOverrideOptions(),
          );
        console.log(
          "TestDefiAdapter balance after: ",
          (await tokenInstance.balanceOf(this.testDeFiAdapter.address)).toString(),
        );
      }
    }
    // check number of underlying tokens
    if (pool.tokens.length > 1) {
      console.log("Skipping because the strategy requires to deposit more than one underlying token");
      this.skip();
    }
    // curve's swap pool instance
    const curveCryptoPoolInstance = <ICurveCryptoPool>(
      await hre.ethers.getContractAt(ICurveCryptoPool__factory.abi, pool.pool)
    );
    const lpTokenInstance = <IERC20>await ethers.getContractAt(IERC20__factory.abi, pool.lpToken);

    const tx = await this.testDeFiAdapter.giveAllowances(
      [tokenInstance.address, lpTokenInstance.address],
      [curveCryptoPoolInstance.address, curveCryptoPoolInstance.address],
    );
    await tx.wait();
    // check total supply
    if ((await lpTokenInstance.totalSupply()).eq(BigNumber.from(0))) {
      console.log("Skipping because total supply is zero");
      this.skip();
    }
    // check virtual price
    if ((await curveCryptoPoolInstance.get_virtual_price()).eq(BigNumber.from(0))) {
      console.log("Skipping because virtual price is zero");
      this.skip();
    }
    // curve's metapool factory instance
    const curveFactoryInstance = <ICurveFactory>(
      await hre.ethers.getContractAt(ICurveFactory__factory.abi, CurveExports.CurveFactory.address)
    );
    // curve's swap underlying tokens
    const underlyingTokens = await curveFactoryInstance.get_coins(pool.pool);
    // token index in curve's swap pool
    let tokenIndex: BigNumber = BigNumber.from(0);
    for (let i = 0; i < underlyingTokens.length; i++) {
      if (getAddress(underlyingTokens[i]) == pool.tokens[0]) {
        tokenIndex = BigNumber.from(i);
      }
    }
    // underlying token instance
    const underlyingTokenInstance = <IERC20>await hre.ethers.getContractAt(IERC20__factory.abi, pool.tokens[0]);
    // pool value
    const virtualPrice = await curveCryptoPoolInstance.get_virtual_price();
    const totalSupply = await lpTokenInstance.totalSupply();
    const poolValue = virtualPrice.mul(totalSupply).div(BigNumber.from(10).pow(18));
    // amounts to deposit
    const amounts = [];
    for (let i = 0; i < underlyingTokens.length; i++) {
      if (getAddress(underlyingTokens[i]) == pool.tokens[0]) {
        if ((await tokenInstance.balanceOf(this.testDeFiAdapter.address)).gt(poolValue)) {
          amounts[i] = poolValue;
        } else {
          amounts[i] = await tokenInstance.balanceOf(this.testDeFiAdapter.address);
        }
      } else {
        amounts[i] = BigNumber.from(0);
      }
    }
    const expectedLPTokenBalanceBeforeDepositing = await curveCryptoPoolInstance.calc_token_amount([
      amounts[0],
      amounts[1],
    ]);
    // 1. deposit all underlying tokens
    await this.testDeFiAdapter.testGetDepositAllCodes(
      pool.tokens[0],
      pool.pool,
      this.curveCryptoPoolAdapter.address,
      getOverrideOptions(),
    );
    // 1.1 assert whether lptoken balance is as expected or not after deposit
    const actualLPTokenBalanceAfterDeposit = await this.curveCryptoPoolAdapter.getLiquidityPoolTokenBalance(
      this.testDeFiAdapter.address,
      this.testDeFiAdapter.address, // placeholder of type address
      pool.pool,
    );
    expect(actualLPTokenBalanceAfterDeposit).to.be.gt(expectedLPTokenBalanceBeforeDepositing.mul(95).div(100));
    const expectedLPTokenBalanceAfterDeposit = await lpTokenInstance.balanceOf(this.testDeFiAdapter.address);
    expect(actualLPTokenBalanceAfterDeposit).to.be.eq(expectedLPTokenBalanceAfterDeposit);
    // 1.2 assert whether underlying token balance is as expected or not after deposit
    const actualUnderlyingTokenBalanceAfterDeposit = await this.testDeFiAdapter.getERC20TokenBalance(
      (
        await this.curveCryptoPoolAdapter.getUnderlyingTokens(pool.pool, pool.pool)
      )[Number(tokenIndex)],
      this.testDeFiAdapter.address,
    );
    const expectedUnderlyingTokenBalanceAfterDeposit = await underlyingTokenInstance.balanceOf(
      this.testDeFiAdapter.address,
    );
    expect(actualUnderlyingTokenBalanceAfterDeposit).to.be.eq(expectedUnderlyingTokenBalanceAfterDeposit);
    // 1.3 assert whether the amount in token is as expected or not after depositing
    const actualAmountInTokenAfterDeposit = await this.curveCryptoPoolAdapter.getAllAmountInToken(
      this.testDeFiAdapter.address,
      pool.tokens[0],
      pool.pool,
    );
    const expectedAmountInTokenAfterDeposit = await curveCryptoPoolInstance.calc_withdraw_one_coin(
      actualLPTokenBalanceAfterDeposit,
      tokenIndex,
    );
    expect(actualAmountInTokenAfterDeposit).to.be.eq(expectedAmountInTokenAfterDeposit);
    // 2. Withdraw all lpToken balance
    await this.testDeFiAdapter.testGetWithdrawAllCodes(
      pool.tokens[0],
      pool.pool,
      this.curveCryptoPoolAdapter.address,
      getOverrideOptions(),
    );
    // 2.1 assert whether lpToken balance is as expected or not
    const actualLPTokenBalanceAfterWithdraw = await this.curveCryptoPoolAdapter.getLiquidityPoolTokenBalance(
      this.testDeFiAdapter.address,
      this.testDeFiAdapter.address, // placeholder of type address
      pool.pool,
    );
    const expectedLPTokenBalanceAfterWithdraw = await lpTokenInstance.balanceOf(this.testDeFiAdapter.address);
    expect(actualLPTokenBalanceAfterWithdraw).to.be.eq(expectedLPTokenBalanceAfterWithdraw);
    // 2.2 assert whether underlying token balance is as expected or not after withdraw
    const actualUnderlyingTokenBalanceAfterWithdraw = await this.testDeFiAdapter.getERC20TokenBalance(
      (
        await this.curveCryptoPoolAdapter.getUnderlyingTokens(pool.pool, pool.pool)
      )[Number(tokenIndex)],
      this.testDeFiAdapter.address,
    );
    const expectedUnderlyingTokenBalanceAfterWithdraw = await underlyingTokenInstance.balanceOf(
      this.testDeFiAdapter.address,
    );
    expect(actualUnderlyingTokenBalanceAfterWithdraw).to.be.eq(expectedUnderlyingTokenBalanceAfterWithdraw);
  }).timeout(100000);
}
