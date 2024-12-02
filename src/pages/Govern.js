import React, { useState, useEffect, useCallback } from "react";
import { SigningStargateClient } from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import { daoConfig } from "../utils/daoConfig";
import { tokenMappings } from "../utils/tokenMappings";
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';
import { useCrypto } from '../context/CryptoContext';
import { Tooltip } from '@mui/material';

const Govern = () => {
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const { prices, stats } = useCrypto();
  const [ophirPrice, setOphirPrice] = useState(0);
  const [btcPrice, setBtcPrice] = useState(0);
  const [stakingAPR, setStakingAPR] = useState(0);
  const [stakingAPY, setStakingAPY] = useState(0);
  
  const migalooRPC = "https://migaloo-rpc.polkachu.com/";
  const [isTestnet, setIsTestnet] = useState(false);
  const [contractAddress, setContractAddress] = useState(
    isTestnet 
      ? daoConfig["DAO_STAKING_CONTRACT_ADDRESS_TESTNET"]
      : daoConfig["DAO_STAKING_CONTRACT_ADDRESS"]
  );

  const [ophirBalance, setOphirBalance] = useState(0);
  const [stakedOphirBalance, setStakedOphirBalance] = useState(0);
  const [ophirStakers, setOphirStakers] = useState({});
  const [copied, setCopied] = useState(false);
  const [ophirAmount, setOphirAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rpc, setRPC] = useState(migalooRPC);
  const [isSending, setIsSending] = useState(false);
  const [chainId, setChainId] = useState("migaloo-1");
  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [activeTab, setActiveTab] = useState("stake"); // State for active tab

  const OPHIR_DECIMAL = 1000000;

  const [stakersData, setStakersData] = useState([]);
  const [pendingOphirRewards, setPendingOphirRewards] = useState(0);
  const [pendingBtcRewards, setPendingBtcRewards] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add new state for distributions
  const [distributions, setDistributions] = useState({
    ophir: null,
    btc: null
  });

  // Add new state for undistributed rewards
  const [undistributedRewards, setUndistributedRewards] = useState({
    ophir: 0,
    btc: 0
  });

  // Debounce function to limit how often a function can be called
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  // Optimized checkBalance function with caching
  const balanceCache = new Map();

  const checkBalance = useCallback(
    async (address) => {
      if (balanceCache.has(address)) {
        return balanceCache.get(address);
      }

      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(migalooRPC, signer);

      const balances = await client.getAllBalances(address);
      console.log(balances);

      const ophirBalance = balances.find(
        (balance) => balance.denom === daoConfig["OPHIR_DENOM"]
      );

      const balance = ophirBalance ? parseFloat(ophirBalance.amount) / OPHIR_DECIMAL : 0;
      balanceCache.set(address, balance);
      return balance;
    },
    [migalooRPC]
  );

  useEffect(() => {
    getStakers();
  }, []);

  useEffect(() => {
    if (connectedWalletAddress) {
      debounce(() => {
        checkBalance(connectedWalletAddress).then((balance) => {
          setOphirBalance(balance);
        });
      }, 500)(); // Debounce with a 500ms delay
      getStakedOphirBalance();
    }
  }, [connectedWalletAddress, checkBalance]);

  useEffect(() => {
    // Update contract address when testnet status changes
    setContractAddress(
      isTestnet 
        ? daoConfig["DAO_STAKING_CONTRACT_ADDRESS_TESTNET"]
        : daoConfig["DAO_STAKING_CONTRACT_ADDRESS"]
    );
  }, [isTestnet]);

  useEffect(() => {
    if (!prices || !distributions || !stats || !undistributedRewards) return;
    if (!distributions.ophir || !distributions.btc) return;

    try {
      // Calculate total distributed rewards for both OPHIR and BTC
      const calculateDistributedRewards = (distribution, undistributedRewards) => {
        const fundedAmount = Number(distribution.funded_amount);
        const undistributed = Number(undistributedRewards);
        return (fundedAmount - undistributed) / OPHIR_DECIMAL;
      };

      // Get time elapsed since epoch start (in days)
      const now = Date.now() * 1000000; // Convert to nanoseconds
      const epochStartTime = Number(distributions.ophir.active_epoch.started_at.at_time);
      const timeElapsedDays = (now - epochStartTime) / (1000000 * 86400 * 1000); // Convert to days

      // Calculate daily rate based on actual distributed amounts
      const ophirDistributedDaily = calculateDistributedRewards(distributions.ophir, undistributedRewards.ophir) / timeElapsedDays;
      const btcDistributedDaily = calculateDistributedRewards(distributions.btc, undistributedRewards.btc) / timeElapsedDays;

      // Calculate yearly projections based on current daily rate
      const yearlyOphirValue = ophirDistributedDaily * 365 * prices.ophir;
      const yearlyBtcValue = btcDistributedDaily * 365 * prices.btc;
      const totalYearlyRewardValue = yearlyOphirValue + yearlyBtcValue;

      // Calculate total staked value in USD
      const totalStakedValue = stats.stakedSupply * prices.ophir;

      // Calculate APR
      const calculatedAPR = (totalYearlyRewardValue / totalStakedValue) * 100;
      setStakingAPR(calculatedAPR);

      // Calculate APY (compounded every 2 weeks)
      const periodsPerYear = 26;
      const calculatedAPY = (
        Math.pow(1 + (calculatedAPR / 100 / periodsPerYear), periodsPerYear) - 1
      ) * 100;
      setStakingAPY(calculatedAPY);

    } catch (error) {
      console.error("Error calculating APR/APY:", error);
      setStakingAPR(0);
      setStakingAPY(0);
    }
  }, [prices, distributions, stats, undistributedRewards]);

  useEffect(() => {
    // Add new effect to fetch stakers data
    const fetchStakersData = async () => {
      try {
        const response = await fetch('https://indexer.daodao.zone/migaloo-1/contract/migaloo1kv72vwfhq523yvh0gwyxd4nc7cl5pq32v9jt5w2tn57qtn57g53sghgkuh/daoVotingTokenStaked/topStakers');
        const data = await response.json();
        setStakersData(data);
      } catch (error) {
        console.error('Error fetching stakers data:', error);
      }
    };

    if (activeTab === 'info') {
      fetchStakersData();
    }
  }, [activeTab]);

  const truncateAddress = (address) =>
    `${address.slice(0, 6)}...${address.slice(-6)}`;

  const handleCopy = (address) => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset copied state after 2 seconds
    });
  };

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const getSigner = async () => {
    if (window.keplr?.experimentalSuggestChain) {
      await window.keplr?.experimentalSuggestChain({
        // Chain details
        chainId: "narwhal-2",
        chainName: "Migaloo Testnet",
        rpc: "https://migaloo-testnet-rpc.polkachu.com:443", // Example RPC endpoint, replace with actual
        rest: "https://migaloo-testnet-api.polkachu.com", // Example REST endpoint, replace with actual
        bip44: {
          coinType: 118, // Example coinType, replace with actual
        },
        bech32Config: {
          bech32PrefixAccAddr: "migaloo",
          bech32PrefixAccPub: "migaloopub",
          bech32PrefixValAddr: "migaloovaloper",
          bech32PrefixValPub: "migaloovaloperpub",
          bech32PrefixConsAddr: "migaloovalcons",
          bech32PrefixConsPub: "migaloovalconspub",
        },
        currencies: [
          {
            // Example currency, replace with actual
            coinDenom: "whale",
            coinMinimalDenom: "uwhale",
            coinDecimals: 6,
          },
        ],
        feeCurrencies: [
          {
            // Example fee currency, replace with actual
            coinDenom: "whale",
            coinMinimalDenom: "uwhale",
            coinDecimals: 6,
          },
        ],
        stakeCurrency: {
          // Example stake currency, replace with actual
          coinDenom: "whale",
          coinMinimalDenom: "uwhale",
          coinDecimals: 6,
        },
        gasPriceStep: {
          low: 0.2,
          average: 0.45,
          high: 0.75,
        },
      });

      // After suggesting the chain, prompt the user to add the OPHIR DAO denom to their Keplr wallet
      // await window.keplr.experimentalSuggestToken(chainId, isTestnet ? OPHIR_DENOM_TESNET : OPHIR_DENOM, "OPHIR", "https://raw.githubusercontent.com/cosmos/chain-registry/master/migaloo/images/ophir.png", 6);
    }

    await window.keplr?.enable(chainId);
    const offlineSigner = window.keplr?.getOfflineSigner(chainId);
    return offlineSigner;
  };

  const getStakers = async () => {
    try {
      let stakers = [];
      let limit = 100;
      let startAfter = null;

      const signer = getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      while (true) {
        const message = {
          list_stakers: {
            limit,
            start_after: startAfter,
          },
        };

        // Query the smart contract directly using SigningCosmWasmClient.queryContractSmart
        const queryResponse = await client.queryContractSmart(
          contractAddress,
          message
        );

        stakers = stakers.concat(queryResponse.stakers);

        // If the response contains less than the limit, we have retrieved all stakers
        if (queryResponse.stakers.length < limit) {
          break;
        }

        // Update startAfter with the last staker in the current response
        startAfter =
          queryResponse.stakers[queryResponse.stakers.length - 1].address;
      }

      stakers.sort((a, b) => Number(b.balance) - Number(a.balance));

      console.log(stakers);

      setOphirStakers({ stakers });
    } catch (error) {
      console.error("Error querying contract:", error);
      showAlert(`Error querying contract. ${error.message}`, "error");
    }
  };

  const getStakedOphirBalance = async () => {
    try {
      const message = {
        voting_power_at_height: {
          address: connectedWalletAddress,
        },
      };

      const signer = getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      // Query the smart contract directly using SigningCosmWasmClient.queryContractSmart
      const queryResponse = await client.queryContractSmart(
        contractAddress,
        message
      );

      console.log(queryResponse);
      const power = queryResponse.power;
      const dividedPower = Number(power) / OPHIR_DECIMAL;
      console.log(dividedPower);
      setStakedOphirBalance(dividedPower);
      //   setSimulationResponse(queryResponse);
      // Process the query response as needed
    } catch (error) {
      console.error("Error querying contract:", error);
      showAlert(`Error querying contract. ${error.message}`, "error");
    }
  };

  const executeStakeContractMessage = async () => {
    setIsLoading(true);
    try {
      if (!window.keplr) {
        showAlert("Keplr wallet is not installed.", "error");
        return;
      }
      if (!ophirAmount || ophirAmount <= 0) {
        showAlert("Please enter a valid OPHIR amount.", "error");
        return;
      }

      const message = {
        stake: {},
      };
      const signer = await getSigner();

      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      const funds = [
        {
          denom: daoConfig["OPHIR_DENOM"],
          amount: (Number(ophirAmount) * OPHIR_DECIMAL).toString(),
        },
      ];
      const fee = {
        amount: [{ denom: "uwhale", amount: "7500" }],
        gas: "750000",
      };

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        message,
        fee,
        "Stake OPHIR in DAODAO",
        funds
      );

      console.log(result);
      if (result.transactionHash) {
        const baseTxnUrl = "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Message executed successfully! Transaction Hash: ${result.transactionHash}`,
          "success",
          `<a href="${txnUrl}" target="_blank">Message executed successfully! Transaction Hash: ${result.transactionHash}</a>`
        );
      } else {
        showAlert("Message executed successfully!", "success");
      }
      checkBalance(connectedWalletAddress).then((balance) => {
        setOphirBalance(balance); // Update the balance state when the promise resolves
      });
      getStakedOphirBalance();
    } catch (error) {
      console.error("Error executing contract message:", error);
      showAlert(`Error executing contract message. ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const executeUnstakeContractMessage = async () => {
    setIsLoading(true);
    try {
      if (!window.keplr) {
        showAlert("Keplr wallet is not installed.", "error");
        return;
      }
      if (!ophirAmount || ophirAmount <= 0) {
        showAlert("Please enter a valid OPHIR amount.", "error");
        return;
      }

      const message = {
        unstake: {
          amount: (Number(ophirAmount) * OPHIR_DECIMAL).toString(),
        },
      };
      const signer = await getSigner();

      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      const funds = [];
      const fee = {
        amount: [{ denom: "uwhale", amount: "7500" }],
        gas: "750000",
      };

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        message,
        fee,
        "Unstake OPHIR in DAODAO",
        funds
      );

      console.log(result);
      if (result.transactionHash) {
        const baseTxnUrl = "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Message executed successfully! Transaction Hash: ${result.transactionHash}`,
          "success",
          `<a href="${txnUrl}" target="_blank">Message executed successfully! Transaction Hash: ${result.transactionHash}</a>`
        );
      } else {
        showAlert("Message executed successfully!", "success");
      }
      checkBalance(connectedWalletAddress).then((balance) => {
        setOphirBalance(balance); // Update the balance state when the promise resolves
      });
      getStakedOphirBalance();
    } catch (error) {
      console.error("Error executing contract message:", error);
      showAlert(`Error executing contract message. ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const getPendingRewards = async () => {
    setIsRefreshing(true);
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      console.log(connectedWalletAddress);
      const message = {
        pending_rewards: {
          address: connectedWalletAddress,
        }
      };

      try {
        // Query OPHIR rewards
        const ophirRewardsResponse = await client.queryContractSmart(
          daoConfig.DAO_OPHIR_STAKING_REWARDS_CONTRACT_ADDRESS,
          message
        );
        console.log(ophirRewardsResponse);
        if (ophirRewardsResponse && ophirRewardsResponse.pending_rewards) {
          const ophirReward = ophirRewardsResponse.pending_rewards[0]?.pending_rewards || "0";
          setPendingOphirRewards(Number(ophirReward) / OPHIR_DECIMAL);
        }
      } catch (ophirError) {
        console.error("Error fetching OPHIR rewards:", ophirError);
        setPendingOphirRewards(0);
      }

      try {
        // Query BTC rewards
        const btcRewardsResponse = await client.queryContractSmart(
          daoConfig.DAO_WBTC_STAKING_REWARDS_CONTRACT_ADDRESS,
          message
        );
        
        if (btcRewardsResponse && btcRewardsResponse.pending_rewards) {
          const btcReward = btcRewardsResponse.pending_rewards[0]?.pending_rewards || "0";
          setPendingBtcRewards(Number(btcReward) / OPHIR_DECIMAL);
        }
      } catch (btcError) {
        console.error("Error fetching BTC rewards:", btcError);
        setPendingBtcRewards(0);
      }

    } catch (error) {
      console.error("Error fetching pending rewards:", error);
      showAlert("Error fetching pending rewards", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const claimRewards = async () => {
    setIsLoading(true);
    try {
      if (!window.keplr) {
        showAlert("Keplr wallet is not installed.", "error");
        return;
      }

      const messages = [];
      
      // Only add claim messages for contracts with non-zero pending rewards
      if (pendingOphirRewards > 0) {
        messages.push({
          contractAddress: daoConfig.DAO_OPHIR_STAKING_REWARDS_CONTRACT_ADDRESS,
          message: {
            "claim": {
              "id": 1
            }
          }
        });
      }

      if (pendingBtcRewards > 0) {
        messages.push({
          contractAddress: daoConfig.DAO_WBTC_STAKING_REWARDS_CONTRACT_ADDRESS,
          message: {
            "claim": {
              "id": 1
            }
          }
        });
      }

      if (messages.length === 0) {
        showAlert("No rewards available to claim", "info");
        return;
      }

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const fee = {
        amount: [{ denom: "uwhale", amount: "7500" }],
        gas: (750000 * messages.length).toString(), // Adjust gas based on number of messages
      };

      // Create array of messages for the transaction
      const execMessages = messages.map(({ contractAddress, message }) => ({
        typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
        value: {
          sender: connectedWalletAddress,
          contract: contractAddress,
          msg: Buffer.from(JSON.stringify(message)),
          funds: []
        }
      }));

      const result = await client.signAndBroadcast(
        connectedWalletAddress,
        execMessages,
        fee,
        "Claim OPHIR DAO Rewards"
      );

      if (result.transactionHash) {
        const baseTxnUrl = "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Rewards claimed successfully!`,
          "success",
          `<a href="${txnUrl}" target="_blank">Rewards claimed successfully! Transaction Hash: ${result.transactionHash}</a>`
        );
        // Refresh rewards after claiming
        getPendingRewards();
        getDistributions(); // Refresh distribution data
      }
    } catch (error) {
      console.error("Error claiming rewards:", error);
      showAlert(`Error claiming rewards: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Add effect to fetch rewards when wallet connects or tab changes
  useEffect(() => {
    if (connectedWalletAddress && activeTab === 'rewards') {
      getPendingRewards();
    }
  }, [connectedWalletAddress, activeTab]);

  // Function to fetch distribution data
  const getDistributions = async () => {
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      // Query both reward contracts
      const [ophirDistributions, btcDistributions] = await Promise.all([
        client.queryContractSmart(
          daoConfig.DAO_OPHIR_STAKING_REWARDS_CONTRACT_ADDRESS,
          { distributions: {} }
        ),
        client.queryContractSmart(
          daoConfig.DAO_WBTC_STAKING_REWARDS_CONTRACT_ADDRESS,
          { distributions: {} }
        )
      ]);

      setDistributions({
        ophir: ophirDistributions.distributions[0],
        btc: btcDistributions.distributions[0]
      });
    } catch (error) {
      console.error("Error fetching distributions:", error);
    }
  };

  // Add getDistributions to initial data fetching
  useEffect(() => {
      getDistributions();
  }, []);

  // Add function to fetch undistributed rewards
  const getUndistributedRewards = async () => {
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      const [ophirUndistributed, btcUndistributed] = await Promise.all([
        client.queryContractSmart(
          daoConfig.DAO_OPHIR_STAKING_REWARDS_CONTRACT_ADDRESS,
          { undistributed_rewards: { id: 1 } }
        ),
        client.queryContractSmart(
          daoConfig.DAO_WBTC_STAKING_REWARDS_CONTRACT_ADDRESS,
          { undistributed_rewards: { id: 1 } }
        )
      ]);

      setUndistributedRewards({
        ophir: ophirUndistributed,
        btc: btcUndistributed
      });
    } catch (error) {
      console.error("Error fetching undistributed rewards:", error);
    }
  };

  // Add to initial data fetching
  useEffect(() => {
    getUndistributedRewards();
  }, []);

  const getAPRTooltipContent = () => {
    if (!prices || !distributions || !stats || !undistributedRewards) return "Loading...";
    if (!distributions.ophir || !distributions.btc) return "Loading distribution data...";
    
    try {
      const now = Date.now() * 1000000;
      const epochStartTime = Number(distributions.ophir.active_epoch?.started_at?.at_time);
      if (!epochStartTime) return "Loading epoch data...";

      const timeElapsedDays = (now - epochStartTime) / (1000000 * 86400 * 1000);

      const ophirDistributed = (Number(distributions.ophir.funded_amount || 0) - Number(undistributedRewards.ophir || 0)) / OPHIR_DECIMAL;
      const btcDistributed = (Number(distributions.btc.funded_amount || 0) - Number(undistributedRewards.btc || 0)) / OPHIR_DECIMAL;

      const ophirDailyRate = ophirDistributed / timeElapsedDays;
      const btcDailyRate = btcDistributed / timeElapsedDays;

      return `
APR Calculation:
1. Total Rewards Distributed:
   OPHIR: ${ophirDistributed.toFixed(2)} (${(ophirDistributed * prices.ophir).toFixed(2)} USD)
   BTC: ${btcDistributed.toFixed(8)} (${(btcDistributed * prices.btc).toFixed(2)} USD)
2. Time Period: ${timeElapsedDays.toFixed(2)} days
3. Daily Rate:
   OPHIR: ${ophirDailyRate.toFixed(2)}/day
   BTC: ${btcDailyRate.toFixed(8)}/day
4. Yearly Projection (× 365):
   OPHIR: ${(ophirDailyRate * 365).toFixed(2)} (${(ophirDailyRate * 365 * prices.ophir).toFixed(2)} USD)
   BTC: ${(btcDailyRate * 365).toFixed(8)} (${(btcDailyRate * 365 * prices.btc).toFixed(2)} USD)
5. Total Staked: ${stats.stakedSupply.toFixed(2)} OPHIR
   Value: ${(stats.stakedSupply * prices.ophir).toFixed(2)} USD
APR = (Yearly Projected Rewards Value / Total Staked Value) × 100
      `;
    } catch (error) {
      console.error("Error generating APR tooltip:", error);
      return "Error calculating rewards data";
    }
  };

  const getAPYTooltipContent = () => {
    if (!stakingAPR) return "Loading...";
    
    const periodsPerYear = 26; // Compounded every 2 weeks
    return `
APY Calculation:
1. Starting APR: ${stakingAPR.toFixed(2)}%
2. Compounding: Every 2 weeks (${periodsPerYear} times/year)
3. Formula: APY = (1 + APR/100/${periodsPerYear})^${periodsPerYear} - 1) × 100
4. Steps:
   a. APR/period = ${stakingAPR.toFixed(2)}% ÷ ${periodsPerYear} = ${(stakingAPR/periodsPerYear).toFixed(4)}%
   b. Multiplier = 1 + ${(stakingAPR/periodsPerYear/100).toFixed(6)}
   c. Compound ${periodsPerYear} times
   d. Subtract 1, × 100 for %
Final APY = ${stakingAPY.toFixed(2)}%
Note: Assumes rewards are restaked every 2 weeks
    `;
  };

  // Add this helper function to format large numbers
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(2);
  };

  // Add helper function to format date
  const formatDate = (timestamp) => {
    // Convert nanoseconds to milliseconds
    const date = new Date(Number(timestamp) / 1000000);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div 
      className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${
        isSidebarOpen ? 'md:pl-64' : ''
      }`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-10">
        <div className="govern-container bg-[#111111] p-4 rounded-3xl shadow-lg overflow-hidden max-w-md mx-auto">
          <div className="flex justify-center items-center gap-2 mb-6">
            <a 
              href="https://daodao.zone/dao/migaloo10gj7p9tz9ncjk7fm7tmlax7q6pyljfrawjxjfs09a7e7g933sj0q7yeadc/home"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img 
                src="https://daodao.zone/yin_yang.png"
                alt="Yin Yang"
                className="h-6 w-6"
              />
            </a>
            <h1 className="text-2xl font-bold text-yellow-400">
              OPHIR Governance
            </h1>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-6 px-2">
            {["stake", "unstake", "rewards", "info"].map((tab) => (
              <button
                key={tab}
                className={`
                  py-2 px-3 rounded-full text-base font-bold
                  transition duration-300 ease-in-out
                  ${activeTab === tab 
                    ? "bg-yellow-400 text-black" 
                    : "bg-transparent text-white border border-yellow-400"}
                `}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === "stake" && (
            <div className="px-2">
              <p className="text-white text-base mb-1 text-center">
                Staked OPHIR: {stakedOphirBalance.toLocaleString()}
              </p>
              <p className="text-white text-base mb-1text-center">
                OPHIR Balance:{" "}
                <span
                  className="text-yellow-400 cursor-pointer"
                  onClick={() => setOphirAmount(ophirBalance)}
                >
                  {ophirBalance.toFixed(6).toLocaleString()}
                </span>
              </p>
              
              <div className="w-full mb-4">
                <input
                  id="ophirAmount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  className="w-full px-4 py-2 rounded-xl text-base bg-white text-black border-2 border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Enter OPHIR amount"
                  value={ophirAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.]/g, "");
                    setOphirAmount(value ? Number(value) : "");
                  }}
                />
              </div>

              <div className="flex justify-between mb-4 p-3 bg-[#1a1a1a] rounded-xl">
                <Tooltip 
                  title={<pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{getAPRTooltipContent()}</pre>}
                  placement="top"
                  arrow
                >
                  <div className="text-center cursor-help">
                    <p className="text-gray-400 text-sm mb-1">APR</p>
                    <p className="text-yellow-400 font-bold">
                      {stakingAPR ? `${stakingAPR.toFixed(2)}%` : '-.--'}
                    </p>
                  </div>
                </Tooltip> 
                <Tooltip 
                  title={<pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{getAPYTooltipContent()}</pre>}
                  placement="top"
                  arrow
                >
                  <div className="text-center cursor-help">
                    <p className="text-gray-400 text-sm mb-1">APY</p>
                    <p className="text-yellow-400 font-bold">
                      {stakingAPY ? `${stakingAPY.toFixed(2)}%` : '-.--'}
                    </p>
                  </div>
                </Tooltip>
              </div>
              
              <div className="text-xs text-gray-400 text-center mb-4">
                {distributions?.ophir && distributions?.btc && undistributedRewards ? (
                  <div>
                    <div>
                      Distributed: {formatNumber((Number(distributions.ophir.funded_amount) - Number(undistributedRewards.ophir)) / OPHIR_DECIMAL)} OPHIR + {formatNumber((Number(distributions.btc.funded_amount) - Number(undistributedRewards.btc)) / OPHIR_DECIMAL)} BTC
                    </div>
                    <div>
                      Undistributed: {formatNumber(Number(undistributedRewards.ophir) / OPHIR_DECIMAL)} OPHIR + {formatNumber(Number(undistributedRewards.btc) / OPHIR_DECIMAL)} BTC
                    </div>
                    <div className="mt-1">
                      First Distribution: {distributions.ophir.active_epoch?.started_at?.at_time ? 
                        formatDate(distributions.ophir.active_epoch.started_at.at_time) : 
                        'Loading...'}
                    </div>
                  </div>
                ) : (
                  "Loading rewards data..."
                )}
              </div>
              
              <button
                className="w-full py-3 bg-yellow-400 text-black text-lg font-bold rounded-xl hover:bg-yellow-500 transition duration-300 ease-in-out disabled:opacity-50"
                onClick={executeStakeContractMessage}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                  </div>
                ) : (
                  "Stake"
                )}
              </button>
            </div>
          )}

          {activeTab === "unstake" && (
            <div className="px-2">
              <p className="text-white text-base mb-1 text-center">
                Staked OPHIR:{" "}
                <span
                  className="text-yellow-400 cursor-pointer"
                  onClick={() => setOphirAmount(stakedOphirBalance)}
                >
                  {stakedOphirBalance.toLocaleString()}
                </span>
              </p>
              <p className="text-white text-base mb-4 text-center">
                OPHIR Balance: {ophirBalance.toFixed(6).toLocaleString()}
              </p>
              
              <div className="w-full mb-4">
                <input
                  id="ophirAmount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  className="w-full px-4 py-2 rounded-xl text-base bg-white text-black border-2 border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Enter OPHIR amount"
                  value={ophirAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.]/g, "");
                    setOphirAmount(value ? Number(value) : "");
                  }}
                />
              </div>

              <button
                className="w-full py-3 bg-yellow-400 text-black text-lg font-bold rounded-xl hover:bg-yellow-500 transition duration-300 ease-in-out disabled:opacity-50"
                onClick={executeUnstakeContractMessage}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                  </div>
                ) : (
                  "Unstake"
                )}
              </button>
            </div>
          )}

          {activeTab === "rewards" && (
            <div className="px-2">
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-white">Pending Rewards</h3>
                  <button
                    className="px-3 py-1.5 bg-yellow-400 text-black text-sm font-medium rounded-lg hover:bg-yellow-500 transition duration-300 ease-in-out disabled:opacity-50 min-w-[80px]"
                    onClick={getPendingRewards}
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? (
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                      </div>
                    ) : (
                      "Refresh"
                    )}
                  </button>
                </div>

                <div className="bg-[#1a1a1a] p-4 rounded-xl">
                  <h3 className="text-gray-400 text-sm mb-2">Pending OPHIR Rewards</h3>
                  <p className="text-yellow-400 text-xl font-bold">
                    {pendingOphirRewards.toFixed(6)} OPHIR
                  </p>
                  <p className="text-gray-400 text-sm">
                    ≈ ${(pendingOphirRewards * ophirPrice).toFixed(2)}
                  </p>
                </div>

                <div className="bg-[#1a1a1a] p-4 rounded-xl">
                  <h3 className="text-gray-400 text-sm mb-2">Pending BTC Rewards</h3>
                  <p className="text-yellow-400 text-xl font-bold">
                    {pendingBtcRewards.toFixed(8)} BTC
                  </p>
                  <p className="text-gray-400 text-sm">
                    ≈ ${(pendingBtcRewards * btcPrice).toFixed(2)}
                  </p>
                </div>

                <button
                  className="w-full py-3 bg-yellow-400 text-black text-lg font-bold rounded-xl hover:bg-yellow-500 transition duration-300 ease-in-out disabled:opacity-50"
                  onClick={claimRewards}
                  disabled={isLoading || (pendingOphirRewards === 0 && pendingBtcRewards === 0)}
                >
                  {isLoading ? (
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                    </div>
                  ) : (
                    "Claim Rewards"
                  )}
                </button>
              </div>
            </div>
          )}
          {activeTab === "info" && (
            <div className="px-2">
              <h2 className="text-xl text-white font-bold mb-4 text-center">
                Stakers
              </h2>
              <div className="overflow-hidden rounded-xl">
                <div className="max-h-[50vh] overflow-y-auto">
                  {/* Mobile view (card-style) */}
                  <div className="md:hidden space-y-3">
                    {stakersData.map((staker, index) => (
                      <div key={index} className="bg-[#1a1a1a] p-3 rounded-lg border border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-400 text-sm">Address:</span>
                          <span className="text-white">{truncateAddress(staker.address)}</span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-gray-400 text-sm">Balance:</span>
                          <span className="text-white">
                            {(Number(staker.balance) / OPHIR_DECIMAL).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 text-sm">Voting Power:</span>
                          <span className="text-white">{staker.votingPowerPercent.toFixed(2)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop view (table) */}
                  <table className="hidden md:table min-w-full bg-[#1a1a1a] text-white">
                    <thead>
                      <tr className="bg-yellow-400 text-black">
                        <th className="px-4 py-3 text-left">Address</th>
                        <th className="px-4 py-3 text-right">Balance</th>
                        <th className="px-4 py-3 text-right">Voting Power %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stakersData.map((staker, index) => (
                        <tr key={index} className="border-b border-gray-700">
                          <td className="px-4 py-3">{truncateAddress(staker.address)}</td>
                          <td className="px-4 py-3 text-right">
                            {(Number(staker.balance) / OPHIR_DECIMAL).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {staker.votingPowerPercent.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <Snackbar
          open={alertInfo.open}
          autoHideDuration={6000}
          onClose={() => setAlertInfo({ ...alertInfo, open: false })}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
          sx={{ 
            top: '80px !important',
            width: { xs: '80vw', sm: 'auto' },
            left: { xs: '50%', sm: 'auto' },
            transform: { xs: 'translateX(-50%)', sm: 'none' }
          }}
        >
          {alertInfo.htmlContent ? (
            <SnackbarContent
              style={{
                color: "black",
                backgroundColor:
                  alertInfo.severity === "error" ? "#ffcccc" : "#ccffcc",
                width: '100%'
              }}
              message={
                <span
                  dangerouslySetInnerHTML={{ __html: alertInfo.htmlContent }}
                />
              }
            />
          ) : (
            <Alert
              onClose={() => setAlertInfo({ ...alertInfo, open: false })}
              severity={alertInfo.severity}
              sx={{ width: "100%" }}
            >
              {alertInfo.message}
            </Alert>
          )}
        </Snackbar>
      </div>
    </div>
  );
};

export default Govern;
