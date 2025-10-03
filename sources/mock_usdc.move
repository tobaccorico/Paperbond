module algotoken::mock_usdc {
    use std::signer;
    use std::string;
    use aptos_framework::coin::{Self, MintCapability, BurnCapability};

    struct MockUSDC {}

    struct Capabilities has key {
        mint_cap: MintCapability<MockUSDC>,
        burn_cap: BurnCapability<MockUSDC>,
    }

    /// Initialize the mock USDC (call once on deployment)
    public entry fun initialize(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<MockUSDC>(
            admin,
            string::utf8(b"Mock USDC"),
            string::utf8(b"mUSDC"),
            8, // 8 decimals like real USDC
            true,
        );

        coin::destroy_freeze_cap(freeze_cap);
        move_to(admin, Capabilities { mint_cap, burn_cap });
    }

    /// Register to receive MockUSDC
    public entry fun register(account: &signer) {
        coin::register<MockUSDC>(account);
    }

    /// Mint tokens (admin only, for testnet faucet)
    public entry fun mint(admin: &signer, to: address, amount: u64) acquires Capabilities {
        let caps = borrow_global<Capabilities>(signer::address_of(admin));
        let coins = coin::mint(amount, &caps.mint_cap);
        coin::deposit(to, coins);
    }
}