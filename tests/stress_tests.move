#[test_only]
module algotoken::stress_tests {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self};
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use aptos_framework::aptos_coin;
    use algotoken::core::{Self, AlgoToken};

    const PRECISION: u128 = 1000000000000000000;

    fun setup_test(aptos_framework: &signer, admin: &signer): address {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        
        let admin_addr = signer::address_of(admin);
        account::create_account_for_test(admin_addr);
        
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
        
        core::test_initialize<aptos_coin::AptosCoin>(admin);
        
        admin_addr
    }

    fun setup_user_with_usdc(aptos_framework: &signer, user: &signer, usdc_amount: u64) {
        let user_addr = signer::address_of(user);
        account::create_account_for_test(user_addr);
        
        coin::register<aptos_coin::AptosCoin>(user);
        coin::register<AlgoToken>(user);
        
        aptos_coin::mint(aptos_framework, user_addr, usdc_amount);
    }

    // ============= TEST 1: STRESS TEST =============
    // Multiple users buying and selling randomly over extended time
    
    #[test(aptos_framework = @0x1, admin = @algotoken, user1 = @0x100, user2 = @0x200, user3 = @0x300, user4 = @0x400)]
    fun test_stress_multiple_users_random_trading(
        aptos_framework: &signer,
        admin: &signer,
        user1: &signer,
        user2: &signer,
        user3: &signer,
        user4: &signer,
    ) {
        setup_test(aptos_framework, admin);
        
        // Give each user substantial capital
        setup_user_with_usdc(aptos_framework, user1, 10000000000); // 100 USDC
        setup_user_with_usdc(aptos_framework, user2, 10000000000);
        setup_user_with_usdc(aptos_framework, user3, 10000000000);
        setup_user_with_usdc(aptos_framework, user4, 10000000000);
        
        let user1_addr = signer::address_of(user1);
        let user2_addr = signer::address_of(user2);
        let user3_addr = signer::address_of(user3);
        let user4_addr = signer::address_of(user4);
        
        // Simulate 100 days of random trading
        let day = 0;
        while (day < 100) {
            // Each day, random users trade
            let action = day % 8;
            
            if (action == 0) {
                // User 1 buys
                let usdc_balance = coin::balance<aptos_coin::AptosCoin>(user1_addr);
                if (usdc_balance > 1000000000) {
                    core::buy<aptos_coin::AptosCoin>(user1, 1000000000, 0);
                };
            } else if (action == 1) {
                // User 2 buys
                let usdc_balance = coin::balance<aptos_coin::AptosCoin>(user2_addr);
                if (usdc_balance > 500000000) {
                    core::buy<aptos_coin::AptosCoin>(user2, 500000000, 0);
                };
            } else if (action == 2) {
                // User 3 sells half tokens
                let token_balance = coin::balance<AlgoToken>(user3_addr);
                if (token_balance > 10000000) {
                    core::sell<aptos_coin::AptosCoin>(user3, token_balance / 2, 0);
                };
            } else if (action == 3) {
                // User 4 buys big
                let usdc_balance = coin::balance<aptos_coin::AptosCoin>(user4_addr);
                if (usdc_balance > 2000000000) {
                    core::buy<aptos_coin::AptosCoin>(user4, 2000000000, 0);
                };
            } else if (action == 4) {
                // User 1 sells quarter
                let token_balance = coin::balance<AlgoToken>(user1_addr);
                if (token_balance > 25000000) {
                    core::sell<aptos_coin::AptosCoin>(user1, token_balance / 4, 0);
                };
            } else if (action == 5) {
                // User 2 sells all
                let token_balance = coin::balance<AlgoToken>(user2_addr);
                if (token_balance > 10000000) {
                    core::sell<aptos_coin::AptosCoin>(user2, token_balance, 0);
                };
            } else if (action == 6) {
                // User 3 buys
                let usdc_balance = coin::balance<aptos_coin::AptosCoin>(user3_addr);
                if (usdc_balance > 1500000000) {
                    core::buy<aptos_coin::AptosCoin>(user3, 1500000000, 0);
                };
            } else {
                // User 4 sells small
                let token_balance = coin::balance<AlgoToken>(user4_addr);
                if (token_balance > 10000000) {
                    core::sell<aptos_coin::AptosCoin>(user4, token_balance / 10, 0);
                };
            };
            
            // Update system
            timestamp::fast_forward_seconds(86400); // 1 day
            core::update();
            
            // Verify system invariants
            let (slip, peg) = core::get_reserves();
            assert!(slip + peg > 0, 100 + day); // Always have reserves
            
            let (circ, hyp, _) = core::get_supply_info();
            if (circ > 0) {
                assert!(hyp >= circ, 200 + day); // Hypothetical >= Circulating
            };
            
            let price = core::get_price();
            assert!(price > 0, 300 + day); // Price always positive
            
            day = day + 1;
        };
        
        // Final sanity checks
        let (final_slip, final_peg) = core::get_reserves();
        assert!(final_slip + final_peg > 0, 1000);
        
        let (k, k_real, k_target) = core::get_k_values();
        assert!(k > 0, 1001);
        assert!(k_real > 0, 1002);
        assert!(k_target > 0, 1003);
    }

    // ============= TEST 2: BEAR MARKET RECOVERY =============
    // Deplete to minimum reserves, add new demand, verify recovery
    
    #[test(aptos_framework = @0x1, admin = @algotoken, whale = @0x500, buyer = @0x600)]
    fun test_bear_market_recovery(
        aptos_framework: &signer,
        admin: &signer,
        whale: &signer,
        buyer: &signer,
    ) {
        setup_test(aptos_framework, admin);
        
        // Whale creates initial market
        setup_user_with_usdc(aptos_framework, whale, 20000000000);
        core::buy<aptos_coin::AptosCoin>(whale, 10000000000, 0);
        
        let whale_addr = signer::address_of(whale);
        let (slip_initial, peg_initial) = core::get_reserves();
        
        // Whale tries to dump everything
        let all_tokens = coin::balance<AlgoToken>(whale_addr);
        core::sell<aptos_coin::AptosCoin>(whale, all_tokens, 0);
        
        let (slip_after_dump, peg_after_dump) = core::get_reserves();
        
        // Verify reserves remain (reserve lock worked)
        assert!(slip_after_dump + peg_after_dump > 0, 1);
        
        // New buyer enters market IMMEDIATELY
        setup_user_with_usdc(aptos_framework, buyer, 15000000000);
        core::buy<aptos_coin::AptosCoin>(buyer, 8000000000, 0);
        
        let price_after_buy = core::get_price();
        let (_, _, _) = core::get_supply_info();
        
        // Time passes with active supply
        timestamp::fast_forward_seconds(86400 * 30);
        core::update();
        
        timestamp::fast_forward_seconds(86400 * 30);
        core::update();
        
        let price_final = core::get_price();
        
        // System should maintain or grow price with new demand
        assert!(price_final >= price_after_buy, 6);
        
        // More buying
        core::buy<aptos_coin::AptosCoin>(buyer, 3000000000, 0);
        
        let (slip_final, peg_final) = core::get_reserves();
        assert!(slip_final + peg_final > slip_after_dump + peg_after_dump, 7);
        
        // System works - can trade
        let buyer_addr = signer::address_of(buyer);
        let buyer_tokens = coin::balance<AlgoToken>(buyer_addr);
        if (buyer_tokens > 10000000) {
            core::sell<aptos_coin::AptosCoin>(buyer, buyer_tokens / 10, 0);
        };
        
        // Reserves still exist
        let (final_slip, final_peg) = core::get_reserves();
        assert!(final_slip + final_peg > 0, 8);
        
        // Price still positive
        let final_price = core::get_price();
        assert!(final_price > 0, 9);
    }

    // ============= TEST 3: TIME-BASED CONVERGENCE =============
    // Verify K_real grows correctly with no trading activity
    
    #[test(aptos_framework = @0x1, admin = @algotoken, user = @0x700)]
    fun test_k_real_convergence_no_trading(
        aptos_framework: &signer,
        admin: &signer,
        user: &signer,
    ) {
        setup_test(aptos_framework, admin);
        
        // Initial buy to establish position
        setup_user_with_usdc(aptos_framework, user, 5000000000);
        core::buy<aptos_coin::AptosCoin>(user, 5000000000, 0);
        
        let (k, k_real_0, k_target) = core::get_k_values();
        let price_0 = core::get_price();
        let (circ_0, _, _) = core::get_supply_info();
        
        // Verify initial state
        assert!(k_real_0 < k, 0); // K_real starts below K
        assert!(price_0 == PRECISION, 1); // Price at 1.0
        
        // No trading, just time passing
        let measurements = vector::empty<u128>();
        let time_points = 10u64;
        let days_per_point = 10u64;
        
        let i = 0;
        while (i < time_points) {
            timestamp::fast_forward_seconds(86400 * days_per_point);
            core::update();
            
            let (_, k_real_current, _) = core::get_k_values();
            vector::push_back(&mut measurements, k_real_current);
            
            i = i + 1;
        };
        
        // Verify K_real grew monotonically
        let j = 1;
        while (j < vector::length(&measurements)) {
            let prev = *vector::borrow(&measurements, j - 1);
            let curr = *vector::borrow(&measurements, j);
            assert!(curr >= prev, 100 + j); // Each measurement >= previous
            j = j + 1;
        };
        
        let k_real_final = *vector::borrow(&measurements, vector::length(&measurements) - 1);
        assert!(k_real_final > k_real_0, 2); // K_real grew significantly
        assert!(k_real_final <= k, 3); // But didn't exceed K
        
        // Price should have grown
        let price_final = core::get_price();
        assert!(price_final > price_0, 4);
        
        // Market cap should have grown
        let (mcap_final, _, _) = core::get_market_caps();
        let mcap_initial = price_0 * circ_0 / PRECISION;
        assert!(mcap_final > mcap_initial, 5);
    }

    // ============= TEST 4: BOND GAINS =============
    // Verify bonds receive correct share of appreciation during convergence
    
    #[test(aptos_framework = @0x1, admin = @algotoken, user = @0x800)]
    fun test_bond_gains_from_convergence(
        aptos_framework: &signer,
        admin: &signer,
        user: &signer,
    ) {
        setup_test(aptos_framework, admin);
        
        // User buys tokens
        setup_user_with_usdc(aptos_framework, user, 10000000000);
        core::buy<aptos_coin::AptosCoin>(user, 5000000000, 0);
        
        let user_addr = signer::address_of(user);
        let initial_tokens = coin::balance<AlgoToken>(user_addr);
        
        // User bonds half their tokens
        core::create_bond(user, initial_tokens / 2);
        
        let user_bonds = core::get_user_bonds(user_addr);
        assert!(vector::length(&user_bonds) == 1, 0);
        
        let bond_id = *vector::borrow(&user_bonds, 0);
        let (bond_owner, bond_principal, _) = core::get_bond_info(bond_id);
        assert!(bond_owner == user_addr, 1);
        
        // Fast forward and update to trigger bond sum updates
        timestamp::fast_forward_seconds(2592000 + 1); // Min bond update time + 1 second
        core::update();
        core::update_bond_sums();
        
        let pending_gains_1 = core::get_bond_pending_gains(bond_id);
        
        // More time for K_real convergence
        timestamp::fast_forward_seconds(86400 * 30); // 30 days
        core::update();
        
        timestamp::fast_forward_seconds(2592000 + 1);
        core::update_bond_sums();
        
        let pending_gains_2 = core::get_bond_pending_gains(bond_id);
        
        // Gains should increase over time as K_real converges
        assert!(pending_gains_2 >= pending_gains_1, 2);
        
        // More time
        timestamp::fast_forward_seconds(86400 * 60); // 60 days
        core::update();
        
        timestamp::fast_forward_seconds(2592000 + 1);
        core::update_bond_sums();
        
        let pending_gains_3 = core::get_bond_pending_gains(bond_id);
        assert!(pending_gains_3 >= pending_gains_2, 3);
        
        // Claim gains
        let token_balance_before_claim = coin::balance<AlgoToken>(user_addr);
        core::claim_bond_gains(user, bond_id);
        let token_balance_after_claim = coin::balance<AlgoToken>(user_addr);
        
        let gains_received = token_balance_after_claim - token_balance_before_claim;
        assert!(gains_received > 0, 4); // Actually received tokens
        
        // Verify bond still exists with same principal
        let (_, bond_principal_after, _) = core::get_bond_info(bond_id);
        assert!(bond_principal_after == bond_principal, 5); // Principal unchanged
    }

    // ============= TEST 5: DRAINAGE MECHANICS =============
    // Verify peg drains to slip over time at correct rate
    
    #[test(aptos_framework = @0x1, admin = @algotoken, user = @0x900)]
    fun test_peg_drainage_over_time(
        aptos_framework: &signer,
        admin: &signer,
        user: &signer,
    ) {
        setup_test(aptos_framework, admin);
        
        // Create large peg pool
        setup_user_with_usdc(aptos_framework, user, 10000000000);
        core::buy<aptos_coin::AptosCoin>(user, 10000000000, 0);
        
        let (slip_0, peg_0) = core::get_reserves();
        assert!(peg_0 > 0, 0); // Peg pool exists
        assert!(slip_0 == 0, 1); // No slip pool initially
        
        let (peg_min_safety, peg_min_drain, _, _) = core::get_peg_info();
        
        // Track drainage over time
        let drainage_measurements = vector::empty<u64>();
        let time_points = 20u64;
        let days_per_point = 5u64;
        
        let i = 0;
        while (i < time_points) {
            timestamp::fast_forward_seconds(86400 * days_per_point);
            core::update();
            
            let (_, peg_current) = core::get_reserves();
            vector::push_back(&mut drainage_measurements, peg_current);
            
            i = i + 1;
        };
        
        // Verify peg decreased over time (drainage occurred)
        let first_measurement = *vector::borrow(&drainage_measurements, 0);
        let last_measurement = *vector::borrow(&drainage_measurements, vector::length(&drainage_measurements) - 1);
        assert!(last_measurement < first_measurement, 2);
        
        // Verify drainage slows down (exponential decay)
        // Calculate drainage rates for first half vs second half
        let mid_point = time_points / 2;
        let mid_peg = *vector::borrow(&drainage_measurements, (mid_point as u64));
        
        let first_half_drainage = first_measurement - mid_peg;
        let second_half_drainage = mid_peg - last_measurement;
        
        // First half should drain more than second half (exponential decay)
        assert!(first_half_drainage >= second_half_drainage, 3);
        
        // Verify slip pool grew as peg drained
        let (slip_final, peg_final) = core::get_reserves();
        assert!(slip_final > slip_0, 4); // Slip pool grew
        assert!(peg_final < peg_0, 5); // Peg pool shrank
        
        // Total reserves approximately conserved (some may have gone to bonds)
        let total_initial = slip_0 + peg_0;
        let total_final = slip_final + peg_final;
        // Allow for some reduction due to bond gains
        assert!(total_final >= total_initial / 2, 6);
        
        // Verify peg doesn't go below minimum
        let peg_final_u128 = (peg_final as u128) * (PRECISION / 100000000);
        assert!(peg_final_u128 >= peg_min_drain || peg_final == 0, 7);
        
        // Verify K_real was affected by drainage (compression)
        let (k, k_real_final, _) = core::get_k_values();
        // K_real should be compressed due to slip pool growth with constant real_mcap
        assert!(k_real_final <= k, 8);
    }

    // ============= BONUS TEST: COMBINED STRESS =============
    // All mechanisms working together
    
    #[test(aptos_framework = @0x1, admin = @algotoken, user1 = @0xA00, user2 = @0xB00, user3 = @0xC00)]
    fun test_combined_stress_all_mechanisms(
        aptos_framework: &signer,
        admin: &signer,
        user1: &signer,
        user2: &signer,
        user3: &signer,
    ) {
        setup_test(aptos_framework, admin);
        
        setup_user_with_usdc(aptos_framework, user1, 20000000000);
        setup_user_with_usdc(aptos_framework, user2, 15000000000);
        setup_user_with_usdc(aptos_framework, user3, 10000000000);
        
        let user1_addr = signer::address_of(user1);
        let user2_addr = signer::address_of(user2);
        
        // Phase 1: Initial market creation
        core::buy<aptos_coin::AptosCoin>(user1, 5000000000, 0);
        core::buy<aptos_coin::AptosCoin>(user2, 3000000000, 0);
        
        // User 1 bonds tokens
        let user1_tokens = coin::balance<AlgoToken>(user1_addr);
        core::create_bond(user1, user1_tokens / 3);
        
        // Phase 2: Time passes - drainage and convergence
        let i = 0;
        while (i < 10) {
            timestamp::fast_forward_seconds(86400 * 3);
            core::update();
            
            if (i % 3 == 0 && i > 0) {
                timestamp::fast_forward_seconds(2592000 + 1);
                core::update_bond_sums();
            };
            
            i = i + 1;
        };
        
        // Phase 3: Bear market
        let user2_tokens = coin::balance<AlgoToken>(user2_addr);
        core::sell<aptos_coin::AptosCoin>(user2, user2_tokens, 0);
        
        // Phase 4: Recovery
        core::buy<aptos_coin::AptosCoin>(user3, 5000000000, 0);
        
        timestamp::fast_forward_seconds(86400 * 30);
        core::update();
        
        // Phase 5: More trading
        core::buy<aptos_coin::AptosCoin>(user2, 4000000000, 0);
        
        user1_tokens = coin::balance<AlgoToken>(user1_addr);
        if (user1_tokens > 10000000) {
            core::sell<aptos_coin::AptosCoin>(user1, user1_tokens / 4, 0);
        };
        
        // Final verification - system still healthy
        let (slip, peg) = core::get_reserves();
        assert!(slip + peg > 0, 0);
        
        let price = core::get_price();
        assert!(price > 0, 1);
        
        let (circ, hyp, _) = core::get_supply_info();
        if (circ > 0) {
            assert!(hyp >= circ, 2);
        };
        
        // Bonds still claimable
        let user1_bonds = core::get_user_bonds(user1_addr);
        if (vector::length(&user1_bonds) > 0) {
            let bond_id = *vector::borrow(&user1_bonds, 0);
            let pending = core::get_bond_pending_gains(bond_id);
            // May or may not have gains, but shouldn't crash
        };
    }
}