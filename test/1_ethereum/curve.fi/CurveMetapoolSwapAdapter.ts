import hre from "hardhat";
import { Artifact } from "hardhat/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { TestDeFiAdapter } from "../../../typechain/TestDeFiAdapter";
import { LiquidityPool, Signers } from "../types";
import { shouldBehaveLikeCurveMetapoolSwapAdapter } from "./CurveMetapoolSwapAdapter.behavior";
import { default as CurveExports } from "@optyfi/defi-legos/ethereum/curve/contracts";
import { getOverrideOptions } from "../../utils";
import { CurveCryptoPoolAdapter } from "../../../typechain";

const { deployContract } = hre.waffle;

const CurvePools = CurveExports.CurveCryptoPool.pools;

describe("Unit tests", function () {
  before(async function () {
    this.signers = {} as Signers;
    const signers: SignerWithAddress[] = await hre.ethers.getSigners();

    this.signers.admin = signers[0];
    this.signers.owner = signers[1];
    this.signers.deployer = signers[2];
    this.signers.alice = signers[3];
    this.signers.operator = await hre.ethers.getSigner("0xb95dff9A2D1d0003e74A64A1f36eE6767c8fb9Ed");

    // deploy Curve Crypto Pool Adapter
    const curveCryptoPoolAdapterArtifact: Artifact = await hre.artifacts.readArtifact("CurveCryptoPoolAdapter");
    this.curveCryptoPoolAdapter = <CurveCryptoPoolAdapter>(
      await deployContract(
        this.signers.deployer,
        curveCryptoPoolAdapterArtifact,
        [
          "0x99fa011e33a8c6196869dec7bc407e896ba67fe3",
          CurveExports.CurveFactory.address,
          CurveExports.CurveMetaRegistry.address,
        ],
        getOverrideOptions(),
      )
    );

    // deploy TestDeFiAdapter Contract
    const testDeFiAdapterArtifact: Artifact = await hre.artifacts.readArtifact("TestDeFiAdapter");
    this.testDeFiAdapter = <TestDeFiAdapter>(
      await deployContract(this.signers.deployer, testDeFiAdapterArtifact, [], getOverrideOptions())
    );
  });

  describe("CurveCryptoPoolAdapter", function () {
    Object.keys(CurvePools).map((token: string) => {
      shouldBehaveLikeCurveMetapoolSwapAdapter(token, (CurvePools as LiquidityPool)[token]);
    });
  });
});
