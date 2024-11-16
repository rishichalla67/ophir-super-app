import { getWorkingRPC } from './chainRPCs';
import { treasuryAddresses } from './treasuryAddresses';
import axios from 'axios';
import { StargateClient } from '@cosmjs/stargate';

export async function getAllBalances() {
  const balances = {};

  for (const [chain, addresses] of Object.entries(treasuryAddresses)) {
    balances[chain] = {};
    
    // Handle each chain type differently
    switch(chain) {
      case 'bitcoin':
      case 'ordinals':
        await getBitcoinBalances(chain, addresses, balances);
        break;
      
      case 'thorchain':
        await getThorchainBalances(chain, addresses, balances);
        break;
      
      default:
        // Handle Cosmos-based chains
        if (chain !== 'bitcoin' && chain !== 'ordinals') {
          await getCosmosBalances(chain, addresses, balances);
        }
    }
  }

  return balances;
}

async function getCosmosBalances(chain, addresses, balances) {
  try {
    const rpc = await getWorkingRPC(chain);
    const client = await StargateClient.connect(rpc);

    // Initialize the chain object with a wallets property
    balances[chain] = {
      wallets: {}
    };

    for (const [label, address] of Object.entries(addresses)) {
      try {
        const balance = await client.getAllBalances(address);
        balances[chain].wallets[label] = balance.map(coin => ({
          denom: coin.denom,
          amount: coin.amount,
          humanAmount: (Number(coin.amount) / 1000000).toFixed(6)
        }));
      } catch (error) {
        console.error(`Error fetching balance for ${chain}/${label}:`, error);
        balances[chain].wallets[label] = { error: 'Failed to fetch balance' };
      }
    }
  } catch (error) {
    console.error(`Error connecting to ${chain}:`, error);
    balances[chain] = { error: 'Failed to connect to chain' };
  }
}

async function getBitcoinBalances(chain, addresses, balances) {
  balances[chain] = {
    wallets: {}
  };
  
  for (const [label, address] of Object.entries(addresses)) {
    try {
      const response = await axios.get(`https://blockchain.info/balance?active=${address}`);
      balances[chain].wallets[label] = {
        denom: 'BTC',
        amount: response.data[address].final_balance,
        humanAmount: (response.data[address].final_balance / 100000000).toFixed(8)
      };
    } catch (error) {
      console.error(`Error fetching Bitcoin balance for ${label}:`, error);
      balances[chain].wallets[label] = { error: 'Failed to fetch balance' };
    }
  }
}

async function getThorchainBalances(chain, addresses, balances) {
  balances[chain] = {
    wallets: {}
  };
  
  for (const [label, address] of Object.entries(addresses)) {
    try {
      const response = await axios.get(`https://thornode.ninerealms.com/bank/balances/${address}`);
      balances[chain].wallets[label] = response.data.map(coin => ({
        denom: coin.denom,
        amount: coin.amount,
        humanAmount: (Number(coin.amount) / 100000000).toFixed(8)
      }));
    } catch (error) {
      console.error(`Error fetching THORChain balance for ${label}:`, error);
      balances[chain].wallets[label] = { error: 'Failed to fetch balance' };
    }
  }
} 