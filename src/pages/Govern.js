import React, { useState, useEffect } from "react";
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

const Govern = () => {
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const { prices } = useCrypto();
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

  useEffect(() => {
    getStakers();
  }, []);

  useEffect(() => {
    if (connectedWalletAddress) {
      checkBalance(connectedWalletAddress).then((balance) => {
        setOphirBalance(balance); // Update the balance state when the promise resolves
      });
      getStakedOphirBalance();
    }
  }, [connectedWalletAddress]);

  useEffect(() => {
    // Update contract address when testnet status changes
    setContractAddress(
      isTestnet 
        ? daoConfig["DAO_STAKING_CONTRACT_ADDRESS_TESTNET"]
        : daoConfig["DAO_STAKING_CONTRACT_ADDRESS"]
    );
  }, [isTestnet]);

  useEffect(() => {
    if (prices && prices.ophir && prices.bitcoin) {
      setOphirPrice(prices.ophir);
      setBtcPrice(prices.bitcoin);
      
      // Calculate rewards value per year
      const biweeklyOphirReward = 125000; // 125k OPHIR
      const biweeklyBtcReward = 0.0002; // 0.0002 BTC
      const periodsPerYear = 26; // 52 weeks / 2 = 26 biweekly periods
      
      // Calculate yearly USD value of rewards
      const yearlyOphirRewardValue = biweeklyOphirReward * prices.ophir * periodsPerYear;
      const yearlyBtcRewardValue = biweeklyBtcReward * prices.bitcoin * periodsPerYear;
      const totalYearlyRewardValue = yearlyOphirRewardValue + yearlyBtcRewardValue;
      
      // Calculate APR based on total staked value
      if (stakedOphirBalance > 0) {
        const totalStakedValue = stakedOphirBalance * prices.ophir;
        const calculatedAPR = (totalYearlyRewardValue / totalStakedValue) * 100;
        setStakingAPR(calculatedAPR);
        
        // Calculate APY (assuming rewards are compounded every 2 weeks)
        const periodsPerYearDecimal = 26;
        const calculatedAPY = (
          Math.pow(1 + (calculatedAPR / 100 / periodsPerYearDecimal), periodsPerYearDecimal) - 1
        ) * 100;
        setStakingAPY(calculatedAPY);
      }
    }
  }, [prices, stakedOphirBalance]);

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

  const checkBalance = async (address) => {
    const signer = await getSigner(); // Assuming getSigner is defined as shown previously

    // Connect with the signer to get a client capable of signing transactions
    const client = await SigningStargateClient.connectWithSigner(
      migalooRPC,
      signer
    ); // Use the mainnet RPC endpoint

    // Query all balances for the address
    const balances = await client.getAllBalances(address);
    console.log(balances);
    // Assuming OPHIR_DENOM is defined elsewhere in your code and represents the denom you're interested in
    const ophirBalance = balances.find(
      (balance) => balance.denom === daoConfig["OPHIR_DENOM"]
    );

    if (ophirBalance) {
      console.log(`Ophir Balance: ${ophirBalance.amount}`);
      return parseFloat(ophirBalance.amount) / OPHIR_DECIMAL; // Adjust the division based on the token's decimals, assuming OPHIR_DECIMAL is defined
    } else {
      console.log("Ophir Balance: 0");
      return 0;
    }
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

  return (
    <div 
      className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${
        isSidebarOpen ? 'md:pl-64' : ''
      }`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-10">
        <div className="govern-container bg-[#111111] p-4 rounded-3xl shadow-lg overflow-hidden max-w-md mx-auto">
          <h1 className="text-center text-2xl mb-6 font-bold text-yellow-400">
            OPHIR Governance
          </h1>
          
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
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">APR</p>
                  <p className="text-yellow-400 font-bold">
                    {stakingAPR ? `${stakingAPR.toFixed(2)}%` : '-.--'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-400 text-sm mb-1">APY</p>
                  <p className="text-yellow-400 font-bold">
                    {stakingAPY ? `${stakingAPY.toFixed(2)}%` : '-.--'}
                  </p>
                </div>
              </div>
              
              <div className="text-xs text-gray-400 text-center mb-4">
                Rewards: 125k OPHIR + 0.0002 BTC every 2 weeks
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
            <div>
              <h2 className="h2-govern text-white text-xl mb-7">Rewards</h2>
              {/* Rewards content goes here */}
            </div>
          )}
          {activeTab === "info" && (
            <div className="px-2">
              <h2 className="text-xl text-white font-bold mb-4 text-center">
                Stakers
              </h2>
              {Object.keys(ophirStakers).length > 0 && (
                <div className="overflow-x-auto rounded-xl">
                  <div className="max-h-[50vh] overflow-y-auto">
                    <table className="min-w-full bg-[#1a1a1a] text-white">
                      <thead>
                        <tr className="bg-yellow-400 text-black">
                          <th className="px-4 py-3 text-left">Address</th>
                          <th className="px-4 py-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ophirStakers.stakers.map((staker, index) => (
                          <tr key={index} className="border-b border-gray-700">
                            <td className="px-4 py-3">{truncateAddress(staker.address)}</td>
                            <td className="px-4 py-3 text-right">
                              {(Number(staker.balance) / OPHIR_DECIMAL).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
