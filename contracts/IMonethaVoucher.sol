pragma solidity ^0.4.24;

interface IMonethaVoucher {
    /**
    * @dev Total number of vouchers in shared pool
    */
    function totalInSharedPool() external view returns (uint256);

    /**
     * @dev Converts vouchers to equivalent amount of wei.
     * @param _value amount of vouchers (vouchers) to convert to amount of wei
     * @return A uint256 specifying the amount of wei.
     */
    function toWei(uint256 _value) external view returns (uint256);

    /**
     * @dev Converts amount of wei to equivalent amount of vouchers.
     * @param _value amount of wei to convert to vouchers (vouchers)
     * @return A uint256 specifying the amount of vouchers.
     */
    function fromWei(uint256 _value) external view returns (uint256);

    /**
     * @dev Applies discount for address by returning vouchers to shared pool and transferring funds (in wei). May be called only by Monetha.
     * @param _for address to apply discount for
     * @param _vouchers amount of vouchers to return to shared pool
     * @return Actual number of vouchers returned to shared pool and amount of funds (in wei) transferred.
     */
    function applyDiscount(address _for, uint256 _vouchers) external returns (uint256 amountVouchers, uint256 amountWei);

    /**
     * @dev Applies payback by transferring vouchers from the shared pool to the user.
     * The amount of transferred vouchers is equivalent to the amount of Ether in the `_amountWei` parameter.
     * @param _for address to apply payback for
     * @param _amountWei amount of Ether to estimate the amount of vouchers
     * @return The number of vouchers added
     */
    function applyPayback(address _for, uint256 _amountWei) external returns (uint256 amountVouchers);

    /**
     * @dev Function to buy vouchers by transferring equivalent amount in Ether to contract. May be called only by Monetha.
     * After the vouchers are purchased, they can be sold or released to another user. Purchased vouchers are stored in
     * a separate pool and may not be expired.
     * @param _vouchers The amount of vouchers to buy. The caller must also transfer an equivalent amount of Ether.
     */
    function buyVouchers(uint256 _vouchers) external payable;

    /**
     * @dev The function allows Monetha account to sell previously purchased vouchers and get Ether from the sale.
     * The equivalent amount of Ether will be transferred to the caller. May be called only by Monetha.
     * @param _vouchers The amount of vouchers to sell.
     * @return A uint256 specifying the amount of Ether (in wei) transferred to the caller.
     */
    function sellVouchers(uint256 _vouchers) external returns(uint256 weis);

    /**
     * @dev Function allows Monetha account to release the purchased vouchers to any address.
     * The released voucher acquires an expiration property and should be used in Monetha ecosystem within 6 months, otherwise
     * it will be returned to shared pool. May be called only by Monetha.
     * @param _to address to release vouchers to.
     * @param _value the amount of vouchers to release.
     */
    function releasePurchasedTo(address _to, uint256 _value) external returns (bool);

    /**
     * @dev Function to check the amount of vouchers that an owner (Monetha account) allowed to sell or release to some user.
     * @param owner The address which owns the funds.
     * @return A uint256 specifying the amount of vouchers still available for the owner.
     */
    function purchasedBy(address owner) external view returns (uint256);
}