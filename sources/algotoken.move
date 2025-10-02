/// AlgoToken - Self-Stabilizing Algorithmic Currency for Aptos
/// 
/// Uses resource account pattern for holding stablecoin reserves

module algotoken::core {
    use std::signer;
    use std::string;
    use std::vector;
    use std::type_info::{Self, TypeInfo};
    use aptos_framework::coin::{Self, BurnCapability, FreezeCapability, MintCapability};
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_std::table::{Self, Table};
    use aptos_std::smart_table::{Self, SmartTable};
    
    const PRECISION: u128 = 1000000000000000000;
    const TOKEN_DECIMALS: u128 = 100000000;
    const USDC_DECIMALS: u128 = 100000000;
    
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_ZERO_AMOUNT: u64 = 4;
    const E_SLIPPAGE_TOO_HIGH: u64 = 5;
    const E_INVALID_BOND: u64 = 6;
    const E_NOT_BOND_OWNER: u64 = 7;
    const E_UPDATE_TOO_FREQUENT: u64 = 8;
    const E_INVALID_PARAMETER: u64 = 9;
    const E_DIVISION_BY_ZERO: u64 = 10;
    const E_WRONG_STABLECOIN_TYPE: u64 = 11;

    /// Resource account signer capability
    struct ResourceAccountCap has key {
        signer_cap: SignerCapability,
    }

    struct AlgoTokenState has key {
        mint_cap: MintCapability<AlgoToken>,
        burn_cap: BurnCapability<AlgoToken>,
        freeze_cap: FreezeCapability<AlgoToken>,
        
        stablecoin_type: TypeInfo,
        resource_account_addr: address,
        
        price: u128,
        ath_price: u128,
        circ_supply: u128,
        hypothetical_supply: u128,
        highest_circ_supply: u128,
        
        real_mcap: u128,
        target_mcap: u128,
        idealized_mcap: u128,
        
        k: u128,
        k_real: u128,
        k_target: u128,
        kx: u128,
        ky: u128,
        
        slip_pool: u64,
        peg_pool: u64,
        
        peg_min_safety: u128,
        peg_min_drain: u128,
        ath_peg_padding: u64,
        peg_target: u64,
        
        demand_score_safety: u128,
        demand_score_drainage: u128,
        
        bear_actual: u64,
        bear_current: u64,
        bear_estimate: u64,
        last_bear_update_time: u64,
        last_update_time: u64,
        
        total_bonds_locked: u128,
        expected_supply_selloff: u128,
        max_expected_supply_selloff: u128,
        bond_gains_accrual: u128,
        next_bond_id: u64,
        bonds: SmartTable<u64, Bond>,
        user_bonds: Table<address, vector<u64>>,
        
        min_time_between_bond_updates: u64,
        last_bond_sum_update: u64,
    }

    struct Bond has store, drop {
        owner: address,
        principal: u128,
        last_update_index: u64,
        created_at: u64,
    }

    struct BondSums has key {
        total_sum: vector<u128>,
        payout_sum: vector<u128>,
        timestamps: vector<u64>,
        current_index: u64,
    }

    struct AlgoToken {}

    #[event]
    struct BuyEvent has drop, store {
        user: address,
        usdc_amount: u64,
        tokens_minted: u128,
        new_price: u128,
        timestamp: u64,
    }

    #[event]
    struct SellEvent has drop, store {
        user: address,
        tokens_burned: u128,
        usdc_received: u64,
        new_price: u128,
        timestamp: u64,
    }

    #[event]
    struct BondCreatedEvent has drop, store {
        bond_id: u64,
        owner: address,
        amount: u128,
        timestamp: u64,
    }

    #[event]
    struct BondUpdatedEvent has drop, store {
        bond_id: u64,
        gains_paid: u128,
        timestamp: u64,
    }

    #[event]
    struct SystemUpdateEvent has drop, store {
        new_k_real: u128,
        new_price: u128,
        peg_drained: u64,
        timestamp: u64,
    }

    // ============= Initialization =============

    public entry fun initialize<StableCoin>(
        admin: &signer,
        initial_k: u128,
        initial_bear_seconds: u64,
        initial_peg_padding: u64,
        min_seconds_bond_update: u64,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<AlgoTokenState>(admin_addr), E_ALREADY_INITIALIZED);
        assert!(initial_k >= PRECISION, E_INVALID_PARAMETER);

        // Create resource account for holding reserves
        let (resource_signer, signer_cap) = account::create_resource_account(admin, b"algotoken_reserves");
        let resource_addr = signer::address_of(&resource_signer);
        
        // Register resource account for stablecoin
        coin::register<StableCoin>(&resource_signer);
        
        // Store signer capability
        move_to(admin, ResourceAccountCap {
            signer_cap,
        });

        // Initialize AlgoToken
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<AlgoToken>(
            admin,
            string::utf8(b"AlgoToken"),
            string::utf8(b"ALGO"),
            8,
            false, // monitor_supply = false to avoid FA complications in tests
        );

        let initial_price = PRECISION;
        let expected_selloff = mul_div(PRECISION, PRECISION, mul(initial_k, initial_k));
        
        move_to(admin, AlgoTokenState {
            mint_cap,
            burn_cap,
            freeze_cap,
            stablecoin_type: type_info::type_of<StableCoin>(),
            resource_account_addr: resource_addr,
            price: initial_price,
            ath_price: initial_price,
            circ_supply: 0,
            hypothetical_supply: 0,
            highest_circ_supply: 0,
            real_mcap: 0,
            target_mcap: 0,
            idealized_mcap: 0,
            k: initial_k,
            k_real: PRECISION,
            k_target: initial_k,
            kx: initial_k,
            ky: initial_k,
            slip_pool: 0,
            peg_pool: 0,
            peg_min_safety: 0,
            peg_min_drain: 0,
            ath_peg_padding: initial_peg_padding,
            peg_target: initial_peg_padding,
            demand_score_safety: 0,
            demand_score_drainage: 0,
            bear_actual: initial_bear_seconds,
            bear_current: 0,
            bear_estimate: initial_bear_seconds,
            last_bear_update_time: timestamp::now_seconds(),
            last_update_time: timestamp::now_seconds(),
            total_bonds_locked: 0,
            expected_supply_selloff: expected_selloff,
            max_expected_supply_selloff: expected_selloff,
            bond_gains_accrual: 0,
            next_bond_id: 0,
            bonds: smart_table::new(),
            user_bonds: table::new(),
            min_time_between_bond_updates: min_seconds_bond_update,
            last_bond_sum_update: 0,
        });

        move_to(admin, BondSums {
            total_sum: vector[0],
            payout_sum: vector[],
            timestamps: vector[timestamp::now_seconds()],
            current_index: 0,
        });
    }

    // ============= Trading Functions =============

    public entry fun buy<StableCoin>(
        user: &signer,
        usdc_amount: u64,
        min_tokens_out: u64,
    ) acquires AlgoTokenState {
        assert!(usdc_amount > 0, E_ZERO_AMOUNT);
        let user_addr = signer::address_of(user);
        
        let state = borrow_global_mut<AlgoTokenState>(@algotoken);
        
        assert!(
            type_info::type_of<StableCoin>() == state.stablecoin_type,
            E_WRONG_STABLECOIN_TYPE
        );
        
        // Transfer stablecoin to resource account
        coin::transfer<StableCoin>(user, state.resource_account_addr, usdc_amount);
        
        let usd_remaining = usdc_amount;
        let tokens_to_mint: u128 = 0;
        let usd_remaining_u128 = usdc_to_internal(usd_remaining);
        
        // Slip pool trading
        if (state.price < state.ath_price) {
            let slip_to_ath = calculate_slip_to_reach_ath(state);
            let slip_u128 = usdc_to_internal(state.slip_pool);
            
            if (usd_remaining_u128 < slip_to_ath - slip_u128) {
                let new_slip = slip_u128 + usd_remaining_u128;
                let new_hyp_supply = bancor_buy_formula(
                    state.hypothetical_supply,
                    slip_u128,
                    new_slip,
                    state.k
                );
                
                tokens_to_mint = new_hyp_supply - state.hypothetical_supply;
                state.slip_pool = state.slip_pool + usd_remaining;
                state.price = mul_div(mul(state.k, new_slip), PRECISION, new_hyp_supply);
                usd_remaining = 0;
                state.circ_supply = state.circ_supply + tokens_to_mint;
                state.hypothetical_supply = new_hyp_supply;
                
                // Update K_real after price increase
                update_market_caps(state);
                if (state.slip_pool > 0) {
                    let peg_u128 = usdc_to_internal(state.peg_pool);
                    if (state.real_mcap > peg_u128) {
                        state.k_real = mul_div(state.real_mcap - peg_u128, PRECISION, new_slip);
                    };
                };
            } else {
                let usd_to_ath = slip_to_ath - slip_u128;
                let new_hyp_supply = bancor_buy_formula(
                    state.hypothetical_supply,
                    slip_u128,
                    slip_to_ath,
                    state.k
                );
                
                tokens_to_mint = new_hyp_supply - state.hypothetical_supply;
                state.slip_pool = internal_to_usdc(slip_to_ath);
                state.price = state.ath_price;
                usd_remaining = usd_remaining - internal_to_usdc(usd_to_ath);
                state.circ_supply = state.circ_supply + tokens_to_mint;
                state.hypothetical_supply = new_hyp_supply;
                
                // Update K_real after reaching ATH
                update_market_caps(state);
                let peg_u128 = usdc_to_internal(state.peg_pool);
                if (state.real_mcap > peg_u128 && slip_to_ath > 0) {
                    state.k_real = mul_div(state.real_mcap - peg_u128, PRECISION, slip_to_ath);
                };
            }
        };
        
        // Peg pool trading
        if (state.price >= state.ath_price && usd_remaining > 0) {
            state.peg_pool = state.peg_pool + usd_remaining;
            
            let peg_u128 = usdc_to_internal(state.peg_pool);
            if (peg_u128 > state.peg_min_safety) {
                let new_padding = peg_u128 - state.peg_min_safety;
                if (new_padding > usdc_to_internal(state.ath_peg_padding)) {
                    state.ath_peg_padding = internal_to_usdc(new_padding);
                }
            };
            
            let tokens_at_ath = mul_div(usdc_to_internal(usd_remaining), PRECISION, state.price);
            tokens_to_mint = tokens_to_mint + tokens_at_ath;
            state.circ_supply = state.circ_supply + tokens_at_ath;
            state.hypothetical_supply = state.hypothetical_supply + tokens_at_ath;
            
            let new_peg_target = state.ath_peg_padding + internal_to_usdc(state.peg_min_safety);
            if (new_peg_target > state.peg_target) {
                end_bear_market(state);
                state.peg_target = new_peg_target;
            };
        };
        
        if (state.circ_supply > state.highest_circ_supply) {
            state.highest_circ_supply = state.circ_supply;
        };
        
        update_market_caps(state);
        update_k_target(state);
        calculate_peg_requirements(state);
        
        // FIX #1: Convert min_tokens_out to internal format before comparison
        let min_tokens_internal = token_to_internal(min_tokens_out);
        assert!(tokens_to_mint >= min_tokens_internal, E_SLIPPAGE_TOO_HIGH);
        
        let tokens_to_mint_u64 = internal_to_token(tokens_to_mint);
        let minted = coin::mint<AlgoToken>(tokens_to_mint_u64, &state.mint_cap);
        coin::deposit(user_addr, minted);
        
        event::emit(BuyEvent {
            user: user_addr,
            usdc_amount,
            tokens_minted: tokens_to_mint,
            new_price: state.price,
            timestamp: timestamp::now_seconds(),
        });
    }

    public entry fun sell<StableCoin>(
        user: &signer,
        token_amount: u64,
        min_usdc_out: u64,
    ) acquires AlgoTokenState, ResourceAccountCap {
        assert!(token_amount > 0, E_ZERO_AMOUNT);
        let user_addr = signer::address_of(user);
        
        let state = borrow_global_mut<AlgoTokenState>(@algotoken);
        
        assert!(
            type_info::type_of<StableCoin>() == state.stablecoin_type,
            E_WRONG_STABLECOIN_TYPE
        );
        
        let tokens_to_sell = token_to_internal(token_amount);
        let usdc_to_send: u64 = 0;
        let tokens_sold: u128 = 0;
        
        // Peg pool trading first (zero slippage at ATH)
        if (state.price >= state.ath_price && state.peg_pool > 0) {
            let usdc_value = mul_div(tokens_to_sell, state.price, PRECISION);
            
            if (usdc_value >= usdc_to_internal(state.peg_pool)) {
                // Peg would be completely depleted
                let has_slip_backup = state.slip_pool > 0;
                
                if (!has_slip_backup) {
                    // No slip pool - ALWAYS keep reserves for recovery
                    // Calculate 5% reserve, but ensure at least 1 unit
                    let reserve_to_keep = if (state.peg_pool >= 20) {
                        state.peg_pool / 20  // 5%
                    } else {
                        1  // Minimum 1 unit even for tiny pools
                    };
                    
                    usdc_to_send = state.peg_pool - reserve_to_keep;
                    tokens_sold = mul_div(usdc_to_internal(usdc_to_send), PRECISION, state.price);
                    
                    // ALWAYS create slip pool
                    state.slip_pool = state.slip_pool + reserve_to_keep;
                    state.peg_pool = 0;
                    
                    state.circ_supply = state.circ_supply - tokens_sold;
                    state.hypothetical_supply = state.hypothetical_supply - tokens_sold;
                    
                    // Update price to slip context
                    if (state.hypothetical_supply > 0) {
                        let slip_u128 = usdc_to_internal(state.slip_pool);
                        state.price = mul_div(mul(state.k, slip_u128), PRECISION, state.hypothetical_supply);
                    };
                    
                    // DON'T sell remainder - we've hit the reserve lock
                    // The user can't sell more than what the peg pool could cover
                    // This ensures slip pool remains as reserve
                } else {
                    // Has slip backup - can safely deplete peg
                    usdc_to_send = state.peg_pool;
                    tokens_sold = mul_div(usdc_to_internal(state.peg_pool), PRECISION, state.price);
                    state.peg_pool = 0;
                    
                    state.circ_supply = state.circ_supply - tokens_sold;
                    state.hypothetical_supply = state.hypothetical_supply - tokens_sold;
                    
                    // Continue in slip if needed
                    let remaining = tokens_to_sell - tokens_sold;
                    if (remaining > 0 && state.slip_pool > 0) {
                        // Update price first
                        if (state.hypothetical_supply > 0) {
                            let slip_u128 = usdc_to_internal(state.slip_pool);
                            state.price = mul_div(mul(state.k, slip_u128), PRECISION, state.hypothetical_supply);
                        };
                        
                        let (slip_usdc, slip_tokens_out) = sell_to_slip_pool(state, remaining);
                        usdc_to_send = usdc_to_send + slip_usdc;
                        tokens_sold = tokens_sold + slip_tokens_out;
                    };
                };
            } else {
                // Partial peg sale - fully lossless
                usdc_to_send = internal_to_usdc(usdc_value);
                state.peg_pool = state.peg_pool - usdc_to_send;
                tokens_sold = tokens_to_sell;
                
                state.circ_supply = state.circ_supply - tokens_sold;
                state.hypothetical_supply = state.hypothetical_supply - tokens_sold;
            };
        } else if (state.slip_pool > 0) {
            // Slip pool trading (with slippage)
            let (slip_usdc, slip_tokens_out) = sell_to_slip_pool(state, tokens_to_sell);
            usdc_to_send = slip_usdc;
            tokens_sold = slip_tokens_out;
        };
        
        assert!(usdc_to_send >= min_usdc_out, E_SLIPPAGE_TOO_HIGH);
        
        update_market_caps(state);
        update_k_target(state);
        calculate_peg_requirements(state);
        
        // Burn tokens
        let to_burn = coin::withdraw<AlgoToken>(user, token_amount);
        coin::burn(to_burn, &state.burn_cap);
        
        // Transfer USDC
        let resource_cap = borrow_global<ResourceAccountCap>(@algotoken);
        let resource_signer = account::create_signer_with_capability(&resource_cap.signer_cap);
        coin::transfer<StableCoin>(&resource_signer, user_addr, usdc_to_send);
        
        event::emit(SellEvent {
            user: user_addr,
            tokens_burned: token_to_internal(token_amount),
            usdc_received: usdc_to_send,
            new_price: state.price,
            timestamp: timestamp::now_seconds(),
        });
    }
    
    fun sell_to_slip_pool(state: &mut AlgoTokenState, tokens_to_sell: u128): (u64, u128) {
        if (state.slip_pool == 0) {
            return (0, 0)
        };
        
        // Maintain critical invariant: hypothetical >= circulating
        // Use smaller minimum to allow selling more tokens
        let min_supply = PRECISION / 1000; // 0.1% of one token (was 1%)
        
        let max_from_circ = if (state.circ_supply > min_supply) {
            state.circ_supply - min_supply
        } else {
            0
        };
        
        let max_from_hyp = if (state.hypothetical_supply > min_supply) {
            state.hypothetical_supply - min_supply  
        } else {
            0
        };
        
        // Must respect both constraints
        let max_sellable = if (max_from_circ < max_from_hyp) {
            max_from_circ
        } else {
            max_from_hyp
        };
        
        let tokens_sold = if (tokens_to_sell <= max_sellable) {
            tokens_to_sell
        } else {
            max_sellable
        };
        
        if (tokens_sold == 0) {
            return (0, 0)
        };
        
        let new_hyp_supply = state.hypothetical_supply - tokens_sold;
        let new_circ_supply = state.circ_supply - tokens_sold;
        
        let slip_u128 = usdc_to_internal(state.slip_pool);
        let new_slip = bancor_sell_formula(
            state.hypothetical_supply,
            new_hyp_supply,
            slip_u128,
            state.k
        );
        
        // Keep minimum slip pool reserve (absolute minimum, not percentage)
        let min_slip_absolute = 10u128; // Very small absolute minimum
        if (new_slip < min_slip_absolute && slip_u128 > min_slip_absolute * 2) {
            new_slip = min_slip_absolute;
        };
        
        // Validate calculation
        if (new_slip >= slip_u128) {
            return (0, 0) // Invalid result
        };
        
        let usdc_out = slip_u128 - new_slip;
        let usdc_out_u64 = internal_to_usdc(usdc_out);
        
        // Update state
        state.slip_pool = internal_to_usdc(new_slip);
        state.hypothetical_supply = new_hyp_supply;
        state.circ_supply = new_circ_supply;
        
        // Update price
        if (new_hyp_supply > 0 && new_slip > 0) {
            state.price = mul_div(mul(state.k, new_slip), PRECISION, new_hyp_supply);
            
            // Update K_real after price decrease
            state.real_mcap = mul_div(state.price, state.circ_supply, PRECISION);
            let peg_u128 = usdc_to_internal(state.peg_pool);
            if (state.real_mcap > peg_u128) {
                state.k_real = mul_div(state.real_mcap - peg_u128, PRECISION, new_slip);
            };
        };
        
        (usdc_out_u64, tokens_sold)
    }

    // ============= Bond Functions =============

    public entry fun create_bond(
        user: &signer,
        amount: u64,
    ) acquires AlgoTokenState, BondSums {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let user_addr = signer::address_of(user);
        
        let state = borrow_global_mut<AlgoTokenState>(@algotoken);
        
        let coins = coin::withdraw<AlgoToken>(user, amount);
        coin::deposit(@algotoken, coins);
        
        let bond_id = state.next_bond_id;
        let bond_sums = borrow_global<BondSums>(@algotoken);
        
        let bond = Bond {
            owner: user_addr,
            principal: token_to_internal(amount),
            last_update_index: bond_sums.current_index + 1,
            created_at: timestamp::now_seconds(),
        };
        
        smart_table::add(&mut state.bonds, bond_id, bond);
        state.next_bond_id = bond_id + 1;
        
        if (!table::contains(&state.user_bonds, user_addr)) {
            table::add(&mut state.user_bonds, user_addr, vector::empty());
        };
        vector::push_back(table::borrow_mut(&mut state.user_bonds, user_addr), bond_id);
        
        state.total_bonds_locked = state.total_bonds_locked + token_to_internal(amount);
        update_k_target(state);
        
        event::emit(BondCreatedEvent {
            bond_id,
            owner: user_addr,
            amount: token_to_internal(amount),
            timestamp: timestamp::now_seconds(),
        });
    }

    public entry fun claim_bond_gains(
        user: &signer,
        bond_id: u64,
    ) acquires AlgoTokenState, BondSums {
        let user_addr = signer::address_of(user);
        let payout = calculate_bond_payout(bond_id);
        let state = borrow_global_mut<AlgoTokenState>(@algotoken);
        
        assert!(smart_table::contains(&state.bonds, bond_id), E_INVALID_BOND);
        let bond = smart_table::borrow(&state.bonds, bond_id);
        assert!(bond.owner == user_addr, E_NOT_BOND_OWNER);    
        
        if (payout > 0) {
            let bond_mut = smart_table::borrow_mut(&mut state.bonds, bond_id);
            let bond_sums = borrow_global<BondSums>(@algotoken);
            bond_mut.last_update_index = bond_sums.current_index;
            
            let payout_u64 = internal_to_token(payout);
            let gains = coin::mint<AlgoToken>(payout_u64, &state.mint_cap);
            coin::deposit(user_addr, gains);
            
            event::emit(BondUpdatedEvent {
                bond_id,
                gains_paid: payout,
                timestamp: timestamp::now_seconds(),
            });
        };
    }

    // ============= System Functions =============

    public entry fun update() acquires AlgoTokenState {
        let state = borrow_global_mut<AlgoTokenState>(@algotoken);
        let current_time = timestamp::now_seconds();
        let time_elapsed = current_time - state.last_update_time;
        
        if (time_elapsed == 0) return;
        
        // Only update if there's circulating supply
        if (state.circ_supply > 0) {
            // Step 1: Drain peg to slip (this compresses K_real)
            if (state.peg_pool > internal_to_usdc(state.peg_min_safety)) {
                drain_peg_to_slip(state, time_elapsed);
            };
            
            // Step 2: Update K_target based on bonds
            update_k_target(state);
            
            // Step 3: Grow K toward K_target (this changes K)
            grow_k_toward_target(state, time_elapsed);
            
            // Step 4: Recalculate K_real based on new K and current reserves
            // This matches Solidity's update_target_Mcap_K_real_and_K()
            if (state.slip_pool > 0) {
                let slip_u128 = usdc_to_internal(state.slip_pool);
                let peg_u128 = usdc_to_internal(state.peg_pool);
                
                if (state.real_mcap > peg_u128) {
                    state.k_real = mul_div(state.real_mcap - peg_u128, PRECISION, slip_u128);
                };
                
                // Update target_Mcap
                state.target_mcap = mul(state.k, slip_u128) + peg_u128;
            };
            
            // Step 5: Grow K_real toward K through convergence
            converge_k_real(state, time_elapsed);
            
            // Step 6: Update bear market tracking
            update_bear_tracking(state, time_elapsed);
            
            // Step 7: Recalculate peg requirements
            calculate_peg_requirements(state);
        };
        
        state.last_update_time = current_time;
        
        event::emit(SystemUpdateEvent {
            new_k_real: state.k_real,
            new_price: state.price,
            peg_drained: 0,
            timestamp: current_time,
        });
    }

    public entry fun update_bond_sums() acquires AlgoTokenState, BondSums {
        let state = borrow_global_mut<AlgoTokenState>(@algotoken);
        let current_time = timestamp::now_seconds();
        
        assert!(
            current_time >= state.last_bond_sum_update + state.min_time_between_bond_updates,
            E_UPDATE_TOO_FREQUENT
        );
        
        let bond_sums = borrow_global_mut<BondSums>(@algotoken);
        
        if (state.bond_gains_accrual > 0 && state.total_bonds_locked > 0) {
            let current_idx = bond_sums.current_index;
            let current_sum = *vector::borrow(&bond_sums.total_sum, (current_idx as u64));
            
            vector::push_back(&mut bond_sums.total_sum, current_sum + state.total_bonds_locked);
            vector::push_back(&mut bond_sums.payout_sum, state.bond_gains_accrual);
            vector::push_back(&mut bond_sums.timestamps, current_time);
            
            bond_sums.current_index = current_idx + 1;
            state.bond_gains_accrual = 0;
        } else {
            let current_sum = *vector::borrow(&bond_sums.total_sum, (bond_sums.current_index as u64));
            vector::push_back(&mut bond_sums.total_sum, current_sum);
            vector::push_back(&mut bond_sums.payout_sum, 0);
            vector::push_back(&mut bond_sums.timestamps, current_time);
            bond_sums.current_index = bond_sums.current_index + 1;
        };
        
        state.last_bond_sum_update = current_time;
    }

    // ============= Core Mechanisms =============

    // This creates algorithmic price appreciation independent of trading
    fun converge_k_real(state: &mut AlgoTokenState, time_elapsed: u64) {
        if (state.k_real >= state.k) {
            return // Already at target, no convergence needed
        };
        
        assert!(state.bear_actual > 0, E_DIVISION_BY_ZERO);
        assert!(state.circ_supply > 0, E_DIVISION_BY_ZERO);
        
        // Formula: K_real = K - (K - K_real_0) × e^(-t / bear_actual)
        let time_factor = mul_div((time_elapsed as u128), PRECISION, (state.bear_actual as u128));
        let decay = exp_approx(time_factor);
        let diff = state.k - state.k_real;
        let new_k_real = state.k - mul_div(diff, PRECISION, decay);
        
        // K_real can only increase through convergence, never decrease
        if (new_k_real > state.k_real) {
            let slip_u128 = usdc_to_internal(state.slip_pool);
            let peg_u128 = usdc_to_internal(state.peg_pool);
            let prev_mcap = state.real_mcap;
            
            state.k_real = new_k_real;
            state.real_mcap = mul(state.k_real, slip_u128) + peg_u128;
            
            // Distribute market cap gains between price and bonds
            if (state.real_mcap > prev_mcap && state.total_bonds_locked > 0) {
                let mcap_gain = state.real_mcap - prev_mcap;
                assert!(state.highest_circ_supply > 0, E_DIVISION_BY_ZERO);
                let bond_ratio = mul_div(state.total_bonds_locked, PRECISION, state.highest_circ_supply);
                let mcap_to_mint = mul_div(mul(mcap_gain, bond_ratio), PRECISION / 2, PRECISION);
                
                assert!(state.price > 0, E_DIVISION_BY_ZERO);
                let tokens_to_mint = mul_div(mcap_to_mint, PRECISION, state.price);
                
                // CRITICAL FIX: Maintain invariant by increasing BOTH supplies
                state.circ_supply = state.circ_supply + tokens_to_mint;
                state.hypothetical_supply = state.hypothetical_supply + tokens_to_mint; // FIX: Was missing!
                state.highest_circ_supply = state.highest_circ_supply + tokens_to_mint;
                state.bond_gains_accrual = state.bond_gains_accrual + tokens_to_mint;
            };
            
            // Update price from new market cap
            assert!(state.circ_supply > 0, E_DIVISION_BY_ZERO);
            state.price = mul_div(state.real_mcap, PRECISION, state.circ_supply);
            if (state.price > state.ath_price) {
                state.ath_price = state.price;
            };
        };
    }

    fun grow_k_toward_target(state: &mut AlgoTokenState, time_elapsed: u64) {
        if (state.k == state.k_target) {
            return // Already at target
        };
        
        assert!(state.bear_actual > 0, E_DIVISION_BY_ZERO);
        
        // Time constant scales with the size of the change
        let k_ratio = if (state.k_target > state.k) {
            mul_div(state.k_target, PRECISION, state.k)
        } else {
            mul_div(state.k, PRECISION, state.k_target)
        };
        
        let time_constant = mul_div((state.bear_actual as u128), k_ratio, PRECISION);
        let time_factor = mul_div((time_elapsed as u128), PRECISION, time_constant);
        let decay = exp_approx(time_factor);
        
        let diff = if (state.k_target > state.k) {
            state.k_target - state.k
        } else {
            state.k - state.k_target
        };
        
        let adjustment = diff - mul_div(diff, PRECISION, decay);
        
        if (state.k_target > state.k) {
            state.k = state.k + adjustment;
            if (state.k > state.k_target) {
                state.k = state.k_target; // Cap at target
            };
        } else {
            state.k = state.k - adjustment;
            if (state.k < state.k_target) {
                state.k = state.k_target; // Cap at target
            };
        };
    }

    fun drain_peg_to_slip(state: &mut AlgoTokenState, time_elapsed: u64) {
        let peg_u128 = usdc_to_internal(state.peg_pool);
        if (peg_u128 <= state.peg_min_drain) {
            return // Already at minimum
        };
        
        assert!(state.bear_estimate > 0, E_DIVISION_BY_ZERO);
        let step_size = mul_div((time_elapsed as u128), PRECISION, (state.bear_estimate as u128));
        
        // Calculate demand-weighted modification
        assert!(peg_u128 > 0, E_DIVISION_BY_ZERO);
        let w = PRECISION - mul_div(
            state.demand_score_drainage,
            mul_div(state.peg_min_drain, PRECISION, peg_u128),
            PRECISION
        );
        
        // Apply exponential decay
        let decay_factor = exp_approx(mul_div(step_size, PRECISION, w));
        let new_peg = state.peg_min_drain + mul_div(
            peg_u128 - state.peg_min_drain,
            PRECISION,
            decay_factor
        );
        
        // Transfer drained amount from peg to slip
        if (new_peg < peg_u128) {
            let drained = peg_u128 - new_peg;
            state.peg_pool = internal_to_usdc(new_peg);
            state.slip_pool = state.slip_pool + internal_to_usdc(drained);
            
            
            // As slip grows with constant real_mcap, K_real decreases
            // This is the "coiled spring" effect
            let slip_u128 = usdc_to_internal(state.slip_pool);
            if (slip_u128 > 0 && state.real_mcap > new_peg) {
                state.k_real = mul_div(state.real_mcap - new_peg, PRECISION, slip_u128);
            };
        };
    }

    // time-based convergence
    fun update_bear_tracking(state: &mut AlgoTokenState, time_elapsed: u64) {
        let peg_u128 = usdc_to_internal(state.peg_pool);
        let peg_target_u128 = usdc_to_internal(state.peg_target);
        
        if (peg_u128 < peg_target_u128) {
            // In bear market
            state.bear_current = state.bear_current + time_elapsed;
            if (state.bear_current >= state.bear_estimate) {
                state.bear_estimate = state.bear_current;
                if (state.bear_current >= state.bear_actual) {
                    state.bear_actual = state.bear_current;
                };
            };
        };
    }

    fun update_k_target(state: &mut AlgoTokenState) {
        if (state.highest_circ_supply == 0) {
            return // Can't calculate without supply
        };
        
        state.expected_supply_selloff = PRECISION - mul_div(
            state.total_bonds_locked,
            PRECISION,
            state.highest_circ_supply
        );
        
        let k_implied = mul_div(PRECISION, PRECISION, mul(state.k, state.k));
        if (state.expected_supply_selloff > k_implied) {
            state.expected_supply_selloff = k_implied;
        };
        
        let actual_selloff = PRECISION - mul_div(state.circ_supply, PRECISION, state.highest_circ_supply);
        if (actual_selloff > state.expected_supply_selloff) {
            state.expected_supply_selloff = actual_selloff;
        };
        
        if (state.expected_supply_selloff > state.max_expected_supply_selloff) {
            state.expected_supply_selloff = state.max_expected_supply_selloff;
        };
        
        assert!(state.expected_supply_selloff > 0, E_DIVISION_BY_ZERO);
        state.k_target = sqrt(mul_div(PRECISION, PRECISION, state.expected_supply_selloff));
        state.idealized_mcap = mul(state.k_target, usdc_to_internal(state.slip_pool)) + 
                               usdc_to_internal(state.peg_pool);
    }

    fun calculate_peg_requirements(state: &mut AlgoTokenState) {
        state.kx = max(state.k_real, state.k_target);
        state.ky = min(state.k, state.k_target);
        
        let slip_u128 = usdc_to_internal(state.slip_pool);
        let reserve = usdc_to_internal(state.slip_pool + state.peg_pool);
        
        let ky_squared = mul(state.ky, state.ky);
        if (ky_squared > PRECISION && slip_u128 > 0) {
            state.peg_min_safety = mul_div(mul(state.kx, slip_u128), PRECISION, ky_squared - PRECISION);
        } else {
            state.peg_min_safety = 0;
        };
        
        let denominator = ky_squared + state.kx - PRECISION;
        if (denominator > 0 && reserve > 0) {
            state.peg_min_drain = mul_div(mul(state.kx, reserve), PRECISION, denominator);
        } else {
            state.peg_min_drain = 0;
        };
        
        let peg_u128 = usdc_to_internal(state.peg_pool);
        if (peg_u128 > state.peg_min_drain) {
            let target_u128 = usdc_to_internal(state.peg_target);
            if (target_u128 > state.peg_min_drain) {
                state.demand_score_drainage = mul_div(
                    peg_u128 - state.peg_min_drain,
                    PRECISION,
                    target_u128 - state.peg_min_drain
                );
            } else {
                state.demand_score_drainage = 0;
            };
        } else {
            state.demand_score_drainage = 0;
        };
    }

    fun update_market_caps(state: &mut AlgoTokenState) {
        let slip_u128 = usdc_to_internal(state.slip_pool);
        let peg_u128 = usdc_to_internal(state.peg_pool);
        
        state.real_mcap = mul(state.price, state.circ_supply);
        state.idealized_mcap = mul(state.k_target, slip_u128) + peg_u128;
        state.target_mcap = mul(state.price, state.hypothetical_supply);
        
        if (slip_u128 > 0 && state.real_mcap > peg_u128) {
            state.k_real = mul_div(state.real_mcap - peg_u128, PRECISION, slip_u128);
        };
    }

    fun end_bear_market(state: &mut AlgoTokenState) {
        let current_time = timestamp::now_seconds();
        let time_elapsed = current_time - state.last_bear_update_time;
        state.bear_current = state.bear_current + time_elapsed;
        
        if (state.bear_current >= state.bear_estimate) {
            state.bear_actual = state.bear_current;
            state.bear_estimate = state.bear_current;
        };
        
        state.bear_current = 0;
        state.highest_circ_supply = state.circ_supply;
        state.last_bear_update_time = current_time;
    }

    fun calculate_bond_payout(bond_id: u64): u128 acquires AlgoTokenState, BondSums {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        let bond = smart_table::borrow(&state.bonds, bond_id);
        let bond_sums = borrow_global<BondSums>(@algotoken);
        
        let payout: u128 = 0;
        let update_count = bond.last_update_index;
        let current_idx = bond_sums.current_index;
        
        if (update_count < current_idx) {
            let i = update_count + 1;
            while (i <= current_idx) {
                let payout_sum = *vector::borrow(&bond_sums.payout_sum, ((i - 1) as u64));
                let total_sum = *vector::borrow(&bond_sums.total_sum, ((i - 1) as u64));
                
                if (total_sum > 0) {
                    let share = mul_div(payout_sum, bond.principal, total_sum);
                    payout = payout + share;
                };
                i = i + 1;
            };
        };
        
        payout
    }

    // ============= Helper Functions =============

    fun usdc_to_internal(usdc: u64): u128 {
        (usdc as u128) * (PRECISION / USDC_DECIMALS)
    }

    fun internal_to_usdc(internal: u128): u64 {
        ((internal * USDC_DECIMALS) / PRECISION as u64)
    }

    fun token_to_internal(tokens: u64): u128 {
        (tokens as u128) * (PRECISION / TOKEN_DECIMALS)
    }

    fun internal_to_token(internal: u128): u64 {
        ((internal * TOKEN_DECIMALS) / PRECISION as u64)
    }

    fun bancor_buy_formula(old_supply: u128, old_reserve: u128, new_reserve: u128, k: u128): u128 {
        assert!(old_reserve > 0, E_DIVISION_BY_ZERO);
        assert!(k > 0, E_DIVISION_BY_ZERO);
        let ratio = mul_div(new_reserve, PRECISION, old_reserve);
        let exponent = mul_div(PRECISION, PRECISION, k);
        let multiplier = pow(ratio, exponent);
        mul_div(old_supply, multiplier, PRECISION)
    }

    fun bancor_sell_formula(old_supply: u128, new_supply: u128, old_reserve: u128, k: u128): u128 {
        assert!(old_supply > 0, E_DIVISION_BY_ZERO);
        let ratio = mul_div(new_supply, PRECISION, old_supply);
        let multiplier = pow(ratio, k);
        mul_div(old_reserve, multiplier, PRECISION)
    }

    fun calculate_slip_to_reach_ath(state: &AlgoTokenState): u128 {
        if (state.ath_price <= state.price) {
            return usdc_to_internal(state.slip_pool)
        };
        assert!(state.price > 0, E_DIVISION_BY_ZERO);
        assert!(state.k > PRECISION, E_DIVISION_BY_ZERO);
        let price_ratio = mul_div(state.ath_price, PRECISION, state.price);
        let k_term = mul_div(state.k, PRECISION, state.k - PRECISION);
        let reserve = usdc_to_internal(state.slip_pool + state.peg_pool);
        mul_div(reserve, pow(price_ratio, k_term), PRECISION)
    }

    // ============= Math Utilities =============

    fun mul(a: u128, b: u128): u128 {
        mul_div(a, b, PRECISION)
    }

    fun mul_div(a: u128, b: u128, c: u128): u128 {
        assert!(c > 0, E_DIVISION_BY_ZERO);
        ((a as u256) * (b as u256) / (c as u256) as u128)
    }

    fun pow(base: u128, exp: u128): u128 {
        if (exp == 0) return PRECISION;
        if (exp == PRECISION) return base;
        
        let result = PRECISION;
        let b = base;
        let e = exp;
        
        while (e > 0) {
            if (e % 2 == 1) {
                result = mul(result, b);
            };
            b = mul(b, b);
            e = e / 2;
        };
        
        result
    }

    fun sqrt(x: u128): u128 {
        if (x == 0) return 0;
        let z = (x + PRECISION) / 2;
        let y = x;
        
        while (z < y) {
            y = z;
            z = (mul_div(x, PRECISION, z) + z) / 2;
        };
        
        y
    }

    fun exp_approx(x: u128): u128 {
        let sum = PRECISION;
        let term = x;
        let i = 2u128;
        
        while (term > 1000 && i < 20) {
            sum = sum + term;
            term = mul_div(term, x, i * PRECISION);
            i = i + 1;
        };
        
        sum
    }

    fun max(a: u128, b: u128): u128 {
        if (a >= b) a else b
    }

    fun min(a: u128, b: u128): u128 {
        if (a <= b) a else b
    }

    // ============= View Functions =============

    #[view]
    public fun get_price(): u128 acquires AlgoTokenState {
        borrow_global<AlgoTokenState>(@algotoken).price
    }

    #[view]
    public fun get_reserves(): (u64, u64) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        (state.slip_pool, state.peg_pool)
    }

    #[view]
    public fun get_k_values(): (u128, u128, u128) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        (state.k, state.k_real, state.k_target)
    }

    #[view]
    public fun get_supply_info(): (u128, u128, u128) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        (state.circ_supply, state.hypothetical_supply, state.highest_circ_supply)
    }

    #[view]
    public fun get_bond_info(bond_id: u64): (address, u128, u64) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        let bond = smart_table::borrow(&state.bonds, bond_id);
        (bond.owner, bond.principal, bond.created_at)
    }

    #[view]
    public fun get_user_bonds(user: address): vector<u64> acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        if (table::contains(&state.user_bonds, user)) {
            *table::borrow(&state.user_bonds, user)
        } else {
            vector::empty()
        }
    }

    #[view]
    public fun get_bond_pending_gains(bond_id: u64): u128 acquires AlgoTokenState, BondSums {
        calculate_bond_payout(bond_id)
    }

    #[view]
    public fun get_market_caps(): (u128, u128, u128) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        (state.real_mcap, state.target_mcap, state.idealized_mcap)
    }

    #[view]
    public fun get_bear_info(): (u64, u64, u64) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        (state.bear_actual, state.bear_current, state.bear_estimate)
    }

    #[view]
    public fun get_peg_info(): (u128, u128, u64, u64) acquires AlgoTokenState {
        let state = borrow_global<AlgoTokenState>(@algotoken);
        (state.peg_min_safety, state.peg_min_drain, state.ath_peg_padding, state.peg_target)
    }

    #[view]
    public fun get_total_bonds_locked(): u128 acquires AlgoTokenState {
        borrow_global<AlgoTokenState>(@algotoken).total_bonds_locked
    }

    #[test_only]
    public fun test_initialize<StableCoin>(admin: &signer) {
        initialize<StableCoin>(admin, 1200000000000000000, 63072000, 10000000000, 2592000);
    }
}