const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");
const fs = require("fs");
const path = require("path");

class AptosService {
  constructor() {
    const config = new AptosConfig({ network: Network.TESTNET });
    this.aptos = new Aptos(config);
    
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    if (fs.existsSync(deploymentPath)) {
      this.deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    } else {
      this.deployment = {
        deployerAddress: process.env.DEPLOYER_ADDRESS || "0x1",
        stablecoinType: process.env.DEPLOYER_ADDRESS 
          ? `${process.env.DEPLOYER_ADDRESS}::mock_usdc::MockUSDC`
          : "0x1::aptos_coin::AptosCoin",
      };
    }

    if (process.env.APTOS_ADMIN_PRIVATE_KEY) {
      const privateKey = new Ed25519PrivateKey(process.env.APTOS_ADMIN_PRIVATE_KEY);
      this.adminAccount = Account.fromPrivateKey({ privateKey });
    }
  }

  async getTokenPrice(moduleAddress) {
    try {
      const [price] = await this.aptos.view({
        payload: {
          function: `${moduleAddress}::core::get_price`,
          typeArguments: [],
          functionArguments: [],
        },
      });
      return price;
    } catch (error) {
      console.error("Error getting token price:", error);
      return null;
    }
  }

  async getReserves(moduleAddress) {
    try {
      const [slip, peg] = await this.aptos.view({
        payload: {
          function: `${moduleAddress}::core::get_reserves`,
          typeArguments: [],
          functionArguments: [],
        },
      });
      return { slip, peg };
    } catch (error) {
      console.error("Error getting reserves:", error);
      return { slip: 0, peg: 0 };
    }
  }

  async getUserTokenBalance(userAddress, moduleAddress) {
    try {
      const resources = await this.aptos.getAccountResources({
        accountAddress: userAddress,
      });
      
      const coinStoreType = `0x1::coin::CoinStore<${moduleAddress}::core::AlgoToken>`;
      const coinStore = resources.find(r => r.type === coinStoreType);
      
      if (coinStore) {
        return coinStore.data.coin.value;
      }
      return "0";
    } catch (error) {
      console.error("Error getting user balance:", error);
      return "0";
    }
  }

  async getUserUSDCBalance(userAddress) {
    try {
      const balance = await this.aptos.getAccountCoinAmount({
        accountAddress: userAddress,
        coinType: this.deployment.stablecoinType,
      });
      return balance.toString();
    } catch (error) {
      return "0";
    }
  }

  async mintMockUSDC(toAddress, amount = 1000_00000000) {
    if (!this.adminAccount) {
      throw new Error("Admin account not configured");
    }

    const txn = await this.aptos.transaction.build.simple({
      sender: this.adminAccount.accountAddress,
      data: {
        function: `${this.deployment.deployerAddress}::mock_usdc::mint`,
        functionArguments: [toAddress, amount],
      },
    });

    const committed = await this.aptos.signAndSubmitTransaction({
      signer: this.adminAccount,
      transaction: txn,
    });

    await this.aptos.waitForTransaction({ transactionHash: committed.hash });
    return committed.hash;
  }
}

module.exports = new AptosService();