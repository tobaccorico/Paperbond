# Self-Stabilizing Bonding Curve for Aptos
Based on research by my friend [Steve](https://www.linkedin.com/in/steven-hochstadt/)

Unlike traditional memecoin platforms (pump.fun, bonk.gg, etc.)  
that use simple linear or exponential bonding curves, AlgoToken    
implements a dual-pool architecture with algorithmic stabilization.  
We integrated these tokenomics into a web clone of Telegram.

Tokens are chat-specific - each group deploys its own economy.  
Access control: holding tokens = membership in the conversation. 

Built-in utility beyond speculation (community access) 
Natural network effects (invite friends = increase token demand)  

Social tokens have failed because they lacked clear utility.
By tying token holding to actual access control, AlgoToken creates:

- Real demand (people want to join interesting communities)
- Natural price discovery (high-value groups = expensive tokens)
- Built-in marketing (members promote to increase their holdings' value)
- Exit liquidity (always someone new wanting to join)

This is the first bonding curve designed for sustained communities rather than quick flips.

### 1. Anti-Rug Mechanism via Bonds

Users can lock tokens to create "bonds" that accrue value over time.  
Locked tokens reduce expected sell pressure, which algorithmically   
increases the price floor. The more tokens locked, the higher   
`K_target` grows, creating upward price pressure independent of buys. 

**This incentivizes long-term holding over pump-and-dump behavior**.

### 2. Bear Market Recovery System

Peg pool (zero-slippage reserve) drains into slip pool during downturns.  
As slip pool grows with constant market cap, K_real compresses like a "coiled spring"  
When buying resumes, this compressed K_real allows for explosive price recovery   
The system tracks "bear market duration" and uses exponential convergence to restore price  

### 3. Adaptive Price Discovery

Price appreciation happens through three mechanisms simultaneously:

- Direct trading (standard bonding curve)
- K convergence (time-based appreciation)
- Bond-driven K_target growth (demand-driven appreciation)

**This creates price floors that persist even when trading stops.** 

### Deployment instructions

`❯ aptos account list --profile testnet`

put the address inside `Move.toml`

`❯ aptos move compile --named-addresses algotoken=YOUR_TESTNET_ADDRESS --skip-fetch-latest-git-deps`

`❯ aptos move test --skip-fetch-latest-git-deps`

`❯ aptos move publish --profile testnet --named-addresses algotoken=YOUR_TESTNET_ADDRESS --skip-fetch-latest-git-deps`

`❯ aptos move run \`  
`  --function-id YOUR_TESTNET_ADDRESS::mock_usdc::initialize \`  
`  --profile testnet`  

in the project root run `npm install`  
then do the same in the `./client` folder  

finally run `npm run build` in the client folder  
then `npm run dev` in the root folder.
(the app uses server-side transaction buildingbu)

