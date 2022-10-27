// solhint-disable no-unused-vars
// SPDX-License-Identifier:MIT

pragma solidity =0.8.11;

//  libraries
import { Address } from "@openzeppelin/contracts-0.8.x/utils/Address.sol";

//  helper contracts
import { ERC20 } from "@openzeppelin/contracts-0.8.x/token/ERC20/ERC20.sol";
import { AdapterModifiersBase } from "../../utils/AdapterModifiersBase.sol";

//  interfaces
import { IAdapter } from "@optyfi/defi-legos/interfaces/defiAdapters/contracts/IAdapter.sol";
import { ICurveCryptoPool } from "@optyfi/defi-legos/ethereum/curve/contracts/ICurveCryptoPool.sol";
import { ICurveSwap } from "@optyfi/defi-legos/ethereum/curve/contracts/interfacesV0/ICurveSwap.sol";
import { ICurveFactory } from "@optyfi/defi-legos/ethereum/curve/contracts/ICurveFactory.sol";
import { ICurveMetaRegistry } from "@optyfi/defi-legos/ethereum/curve/contracts/ICurveMetaRegistry.sol";

/**
 * @title Adapter for Curve Crypto pools generared from permissionless factory pool
 * @author Opty.fi
 * @dev Abstraction layer to Curve's Crypto pools generared from permissionless factory pool
 *      Note 1 : In this adapter, a swap pool is defined as a single-sided liquidity pool
 *      Note 2 : In this adapter, lp token can be redemeed into more than one underlying token
 */
contract CurveCryptoPoolAdapter is IAdapter, AdapterModifiersBase {
    using Address for address;

    /*solhint-disable var-name-mixedcase*/
    /** @notice Curve Factory */
    address public immutable FACTORY;

    /** @notice Curve Meta Registry */
    address public immutable META_REGISTRY;

    /*solhint-enable var-name-mixedcase*/

    /**
     * @dev initialise registry
     */
    constructor(
        address _registry,
        address _factory,
        address _metaRegistry
    ) AdapterModifiersBase(_registry) {
        FACTORY = _factory;
        META_REGISTRY = _metaRegistry;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getPoolValue(address _swapPool, address) public view override returns (uint256) {
        uint256 _virtualPrice = ICurveCryptoPool(_swapPool).get_virtual_price();
        uint256 _totalSupply = ERC20(getLiquidityPoolToken(address(0), _swapPool)).totalSupply();
        // the pool value will be in USD for US dollar stablecoin pools
        // the pool value will be in BTC for BTC pools
        return (_virtualPrice * _totalSupply) / (10**18);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getDepositAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _swapPool
    ) public view override returns (bytes[] memory) {
        uint256 _amount = ERC20(_underlyingToken).balanceOf(_vault);
        return _getDepositCode(_vault, _underlyingToken, _swapPool, _amount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getWithdrawAllCodes(
        address payable _vault,
        address _underlyingToken,
        address _swapPool
    ) public view override returns (bytes[] memory) {
        uint256 _amount = getLiquidityPoolTokenBalance(_vault, address(0), _swapPool);
        return getWithdrawSomeCodes(_vault, _underlyingToken, _swapPool, _amount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getUnderlyingTokens(address _swapPool, address)
        public
        view
        override
        returns (address[] memory _underlyingTokens)
    {
        address[2] memory _underlyingCoins = _getUnderlyingTokens(_swapPool, _getCurveFactory());
        uint256 _nCoins = _getNCoins(_swapPool, _getCurveRegistry());
        _underlyingTokens = new address[](_nCoins);
        for (uint256 _i = 0; _i < _nCoins; _i++) {
            _underlyingTokens[_i] = _underlyingCoins[_i];
        }
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateAmountInLPToken(
        address _underlyingToken,
        address _swapPool,
        uint256 _underlyingTokenAmount
    ) public view override returns (uint256 _amount) {
        uint256 _nCoins = _getNCoins(_swapPool, _getCurveRegistry());
        uint256[2] memory _amounts;
        address[2] memory _underlyingTokens = _getUnderlyingTokens(_swapPool, _getCurveFactory());
        for (uint256 _i = 0; _i < _nCoins; _i++) {
            if (_underlyingTokens[_i] == _underlyingToken) {
                _amounts[_i] = _underlyingTokenAmount;
            }
        }
        _amount = ICurveCryptoPool(_swapPool).calc_token_amount(_amounts);
    }

    /**
     * @inheritdoc IAdapter
     */
    function calculateRedeemableLPTokenAmount(
        address payable _vault,
        address _underlyingToken,
        address _swapPool,
        uint256 _redeemAmount
    ) public view override returns (uint256) {
        uint256 _liquidityPoolTokenBalance = getLiquidityPoolTokenBalance(_vault, address(0), _swapPool);
        uint256 _balanceInToken = getAllAmountInToken(_vault, _underlyingToken, _swapPool);
        // can have unintentional rounding errors
        return ((_liquidityPoolTokenBalance * _redeemAmount) / (_balanceInToken)) + uint256(1);
    }

    /**
     * @inheritdoc IAdapter
     */
    function isRedeemableAmountSufficient(
        address payable _vault,
        address _underlyingToken,
        address _swapPool,
        uint256 _redeemAmount
    ) public view override returns (bool) {
        uint256 _balanceInToken = getAllAmountInToken(_vault, _underlyingToken, _swapPool);
        return _balanceInToken >= _redeemAmount;
    }

    /**
     * @inheritdoc IAdapter
     */
    function canStake(address) public pure override returns (bool) {
        return false;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getDepositSomeCodes(
        address payable _vault,
        address _underlyingToken,
        address _swapPool,
        uint256 _amount
    ) public view override returns (bytes[] memory) {
        return _getDepositCode(_vault, _underlyingToken, _swapPool, _amount);
    }

    /**
     * @inheritdoc IAdapter
     * @dev Note : swap pools of compound,usdt,pax,y,susd and busd
     *             does not have remove_liquidity_one_coin function
     */
    function getWithdrawSomeCodes(
        address payable,
        address _underlyingToken,
        address _swapPool,
        uint256 _amount
    ) public view override returns (bytes[] memory _codes) {
        if (_amount > 0) {
            _codes = new bytes[](1);
            _codes[0] = abi.encode(
                _swapPool,
                // solhint-disable-next-line max-line-length
                abi.encodeWithSignature(
                    "remove_liquidity_one_coin(uint256,uint256,uint256)",
                    _amount,
                    _getTokenIndex(_swapPool, _underlyingToken),
                    (getSomeAmountInToken(_underlyingToken, _swapPool, _amount) * uint256(95)) / uint256(100)
                )
            );
        }
    }

    /**
     * @inheritdoc IAdapter
     */
    function getLiquidityPoolToken(address, address _swapPool) public view override returns (address) {
        return ICurveCryptoPool(_swapPool).token();
    }

    /**
     * @inheritdoc IAdapter
     */
    function getAllAmountInToken(
        address payable _vault,
        address _underlyingToken,
        address _swapPool
    ) public view override returns (uint256) {
        uint256 _liquidityPoolTokenAmount = getLiquidityPoolTokenBalance(_vault, address(0), _swapPool);
        return getSomeAmountInToken(_underlyingToken, _swapPool, _liquidityPoolTokenAmount);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getLiquidityPoolTokenBalance(
        address payable _vault,
        address,
        address _swapPool
    ) public view override returns (uint256) {
        return ERC20(getLiquidityPoolToken(address(0), _swapPool)).balanceOf(_vault);
    }

    /**
     * @inheritdoc IAdapter
     */
    function getSomeAmountInToken(
        address _underlyingToken,
        address _swapPool,
        uint256 _liquidityPoolTokenAmount
    ) public view override returns (uint256) {
        if (_liquidityPoolTokenAmount > 0) {
            return
                ICurveCryptoPool(_swapPool).calc_withdraw_one_coin(
                    _liquidityPoolTokenAmount,
                    _getTokenIndex(_swapPool, _underlyingToken)
                );
        }
        return 0;
    }

    /**
     * @inheritdoc IAdapter
     */
    function getRewardToken(address) public pure override returns (address) {
        return address(0);
    }

    /* solhint-enable no-empty-blocks */

    /**
     * @dev This function composes the configuration required to construct fuction calls
     * @param _underlyingToken address of the underlying asset
     * @param _swapPool swap pool address
     * @param _amount amount in underlying token
     * @return _nCoins number of underlying tokens in swap pool
     * @return _amounts value in an underlying token for each underlying token
     * @return _minMintAmount minimum amount of lp token that should be minted
     */
    function _getDepositCodeConfig(
        address _underlyingToken,
        address _swapPool,
        uint256 _amount
    )
        internal
        view
        returns (
            uint256 _nCoins,
            uint256[] memory _amounts,
            uint256 _minMintAmount
        )
    {
        _nCoins = _getNCoins(_swapPool, _getCurveRegistry());
        address[2] memory _underlyingTokens = _getUnderlyingTokens(_swapPool, _getCurveFactory());
        _amounts = new uint256[](_nCoins);
        for (uint256 _i = 0; _i < _nCoins; _i++) {
            if (_underlyingTokens[_i] == _underlyingToken) {
                _amounts[_i] = _amount;
            }
        }
        if (_nCoins == uint256(2)) {
            _minMintAmount = (ICurveCryptoPool(_swapPool).calc_token_amount([_amounts[0], _amounts[1]]) * 9900) / 10000;
        } else if (_nCoins == uint256(3)) {
            _minMintAmount =
                (ICurveSwap(_swapPool).calc_token_amount([_amounts[0], _amounts[1], _amounts[2]], true) * 9900) /
                10000;
        } else if (_nCoins == uint256(4)) {
            _minMintAmount =
                (ICurveSwap(_swapPool).calc_token_amount([_amounts[0], _amounts[1], _amounts[2], _amounts[3]], true) *
                    9900) /
                10000;
        }
    }

    /**
     * @dev This functions returns the token index for a underlying token
     * @param _underlyingToken address of the underlying asset
     * @param _swapPool swap pool address
     * @return _tokenIndex index of coin in swap pool
     */
    function _getTokenIndex(address _swapPool, address _underlyingToken) internal view returns (uint256) {
        address[2] memory _underlyingTokens = _getUnderlyingTokens(_swapPool, _getCurveFactory());
        for (uint256 _i = 0; _i < _underlyingTokens.length; _i++) {
            if (_underlyingTokens[_i] == _underlyingToken) {
                return _i;
            }
        }
        return 0;
    }

    /**
     * @dev This functions composes the function calls to deposit asset into deposit pool
     * @param _underlyingToken address of the underlying asset
     * @param _swapPool swap pool address
     * @param _amount the amount in underlying token
     * @return _codes bytes array of function calls to be executed from vault
     */
    function _getDepositCode(
        address payable,
        address _underlyingToken,
        address _swapPool,
        uint256 _amount
    ) internal view returns (bytes[] memory _codes) {
        (uint256 _nCoins, uint256[] memory _amounts, uint256 _minAmount) = _getDepositCodeConfig(
            _underlyingToken,
            _swapPool,
            _amount
        );
        _codes = new bytes[](1);
        if (_nCoins == uint256(2)) {
            uint256[2] memory _depositAmounts = [_amounts[0], _amounts[1]];
            _codes[0] = abi.encode(
                _swapPool,
                abi.encodeWithSignature("add_liquidity(uint256[2],uint256)", _depositAmounts, _minAmount)
            );
        } else if (_nCoins == uint256(3)) {
            uint256[3] memory _depositAmounts = [_amounts[0], _amounts[1], _amounts[2]];
            _codes[0] = abi.encode(
                _swapPool,
                abi.encodeWithSignature("add_liquidity(uint256[3],uint256)", _depositAmounts, _minAmount)
            );
        } else if (_nCoins == uint256(4)) {
            uint256[4] memory _depositAmounts = [_amounts[0], _amounts[1], _amounts[2], _amounts[3]];
            _codes[0] = abi.encode(
                _swapPool,
                abi.encodeWithSignature("add_liquidity(uint256[4],uint256)", _depositAmounts, _minAmount)
            );
        }
    }

    /**
     * @dev Get the underlying tokens within a swap pool.
     *      Note: For pools using lending, these are the
     *            wrapped coin addresses
     * @param _swapPool the swap pool address
     * @param _curveFactory the address of the Curve crypto pool factory
     * @return list of coin addresses
     */
    function _getUnderlyingTokens(address _swapPool, address _curveFactory) internal view returns (address[2] memory) {
        return ICurveFactory(_curveFactory).get_coins(_swapPool);
    }

    /**
     * @dev Get the address of the main registry contract
     * @return Address of the main registry contract
     */
    function _getCurveRegistry() internal view returns (address) {
        return META_REGISTRY;
    }

    /**
     * @dev Get the address of the curve crypto pool factory contract
     * @return Address of the curve crypto pool factory contract
     */
    function _getCurveFactory() internal view returns (address) {
        return FACTORY;
    }

    /**
     * @dev Get number of underlying tokens in a liquidity pool
     * @param _swapPool swap pool address associated with liquidity pool
     * @param _curveRegistry address of the main registry contract
     * @return  _nCoins Number of underlying tokens
     */
    function _getNCoins(address _swapPool, address _curveRegistry) internal view returns (uint256 _nCoins) {
        _nCoins = ICurveMetaRegistry(_curveRegistry).get_n_coins(_swapPool);
    }
}
