import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { tokenMappings } from "../utils/tokenMappings";
import { daoConfig } from "../utils/daoConfig";
import { tokenImages } from "../utils/tokenImages";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { SigningStargateClient } from "@cosmjs/stargate";
import Countdown from 'react-countdown';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';
import { Dialog } from '@headlessui/react'
import { BigInt } from 'big-integer';

const formatAmount = (amount) => {
  if (!amount) return '0';
  if (parseFloat(amount) < 1) {
    return amount;
  }
  return (parseInt(amount) / 1000000).toFixed(6);
};

const isSoldOut = (remainingSupply) => {
  return parseInt(remainingSupply) / 1000000 < 0.00001;
};

const BuyBonds = () => {
  const { bondId } = useParams();
  const navigate = useNavigate();
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const [bond, setBond] = useState(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });
  const [isTestnet, setIsTestnet] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [userBalance, setUserBalance] = useState(null);
  const [userBonds, setUserBonds] = useState([]);
  const [walletBalances, setWalletBalances] = useState({});
  const [userBondPurchase, setUserBondPurchase] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [claimingStates, setClaimingStates] = useState({});
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState(0);

  const migalooRPC = "https://migaloo-rpc.polkachu.com/";
  const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";
  const rpc = isTestnet ? migalooTestnetRPC : migalooRPC;
  const contractAddress = daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET;

  useEffect(() => {
    fetchBondDetails();
  }, [bondId]);

  const getSigner = async () => {
    if (window.keplr?.experimentalSuggestChain) {
      await window.keplr?.experimentalSuggestChain({
        chainId: "narwhal-2",
        chainName: "Migaloo Testnet",
        rpc: rpc,
        rest: "https://migaloo-testnet-api.polkachu.com",
        bip44: { coinType: 118 },
        bech32Config: {
          bech32PrefixAccAddr: "migaloo",
          bech32PrefixAccPub: "migaloopub",
          bech32PrefixValAddr: "migaloovaloper",
          bech32PrefixValPub: "migaloovaloperpub",
          bech32PrefixConsAddr: "migaloovalcons",
          bech32PrefixConsPub: "migaloovalconspub",
        },
        currencies: [{ coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 }],
        feeCurrencies: [{ coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 }],
        stakeCurrency: { coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 },
        gasPriceStep: { low: 0.2, average: 0.45, high: 0.75 },
      });
    }
  
    await window.keplr?.enable("narwhal-2");
    const offlineSigner = window.keplr?.getOfflineSigner("narwhal-2");
    return offlineSigner;
  };

  const queryContract = async (message) => {
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
  
      const queryResponse = await client.queryContractSmart(
        contractAddress,
        message
      );
  
      console.log('Query Response:', queryResponse);
      return queryResponse;
    } catch (error) {
      console.error("Error querying contract:", error);
      if (!error.message.includes('No bond purchase found') && !error.message.includes('Invalid type')) {
        showAlert(`Error querying contract: ${error.message}`, "error");
      }
      throw error;
    }
  };

  const fetchBondDetails = async () => {
    try {
      const queryMsg = { get_bond_offer: { bond_id: parseInt(bondId) } };
      const result = await queryContract(queryMsg);
      
      if (!result || !result.bond_offer) {
        throw new Error('Invalid response format from contract');
      }
      
      console.log('Fetched bond details:', result);
      setBond(result.bond_offer);
    } catch (error) {
      console.error("Error fetching bond details:", error);
      showAlert(`Error fetching bond details: ${error.message}`, "error");
    }
  };

  const getTokenSymbol = (denom) => {
    return tokenMappings[denom]?.symbol || denom;
  };

  const getBondStatus = (bond) => {
    const now = Math.floor(Date.now() / 1000);
    const startTime = Math.floor(parseInt(bond.purchase_start_time) / 1_000_000_000);
    const endTime = Math.floor(parseInt(bond.purchase_end_time) / 1_000_000_000);
    const maturityDate = Math.floor(parseInt(bond.maturity_date) / 1_000_000_000);

    if (now < startTime) return "Upcoming";
    if (now >= startTime && now <= endTime) return "Active";
    if (now > endTime && now < maturityDate) return "Ended";
    return "Matured";
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    try {
      const milliseconds = Number(timestamp) / 1_000_000;
      const date = new Date(milliseconds);
      
      const options = {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      };
      
      return new Intl.DateTimeFormat(undefined, options).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  useEffect(() => {
    if (connectedWalletAddress) {
      checkBalances();
    }
  }, [connectedWalletAddress]);

  const fetchUserBalance = async (address, denom) => {
    if (!address || !denom) {
      console.log('Missing address or denom for balance fetch');
      return;
    }

    try {
      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(rpc, signer);
      const balance = await client.getBalance(address, denom);
      const tokenInfo = tokenMappings[denom] || { decimals: 6 };
      const formattedBalance = parseFloat(balance.amount) / Math.pow(10, tokenInfo.decimals);
      setUserBalance(formattedBalance);
    } catch (error) {
      console.error("Error fetching user balance:", error);
      showAlert("Error fetching user balance", "error");
    }
  };

  const fetchUserBonds = async (address) => {
    try {
      const queryMsg = { 
        get_bonds_by_user: { 
          buyer: address 
        } 
      };
      const result = await queryContract(queryMsg);
      console.log('User bonds:', result);
      setUserBonds(result.bond_purchases || []);
    } catch (error) {
      console.error("Error fetching user bonds:", error);
      showAlert(`Error fetching user bonds: ${error.message}`, "error");
    }
  };

  const fetchUserBondPurchase = async (address) => {
    try {
        console.log('Fetching user bond purchase for:', {
        bondId,
        address
        });

        const queryMsg = { 
        get_bond_purchase: { 
            bond_id: parseInt(bondId),
            buyer: address
        } 
        };
        console.log('Query message:', queryMsg);

        const result = await queryContract(queryMsg);
        console.log('User bond purchase result:', result);

        const bondPurchases = result.bond_purchases || null;
        setUserBondPurchase(bondPurchases);
        console.log('Updated userBondPurchase state:', bondPurchases);
    } catch (error) {
    //   console.error("Error fetching user bond purchase:", error);
    }
  };

  useEffect(() => {
    fetchBondDetails();
  }, [bondId]);

  useEffect(() => {
    fetchUserBondPurchase(connectedWalletAddress)
    if (connectedWalletAddress && bond?.purchasing_denom) {
      console.log("useEffect triggered with:", {
        connectedWalletAddress,
        purchasingDenom: bond.purchasing_denom,
        bondId
      });
      
      const fetchData = async () => {
        await Promise.all([
          fetchUserBalance(connectedWalletAddress, bond.purchasing_denom),
          fetchUserBondPurchase(connectedWalletAddress)
        ]);
      };

      fetchData();
    }
  }, [connectedWalletAddress, bond]);

  const calculateMaxPurchaseAmount = (bond) => {
    if (!bond || !bond.remaining_supply || !bond.price) return 0;
    const remainingSupply = parseFloat(formatAmount(bond.remaining_supply));
    const price = parseFloat(bond.price);
    return remainingSupply * price;
  };

  const validatePurchaseAmount = (amount) => {
    if (!amount || !bond) return true;
    const purchaseAmountNum = parseFloat(amount);
    const maxPurchaseAmount = calculateMaxPurchaseAmount(bond);
    return purchaseAmountNum <= maxPurchaseAmount;
  };

  const calculateBondAmount = (purchaseAmount) => {
    if (!purchaseAmount || !bond?.price) return 0;
    return (parseFloat(purchaseAmount) / parseFloat(bond.price)).toFixed(6);
  };

  const handlePurchase = async () => {
    if (!validatePurchaseAmount(purchaseAmount)) {
      showAlert("Invalid purchase amount", "error");
      return;
    }
    setShowConfirmModal(true);
  };

  const executePurchase = async () => {
    setShowConfirmModal(false);
    setIsLoading(true);
    try {
      const purchaseAmountNum = parseFloat(purchaseAmount);
      const maxPurchaseAmount = calculateMaxPurchaseAmount(bond);
      
      if (purchaseAmountNum > maxPurchaseAmount) {
        throw new Error(`Purchase amount exceeds maximum allowed: ${maxPurchaseAmount.toFixed(6)} ${purchasingSymbol}`);
      }

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const tokenDecimals = tokenMappings[bond.purchase_denom]?.decimals || 6;
      const purchaseAmountInMicroUnits = Math.floor(
        purchaseAmountNum * Math.pow(10, tokenDecimals)
      ).toString();
      
      const purchaseMsg = {
        buy_bond: {
          bond_id: parseInt(bondId)
        }
      };

      const funds = [{
        denom: bond.purchase_denom,
        amount: purchaseAmountInMicroUnits
      }];

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      console.log('Executing purchase with:', {
        purchaseMsg,
        funds,
        fee
      });

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        purchaseMsg,
        fee,
        `Purchase Bond: ${bondId}`,
        funds
      );

      console.log('Purchase result:', result);
      if (result.transactionHash) {
        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Bond purchased successfully! Transaction Hash: ${result.transactionHash}`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction</a>`
        );
        
        await Promise.all([
          fetchBondDetails(),
          fetchUserBalance(connectedWalletAddress, bond.purchasing_denom),
          fetchUserBondPurchase(connectedWalletAddress),
          checkBalances()
        ]);
      } else {
        showAlert("Bond purchased successfully!", "success");
      }
      setPurchaseAmount('');
      
      if (connectedWalletAddress && bond?.purchasing_denom) {
        await fetchUserBalance(connectedWalletAddress, bond.purchasing_denom);
      }
    } catch (error) {
      console.error("Error purchasing bond:", error);
      showAlert(`Error purchasing bond: ${error.message}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const calculateUnclaimedAmount = (total, claimed) => {
    if (!total || !claimed) return '0';
    try {
      // Check if BigInt is available and the values are valid
      if (typeof BigInt !== 'undefined') {
        return (BigInt(total) - BigInt(claimed)).toString();
      }
      // Fallback to regular number calculation
      return (parseInt(total) - parseInt(claimed)).toString();
    } catch (error) {
      // If any error occurs, fallback to regular number calculation
      return (parseInt(total) - parseInt(claimed)).toString();
    }
  };

  const CountdownRenderer = ({ days, hours, minutes, seconds, completed }) => {
    if (completed) {
      return <span>Bond is now active!</span>;
    } else {
      const formattedDays = Math.floor(days);

      return (
        <div className="text-center">
          <div className="text-xl sm:text-3xl font-bold mb-2">Bond Purchase Opens In...</div>
          <div className="flex justify-center space-x-2 sm:space-x-4">
            {[
              { value: formattedDays, label: "Days" },
              { value: hours, label: "Hours" },
              { value: minutes, label: "Min" },
              { value: seconds, label: "Sec" }
            ].map(({ value, label }) => (
              <div key={label} className="bg-gray-700 rounded-lg p-2 sm:p-3 w-16 sm:w-24">
                <div className="text-lg sm:text-2xl font-bold">
                  {String(value).padStart(2, '0')}
                </div>
                <div className="text-xs sm:text-sm text-gray-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  };

  const calculateSoldPercentage = (remainingSupply, totalSupply) => {
    if (!remainingSupply || !totalSupply) return 0;
    const remaining = parseInt(remainingSupply);
    const total = parseInt(totalSupply);
    if (isNaN(remaining) || isNaN(total) || total === 0) return 0;
    const soldSupply = total - remaining;
    return Math.round((soldSupply / total) * 100);
  };

  const formatBondDenom = (denom) => {
    if (!denom) return '';
    return extractLastSection(denom);
  };

  const checkBalances = async () => {
    try {
      console.log("Checking balances for address:", connectedWalletAddress);

      if (!connectedWalletAddress || connectedWalletAddress.trim() === '') {
        console.log('No wallet address available');
        return;
      }

      const signer = await getSigner();
      if (!signer) {
        console.log('No signer available');
        return;
      }

      const client = await SigningStargateClient.connectWithSigner(rpc, signer);
      const balances = await client.getAllBalances(connectedWalletAddress);
      console.log("Retrieved balances:", balances);

      const formattedBalances = balances.reduce((acc, balance) => {
        const tokenInfo = tokenMappings[balance.denom] || {
          symbol: balance.denom,
          decimals: 6,
        };
        const amount = parseFloat(balance.amount) / Math.pow(10, tokenInfo.decimals);
        acc[balance.denom] = amount;
        return acc;
      }, {});

      console.log("Formatted balances:", formattedBalances);
      setWalletBalances(formattedBalances);
    } catch (error) {
      console.error("Error checking balances:", error);
      if (!error.message.includes('empty address')) {
        showAlert(`Error checking balances: ${error.message}`, "error");
      }
    }
  };

  const handleClaimRewards = async (purchase, purchaseIndex) => {
    // Update claiming state for specific purchase
    setClaimingStates(prev => ({ ...prev, [purchaseIndex]: true }));
    
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const claimMsg = {
        claim_rewards: {
          bond_id: parseInt(bondId),
          nft_token_id: purchase.nft_token_id
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      console.log('Claiming rewards with:', {
        bondId,
        nftTokenId: purchase.nft_token_id,
        purchaseIndex,
        message: claimMsg
      });

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        claimMsg,
        fee,
        `Claim Bond Rewards - Amount: ${formatAmount(purchase.amount)}`
      );

      if (result.transactionHash) {
        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Bond claimed successfully!`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction</a>`
        );
        
        // Refresh data
        await Promise.all([
          fetchUserBondPurchase(connectedWalletAddress),
          checkBalances()
        ]);
      }
    } catch (error) {
      console.error("Error claiming bond:", error);
      showAlert(`Error claiming bond: ${error.message}`, "error");
    } finally {
      // Clear claiming state for specific purchase
      setClaimingStates(prev => ({ ...prev, [purchaseIndex]: false }));
    }
  };

  const isClaimable = (bond, userBondPurchase) => {
    if (!bond || !userBondPurchase || !userBondPurchase.amount || !userBondPurchase.claimed_amount) {
      return false;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const claimStartTime = Math.floor(parseInt(bond.claim_start_time) / 1_000_000_000);
    const claimEndTime = Math.floor(parseInt(bond.claim_end_time) / 1_000_000_000);
    
    const hasUnclaimedAmount = parseInt(userBondPurchase.amount) > parseInt(userBondPurchase.claimed_amount);
    
    return now >= claimStartTime && now <= claimEndTime && hasUnclaimedAmount;
  };

  const handleWithdrawRewards = async () => {
    setIsWithdrawLoading(true);
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const withdrawMsg = {
        withdraw: {
          bond_id: parseInt(bondId)
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      console.log('Executing withdrawal with:', {
        withdrawMsg,
        fee
      });

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        withdrawMsg,
        fee,
        `Withdraw Bond: ${bondId}`
      );

      // Refresh data
      const [bondDetails] = await Promise.all([
        fetchBondDetails(),
        fetchUserBalance(connectedWalletAddress, bond.purchase_denom),
        fetchUserBondPurchase(connectedWalletAddress),
        checkBalances()
      ]);

      if (result.transactionHash) {
        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;

        // Check if bond is now closed
        if (bondDetails?.bond_offer?.closed) {
          showAlert(
            `Withdrawal successful and bond has been closed! Transaction Hash: ${result.transactionHash}`,
            "success",
            `<div>
              <p class="mb-2">✅ Bond #${bondId} has been successfully closed.</p>
              <a href="${txnUrl}" target="_blank" class="text-yellow-400 hover:text-yellow-300">View Transaction</a>
            </div>`
          );
        } else {
          showAlert(
            `Withdrawal successful! Transaction Hash: ${result.transactionHash}`,
            "success",
            `<a href="${txnUrl}" target="_blank">View Transaction</a>`
          );
        }
      } else {
        showAlert("Withdrawal successful!", "success");
      }

      // Close the modal after successful withdrawal
      setShowWithdrawModal(false);

    } catch (error) {
      console.error("Error withdrawing rewards:", error);
      showAlert(`Error withdrawing rewards: ${error.message}`, "error");
    } finally {
      setIsWithdrawLoading(false);
    }
  };

  const canWithdraw = () => {
    if (!bond) return false;
    
    const now = Math.floor(Date.now() / 1000);
    const maturityTime = Math.floor(parseInt(bond.maturity_date) / 1_000_000_000);
    const hasRemainingSupply = parseInt(bond.remaining_supply) > 0;
    
    // Add check for bond.closed
    return connectedWalletAddress && 
           now > maturityTime && 
           hasRemainingSupply && 
           !bond.closed; // Don't show withdraw if bond is closed
  };

  const calculateWithdrawAmount = () => {
    if (!bond) {
      return {
        bondTokens: '0'
      };
    }
    


    // Calculate unclaimed bond tokens (remaining supply)
    const remainingBonds = parseInt(bond.remaining_supply) / 1000000;
    
    const result = {
      bondTokens: remainingBonds.toFixed(6)
    };

    
    return result;
  };

  if (!bond) {
    return (<>
      <div className="global-bg-new flex flex-col justify-center items-center h-screen">
          <div className="text-white mb-4">Fetching Bond Data...</div>
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400"></div>
      </div>
    </>);
  }

  const bondSymbol = bond.token_denom ? formatBondDenom(getTokenSymbol(bond.token_denom)) : '';
  const purchasingSymbol = bond.purchase_denom ? formatBondDenom(getTokenSymbol(bond.purchase_denom)) : '';

  const handleGoBack = () => {
    navigate('/bonds');
  };

  const isBondActive = getBondStatus(bond) === "Active";

  const getTokenImage = (denom) => {
    return tokenImages[denom] || tokenImages['default'];
  };


  return (
    <div className={`global-bg-new text-white min-h-screen w-full transition-all duration-300 ease-in-out ${
      isSidebarOpen ? 'md:pl-64' : ''
    }`}>
      <div className="pt-32 md:pt-24 w-[92%] md:w-[95%] md:max-w-10xl mx-auto">
        {canWithdraw() && (
          <div className="mb-6 p-4 bg-green-800/80 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg md:text-2xl font-bold text-yellow-400">Withdraw Rewards</h2>
                <p className="text-sm md:text-base text-gray-300">
                  You can withdraw{' '}
                  <span className="font-bold">
                    {calculateWithdrawAmount().bondTokens} {bondSymbol}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
              >
                Withdraw
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-4 md:mb-6">
          <button
            onClick={handleGoBack}
            className="flex items-center text-sm md:text-base text-gray-300 hover:text-white transition duration-300"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back
          </button>
        </div>

        <h1 className="text-xl md:text-3xl font-bold mb-4 md:mb-8 h1-color">
          {bond?.bond_name ? `${bond.bond_name} Details` : 'Bond Details'}
        </h1>

        <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 md:p-8 mb-4 shadow-xl border border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
            <div className="p-2 md:p-4 bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Bond ID:</p>
              <p className="text-sm md:text-xl font-bold text-center">{bond?.bond_id || 'N/A'}</p>
            </div>
            
            <div className="p-2 md:p-4 bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Status:</p>
              <p className="text-sm md:text-xl font-bold text-center">{bond ? getBondStatus(bond) : 'N/A'}</p>
            </div>

            <div className="p-2 md:p-4 bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Total Supply:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond ? `${formatAmount(bond.total_amount)} ${bondSymbol}` : 'N/A'}
              </p>
            </div>

            <div className="p-2 md:p-4 bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Price:</p>
              <div className="flex items-center justify-center">
                <p className="text-sm md:text-xl font-bold">{bond ? bond.price : 'N/A'}</p>
                <div className="flex items-center ml-2">
                  <span className="text-sm md:text-xl">{purchasingSymbol}</span>
                  <img 
                    src={getTokenImage(purchasingSymbol)} 
                    alt={purchasingSymbol}
                    className="w-6 h-6 ml-2 rounded-full"
                  />
                </div>
              </div>
            </div>

            <div className="p-2 md:p-4 bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Purchase End:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond?.purchase_end_time ? formatDate(bond.purchase_end_time) : 'N/A'}
              </p>
            </div>

            <div className="p-2 md:p-4 bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Maturity Date:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond?.claim_end_time ? formatDate(bond.claim_end_time) : 'N/A'}
              </p>
            </div>
          </div>
          
          <div className="col-span-2 mt-4 md:mt-6">
            <p className="text-gray-400 text-xs md:text-sm mb-2">Bond Sale Progress:</p>
            <div className="flex items-center p-3 md:p-4 bg-gray-900/50 rounded-lg">
              <div className="w-16 h-16 md:w-24 md:h-24 mr-4 md:mr-6">
                <CircularProgressbar
                  value={bond ? calculateSoldPercentage(bond.remaining_supply, bond.total_amount) : 0}
                  text={`${bond ? calculateSoldPercentage(bond.remaining_supply, bond.total_amount) : 0}%`}
                  styles={buildStyles({
                    textSize: '16px',
                    pathColor: '#F59E0B',
                    textColor: '#FFFFFF',
                    trailColor: '#1F2937',
                  })}
                />
              </div>
              <div className="space-y-1 md:space-y-2">
                <p className="text-xs md:text-sm">
                  Sold: <span className="text-yellow-400 font-bold">
                    {bond ? `${formatAmount(bond.total_amount - bond.remaining_supply)} ${bondSymbol}` : 'N/A'}
                  </span>
                </p>
                <p className="text-xs md:text-sm">
                  Remaining: <span className="text-yellow-400 font-bold">
                    {bond ? `${formatAmount(bond.remaining_supply)} ${bondSymbol}` : 'N/A'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {getBondStatus(bond) === "Upcoming" && (
          <div className="mt-4 sm:mt-6 p-2 sm:p-4 bg-gray-700 rounded-lg overflow-hidden">
            <Countdown
              date={new Date(Number(bond.purchase_start_time) / 1_000_000)}
              renderer={CountdownRenderer}
            />
          </div>
        )}

        {/* {userBonds.length > 0 && (
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3 md:p-8 mb-4 shadow-xl border border-gray-700">
            <h2 className="text-lg md:text-2xl font-bold mb-3 md:mb-6 text-yellow-400">Your Bond Holdings</h2>
            <div className="space-y-2 md:space-y-3">
              {userBonds.map((userBond, index) => (
                <div key={index} className="p-2 md:p-3 bg-gray-900/50 rounded-lg">
                  <div className="grid grid-cols-2 gap-2 text-xs md:text-base">
                    <div>
                      <p className="text-gray-400 text-[10px] md:text-xs">Amount:</p>
                      <p className="font-bold">{formatAmount(userBond.amount)} {bondSymbol}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs md:text-xs">Purchase Date:</p>
                      <p className="font-bold">{formatDate(userBond.purchase_time)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs md:text-xs">Claimed Amount:</p>
                      <p className="font-bold">{formatAmount(userBond.claimed_amount)} {bondSymbol}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs md:text-xs">Bond ID:</p>
                      <p className="font-bold">#{userBond.bond_id}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )} */}

        {isBondActive && (
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-6 md:p-8 shadow-xl border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-yellow-400">Purchase Bond</h2>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-400">Price:</span>
                <span className="text-lg font-bold">{bond?.price || 'N/A'}</span>
                <div className="flex items-center">
                  <span className="text-lg">{purchasingSymbol}</span>
                  <img 
                    src={getTokenImage(purchasingSymbol)} 
                    alt={purchasingSymbol}
                    className="w-5 h-5 ml-2 rounded-full"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Amount ({purchasingSymbol})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={purchaseAmount}
                    onChange={(e) => setPurchaseAmount(e.target.value)}
                    className="w-full px-4 py-3 text-lg rounded-lg bg-gray-900/50 border border-gray-700 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-200"
                    placeholder="0.0"
                  />
                  {bond?.purchase_denom && walletBalances[bond.purchase_denom] && (
                    <button 
                      className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-sm bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors"
                      onClick={() => {
                        const maxPurchaseAmount = calculateMaxPurchaseAmount(bond);
                        const userBalance = walletBalances[bond.purchase_denom];
                        setPurchaseAmount(Math.min(maxPurchaseAmount, userBalance).toString());
                      }}
                    >
                      MAX
                    </button>
                  )}
                </div>
                {purchaseAmount && !validatePurchaseAmount(purchaseAmount) && (
                  <p className="text-red-500 text-sm mt-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Amount exceeds maximum purchase amount of {calculateMaxPurchaseAmount(bond).toFixed(6)} {purchasingSymbol}
                  </p>
                )}
              </div>

              <div className="bg-gray-900/30 rounded-lg p-4 space-y-3">
                {bond?.purchase_denom && walletBalances[bond.purchase_denom] && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Available Balance:</span>
                    <span className="text-yellow-400 font-medium">
                      {walletBalances[bond.purchase_denom]?.toLocaleString(undefined, {
                        minimumFractionDigits: 6,
                        maximumFractionDigits: 6
                      })} {purchasingSymbol}
                    </span>
                  </div>
                )}
                
                {purchaseAmount && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">You Will Receive:</span>
                    <span className="text-white font-medium">
                      {validatePurchaseAmount(purchaseAmount) 
                        ? `${calculateBondAmount(purchaseAmount)} ${bondSymbol}`
                        : 'N/A'}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handlePurchase}
                disabled={!connectedWalletAddress || isLoading || !purchaseAmount}
                className="w-full py-4 mt-4 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all duration-300 flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing...</span>
                  </>
                ) : !connectedWalletAddress ? (
                  'Connect Wallet to Purchase'
                ) : !purchaseAmount ? (
                  'Enter Amount'
                ) : (
                  'Purchase Bond'
                )}
              </button>
            </div>
          </div>
        )}

{userBondPurchase && (
  <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 sm:p-6 mt-4 mb-4 shadow-xl border border-gray-700">
    <h2 className="text-lg sm:text-2xl font-bold mb-4 text-yellow-400">Your Bond Purchases</h2>
    
    <div className="space-y-2">
      {userBondPurchase
        .filter(purchase => purchase.bond_id === parseInt(bondId))
        .map((purchase, index) => (
          <div 
            key={index} 
            className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-colors"
          >
            {/* Mobile Layout */}
            <div className="sm:hidden space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Amount</p>
                  <p className="font-medium">
                    {formatAmount(purchase.amount)} {bondSymbol}
                  </p>
                </div>
                
                <div>
                  <p className="text-gray-400 text-xs mb-1">Claimed</p>
                  <p className="font-medium">
                    {formatAmount(purchase.claimed_amount)} {bondSymbol}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-gray-400 text-xs mb-1">Purchase Date</p>
                <p className="font-medium text-sm">
                  {formatDate(purchase.purchase_time)}
                </p>
              </div>
              
              <div>
                {isClaimable(bond, purchase) ? (
                  <button
                    onClick={() => handleClaimRewards(purchase, index)}
                    disabled={claimingStates[index]}
                    className="w-full px-3 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 
                      disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all duration-300 
                      flex items-center justify-center space-x-2 text-sm"
                  >
                    {claimingStates[index] ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Processing...</span>
                      </>
                    ) : (
                      'Claim'
                    )}
                  </button>
                ) : (
                  <div className="text-sm text-gray-400 text-center py-1">
                    Claimable {formatDate(bond.claim_start_time)}
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:grid grid-cols-4 gap-4 items-center">
              <div>
                <p className="text-gray-400 text-xs mb-1">Amount</p>
                <p className="font-medium">
                  {formatAmount(purchase.amount)} {bondSymbol}
                </p>
              </div>
              
              <div>
                <p className="text-gray-400 text-xs mb-1">Claimed</p>
                <p className="font-medium">
                  {formatAmount(purchase.claimed_amount)} {bondSymbol}
                </p>
              </div>
              
              <div>
                <p className="text-gray-400 text-xs mb-1">Purchase Date</p>
                <p className="font-medium">
                  {formatDate(purchase.purchase_time)}
                </p>
              </div>
              
              <div>
                {isClaimable(bond, purchase) ? (
                  <button
                    onClick={() => handleClaimRewards(purchase, index)}
                    disabled={claimingStates[index]}
                    className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 
                      disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all duration-300 
                      flex items-center justify-center space-x-2"
                  >
                    {claimingStates[index] ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Claiming...</span>
                      </>
                    ) : (
                      'Claim Rewards'
                    )}
                  </button>
                ) : (
                  <div className="text-sm text-gray-400">
                    Claimable {formatDate(bond.claim_start_time)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
    </div>
  </div>
)}

        <Dialog
          open={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
          
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-gray-800 rounded-lg p-6 max-w-sm w-full border border-gray-700">
              <Dialog.Title className="text-xl font-bold text-yellow-400 mb-4">
                Confirm Bond Purchase
              </Dialog.Title>
              
              <div className="space-y-4">
                <div className="bg-gray-900/50 p-3 rounded-lg">
                  <p className="text-gray-400 text-sm">You will pay:</p>
                  <p className="text-lg font-bold">
                    {purchaseAmount} {purchasingSymbol}
                  </p>
                </div>
                
                <div className="bg-gray-900/50 p-3 rounded-lg">
                  <p className="text-gray-400 text-sm">You will receive:</p>
                  <p className="text-lg font-bold">
                    {calculateBondAmount(purchaseAmount)} {bondSymbol}
                  </p>
                </div>
                
                <div className="bg-gray-900/50 p-3 rounded-lg">
                  <p className="text-gray-400 text-sm">Available to claim:</p>
                  <p className="text-lg font-bold">
                    {formatDate(bond.claim_start_time)}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executePurchase}
                  className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
                >
                  Confirm
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        <Dialog
          open={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
          
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-gray-800 rounded-lg p-6 max-w-sm w-full border border-gray-700">
              <Dialog.Title className="text-xl font-bold text-yellow-400 mb-4">
                Confirm Withdrawal
              </Dialog.Title>
              
              <div className="space-y-4">
                <div className="bg-gray-900/50 p-3 rounded-lg">
                  <p className="text-gray-400 text-sm">You will withdraw:</p>
                  <p className="text-lg font-bold">
                    {calculateWithdrawAmount().bondTokens} {bondSymbol}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdrawRewards}
                  disabled={isWithdrawLoading}
                  className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
                >
                  {isWithdrawLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-black mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Withdrawing...</span>
                    </>
                  ) : (
                    'Confirm Withdrawal'
                  )}
                </button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        <Snackbar
          open={alertInfo.open}
          autoHideDuration={6000}
          onClose={() => setAlertInfo({ ...alertInfo, open: false })}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          sx={{ 
            top: '24px',
            width: '90%',
            maxWidth: '600px',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <Alert 
            onClose={() => setAlertInfo({ ...alertInfo, open: false })} 
            severity={alertInfo.severity}
            sx={{
              width: '100%',
              '& .MuiAlert-message': {
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                wordBreak: 'break-word'
              }
            }}
          >
            {alertInfo.message}
          </Alert>
        </Snackbar>
      </div>
    </div>
  );
};

function extractLastSection(address) {
  if (!address) return '';
  if (address.includes('factory')) {
    const sections = address.split('/');
    return sections[sections.length - 1];
  }
  return address;
}

export default BuyBonds;