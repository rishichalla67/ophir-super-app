import React, { useState, useEffect, useCallback } from 'react';
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
import { getNFTInfo, nftInfoCache, CACHE_DURATION, invalidateNFTCache } from '../utils/nftCache';
import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import { useCrypto } from '../context/CryptoContext';
import { useNetwork } from '../context/NetworkContext';

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

const canClaimBond = (claimStartTime) => {
  if (!claimStartTime) return false;
  
  try {
    const now = new Date().getTime();
    // Handle both nanosecond and second timestamps
    const claimStart = claimStartTime.toString().length > 13 
      ? parseInt(claimStartTime) / 1_000_000 
      : parseInt(claimStartTime) * 1000;
    
    return now >= claimStart;
  } catch (error) {
    console.error('Error checking claim time:', error);
    return false;
  }
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A';
  try {
    // Handle both nanosecond and second timestamps
    const milliseconds = timestamp.toString().length > 13 
      ? parseInt(timestamp) / 1_000_000 
      : parseInt(timestamp) * 1000;
    
    const date = new Date(milliseconds);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid date timestamp:', timestamp);
      return 'Invalid Date';
    }
    
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid Date';
  }
};

const BondTimeline = ({ bond }) => {
  const now = Date.now();
  const dates = [
    {
      time: parseInt(bond.purchase_start_time) / 1_000_000,
      label: 'Purchase Start',
      color: now < parseInt(bond.purchase_start_time) / 1_000_000 ? 'grey' : 'success'
    },
    {
      time: parseInt(bond.purchase_end_time) / 1_000_000,
      label: 'Purchase End',
      color: now < parseInt(bond.purchase_end_time) / 1_000_000 ? 'grey' : 'success'
    },
    {
      time: parseInt(bond.claim_start_time) / 1_000_000,
      label: 'Claim Start',
      color: now < parseInt(bond.claim_start_time) / 1_000_000 ? 'grey' : 'success'
    },
    {
      time: parseInt(bond.maturity_date) / 1_000_000,
      label: 'Maturity Date',
      color: now < parseInt(bond.maturity_date) / 1_000_000 ? 'grey' : 'success'
    }
  ].sort((a, b) => a.time - b.time);

  return (
    <Timeline position="alternate" sx={{ 
      '& .MuiTimelineItem-root:before': {
        flex: 0
      }
    }}>
      {dates.map((date, index) => (
        <TimelineItem key={index}>
          <TimelineOppositeContent color="white" sx={{ flex: 0.5 }}>
            {formatDate(date.time * 1_000_000)}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineDot color={date.color} />
            {index < dates.length - 1 && <TimelineConnector />}
          </TimelineSeparator>
          <TimelineContent sx={{ 
            color: 'white',
            flex: 0.5,
            '&.MuiTimelineContent-root': {
              px: 2
            }
          }}>
            {date.label}
            {now >= date.time && now <= dates[index + 1]?.time && (
              <div className="text-yellow-400 text-sm mt-1">(Current)</div>
            )}
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
};

const CountdownTimer = ({ date, renderer }) => {
  return (
    <Countdown 
      date={date}
      renderer={renderer}
    />
  );
};

const BuyBonds = () => {
  const { bondId } = useParams();
  const navigate = useNavigate();
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const [bond, setBond] = useState(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });
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
  const { prices } = useCrypto();
  const { isTestnet, rpc, contractAddress } = useNetwork();
  const [isPurchaseLoading, setIsPurchaseLoading] = useState(false);

  const explorerUrl = isTestnet 
    ? "https://ping.pfc.zone/narwhal-testnet/tx"
    : "https://inbloc.org/migaloo/transactions";

  useEffect(() => {
    fetchBondDetails();
  }, [bondId]);

  const getSigner = async () => {
    try {
      console.log('Getting signer...');
      
      if (!window.keplr) {
        throw new Error('Keplr wallet not found');
      }

      const chainId = isTestnet ? "narwhal-2" : "migaloo-1";

      // First enable chain
      await window.keplr.enable(chainId);
      console.log('Keplr enabled for chain:', chainId);

      // Then get the signer
      const offlineSigner = await window.keplr.getOfflineSigner(chainId);
      console.log('Got offline signer');

      // Verify we have accounts
      const accounts = await offlineSigner.getAccounts();
      console.log('Got accounts:', accounts);
      
      if (!accounts?.length) {
        throw new Error('No accounts found - please connect wallet first');
      }

      return offlineSigner;
    } catch (error) {
      console.error('Error getting signer:', error);
      // Don't throw error for bond viewing
      return null;
    }
  };

  const queryContract = async (message) => {
    try {
      const signer = await getSigner();
      // Create client without signer if not available
      const client = signer 
        ? await SigningCosmWasmClient.connectWithSigner(rpc, signer)
        : await SigningCosmWasmClient.connect(rpc);

      const queryResponse = await client.queryContractSmart(
        contractAddress,
        message
      );

      return queryResponse;
    } catch (error) {
      console.error("Error querying contract:", error);
      if (!error.message.includes('No bond purchase found') && !error.message.includes('Invalid type')) {
        throw error;
      }
      return null;
    }
  };

  const fetchBondDetails = async () => {
    try {
      setIsLoading(true);
      const queryMsg = { get_bond_offer: { bond_id: parseInt(bondId) } };
      const result = await queryContract(queryMsg);
      
      if (!result || !result.bond_offer) {
        throw new Error('Invalid response format from contract');
      }
      
      console.log('Fetched bond details:', result);
      setBond(result.bond_offer);
    } catch (error) {
      console.error("Error fetching bond details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTokenSymbol = (denom) => {
    return tokenMappings[denom]?.symbol || denom;
  };

  const getBondStatus = (bond) => {
    const now = Math.floor(Date.now() / 1000);
    const startTime = Math.floor(parseInt(bond.purchase_start_time) / 1_000_000_000);
    const endTime = Math.floor(parseInt(bond.purchase_end_time) / 1_000_000_000);
    const claimStartTime = Math.floor(parseInt(bond.claim_start_time) / 1_000_000_000);
    const maturityDate = Math.floor(parseInt(bond.maturity_date) / 1_000_000_000);

    if (now < startTime) return "Upcoming";
    if (now >= startTime && now <= endTime) return "Active";
    if (now > endTime && now < claimStartTime) return "Ended";
    if (now >= claimStartTime && now < maturityDate) return "Claim Start";
    return "Matured";
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

  // const fetchUserBonds = async (address) => {
  //   try {
  //     const queryMsg = { 
  //       get_bonds_by_user: { 
  //         buyer: address 
  //       } 
  //     };
  //     const result = await queryContract(queryMsg);
  //     console.log('User bonds:', result);
  //     setUserBonds(result.bond_purchases || []);
  //   } catch (error) {
  //     console.error("Error fetching user bonds:", error);
  //     showAlert(`Error fetching user bonds: ${error.message}`, "error");
  //   }
  // };

  const queryNFTContract = async (contractAddress, message) => {
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      const queryResponse = await client.queryContractSmart(
        contractAddress,
        message
      );
      return queryResponse;
    } catch (error) {
      console.error("Error querying NFT contract:", error);
      throw error;
    }
  };

  const fetchUserBondPurchase = async (address) => {
    if (!address || !bondId) return;

    try {
      console.log('🔍 Starting user bond purchase fetch for:', {
        address,
        bondId
      });
      
      let allPurchases = new Map();
      let startAfter = null;
      const limit = 10;
      let hasMore = true;
      
      while (hasMore) {
        try {
          const message = {
            get_bonds_by_user: {
              buyer: address,
              limit: limit,
              ...(startAfter && { start_after: startAfter })
            }
          };

          console.log('📤 Querying bonds with:', message);
          const response = await queryContract(message);
          console.log('📥 Raw bonds response:', response);
          
          if (!response?.pairs || response.pairs.length === 0) {
            console.log('No more results found');
            hasMore = false;
            break;
          }

          // Filter for matching bondId
          const matchingPairs = response.pairs.filter(pair => pair.bond_id === parseInt(bondId));

          // Fetch NFT info for each matching pair using shared cache
          const purchasePromises = matchingPairs.map(async pair => {
            try {
              // Skip if we already have this NFT token ID
              if (allPurchases.has(pair.nft_id)) {
                return null;
              }

              const nftInfo = await getNFTInfo(pair.contract_addr, pair.nft_id, rpc);
              console.log(`📥 NFT info for token ${pair.nft_id}:`, nftInfo);

              // Extract attributes
              const attributes = nftInfo.extension.attributes.reduce((acc, attr) => {
                acc[attr.trait_type] = attr.value;
                return acc;
              }, {});

              return {
                bond_id: pair.bond_id,
                nft_token_id: pair.nft_id,
                contract_address: pair.contract_addr,
                amount: attributes.amount,
                claimed_amount: attributes.claimed_amount,
                purchase_time: attributes.purchase_time,
                status: attributes.status
              };
            } catch (error) {
              console.error(`Error fetching NFT info for token ${pair.nft_id}:`, error);
              return null;
            }
          });

          const bondPurchases = (await Promise.all(purchasePromises)).filter(Boolean);
          
          // Add to Map using NFT token ID as key to prevent duplicates
          bondPurchases.forEach(purchase => {
            allPurchases.set(purchase.nft_token_id, purchase);
          });
          
          // Update startAfter for next iteration if we got a full page
          if (response.pairs.length === limit) {
            startAfter = response.pairs[response.pairs.length - 1].nft_id;
          } else {
            hasMore = false;
          }
          
        } catch (error) {
          console.error('Loop iteration error:', error);
          if (!error.message.includes('No bond purchase found')) {
            console.warn('Query error:', error);
          }
          hasMore = false;
          break;
        }
      }

      // Convert Map values to array for state update
      const uniquePurchases = Array.from(allPurchases.values());
      console.log('✅ Final filtered purchases:', uniquePurchases);
      setUserBondPurchase(uniquePurchases);

    } catch (error) {
      console.error("Error fetching user bond purchase:", error);
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

    setShowConfirmModal(false);
    setIsPurchaseLoading(true);

    try {
      const result = await executePurchase();
      
      // Reset states
      setIsPurchaseLoading(false);
      setPurchaseAmount('');
      
      if (result?.transactionHash) {
        const txnUrl = `${explorerUrl}/${result.transactionHash}`;
        showAlert(
          `Purchase successful! Transaction Hash: ${result.transactionHash}`,
          "success",
          `<a href="${txnUrl}" target="_blank" class="text-yellow-300 hover:text-yellow-400">View Transaction</a>`
        );

        // Add a small delay before refreshing data
        setTimeout(async () => {
          await Promise.all([
            fetchBondDetails(),
            connectedWalletAddress ? fetchUserBondPurchase(connectedWalletAddress) : null,
            connectedWalletAddress && bond?.purchasing_denom ? 
              fetchUserBalance(connectedWalletAddress, bond.purchasing_denom) : null,
            checkBalances()
          ].filter(Boolean));
        }, 1000); // 1 second delay
      }

    } catch (error) {
      console.error("Purchase error:", error);
      showAlert(error.message || "Failed to purchase bond", "error");
      setIsPurchaseLoading(false);
    }
  };

  const executePurchase = async () => {
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

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        purchaseMsg,
        fee,
        `Purchase Bond: ${bondId}`,
        funds
      );

      return result;
    } catch (error) {
      console.error("Error purchasing bond:", error);
      throw error;
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
      // Refresh the page when the countdown completes
      window.location.reload();
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

      // Use standard gas configuration
      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

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
              <a href="${txnUrl}" target="_blank" class="text-yellow-300 hover:text-yellow-300">View Transaction</a>
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
    const purchaseEndTime = Math.floor(parseInt(bond.purchase_end_time) / 1_000_000_000);
    const hasRemainingSupply = parseInt(bond.remaining_supply) > 0;
    
    // Add check for bond issuer
    const isIssuer = connectedWalletAddress === bond.issuer;
    
    return connectedWalletAddress && 
           now > purchaseEndTime && 
           hasRemainingSupply && 
           !bond.closed && 
           isIssuer;
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

  const handleClaim = async (bondId, nftId, index, e) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (!connectedWalletAddress) {
      showAlert("Please connect your wallet first", "error");
      return;
    }

    try {
      setClaimingStates(prev => ({ ...prev, [index]: true }));
      
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const message = {
        claim_rewards: {
          bond_id: parseInt(bondId),
          nft_token_id: nftId
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        message,
        fee,
        `Claim Bond Rewards - Token ID: ${nftId}`
      );

      if (result.transactionHash) {
        // Invalidate the NFT cache for this token
        const purchase = userBondPurchase.find(p => p.nft_token_id === nftId);
        if (purchase) {
          invalidateNFTCache(purchase.contract_address, nftId);
        }

        const txnUrl = `${explorerUrl}/${result.transactionHash}`;
        showAlert(
          "Successfully claimed bond rewards!",
          "success",
          `<a href="${txnUrl}" target="_blank" class="text-yellow-300 hover:text-yellow-400">View Transaction</a>`
        );
        
        // Refresh the data
        await fetchUserBondPurchase(connectedWalletAddress);
      }
    } catch (error) {
      console.error("Error claiming bond:", error);
      showAlert(error.message || "Failed to claim bond rewards", "error");
    } finally {
      setClaimingStates(prev => ({ ...prev, [index]: false }));
    }
  };

  // Update this function to enforce 6 decimal places
  const handlePurchaseAmountChange = (e) => {
    const value = e.target.value;
    // Regex to allow only positive numbers with up to 6 decimal places
    const regex = /^\d*\.?\d{0,6}$/;
    
    if (value === '' || regex.test(value)) {
      setPurchaseAmount(value);
    }
  };

  const calculateDiscount = useCallback((bond) => {
    if (!bond || !prices) return null;

    // Convert denoms to lowercase and handle special testnet case
    let listTokenDenom = tokenMappings[bond.token_denom]?.symbol?.toLowerCase() || bond.token_denom?.toLowerCase();
    let saleTokenDenom = tokenMappings[bond.purchase_denom]?.symbol?.toLowerCase() || bond.purchase_denom?.toLowerCase();
    
    // Map daoOphir to ophir for price lookup
    if (listTokenDenom?.includes('daoophir')) {
      listTokenDenom = 'ophir';
    }
    if (saleTokenDenom?.includes('daoophir')) {
      saleTokenDenom = 'ophir';
    }
    
    // Get prices from context
    const listTokenPrice = prices[listTokenDenom];
    const saleTokenPrice = prices[saleTokenDenom];

    if (!listTokenPrice || !saleTokenPrice) return null;

    // Calculate using the formula:
    // ((Bond Price * Sale Token Market Price) - List Token Market Price) / List Token Market Price
    const bondPriceInUSD = parseFloat(bond.price) * saleTokenPrice;
    const discount = ((bondPriceInUSD - listTokenPrice) / listTokenPrice) * 100;
    
    return discount;
  }, [prices]); // Add prices as a dependency

  if (isLoading) {
    return (
      <div className="global-bg-new flex flex-col justify-center items-center h-screen">
        <div className="text-white mb-4">Fetching Bond Data...</div>
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  if (!bond && !isLoading) {
    return (
      <div className="global-bg-new flex flex-col justify-center items-center h-screen">
        <div className="text-white mb-4">Bond not found</div>
        <button
          onClick={() => navigate('/bonds')}
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
        >
          Return to Bonds
        </button>
      </div>
    );
  }

  const bondSymbol = bond.token_denom ? formatBondDenom(getTokenSymbol(bond.token_denom)) : '';
  const purchasingSymbol = bond.purchase_denom ? formatBondDenom(getTokenSymbol(bond.purchase_denom)) : '';

  const handleGoBack = () => {
    window.history.back();
  };

  const isBondActive = getBondStatus(bond) === "Active";

  const getTokenImage = (denom) => {
    if (!denom) return tokenImages['default'];
    
    // Get the symbol from tokenMappings first
    const tokenInfo = tokenMappings[denom];
    const symbol = tokenInfo?.symbol?.toLowerCase() || denom.toLowerCase();
    
    // Handle daoOphir case
    if (symbol.includes('daoophir')) {
      return tokenImages['ophir'];
    }
    
    // For all other cases, try to find the image using the symbol
    return tokenImages[symbol] || tokenImages['default'];
  };


  return (
    <div className={`global-bg-new pb-1 text-white min-h-screen w-full transition-all duration-300 ease-in-out ${
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
            className="back-button flex items-center text-sm md:text-base text-gray-300 hover:text-white transition duration-300"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back
          </button>
        </div>

        <h1 className="text-xl md:text-3xl font-bold mb-4 md:mb-8 h1-color">
          {bond?.bond_name ? `${bond.bond_name} Details` : 'Bond Details'}
        </h1>

        <div className="bond-buy backdrop-blur-sm rounded-lg p-3 md:p-8 mb-4 shadow-xl border border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Bond Type:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond?.bond_type ? bond.bond_type.charAt(0).toUpperCase() + bond.bond_type.slice(1).toLowerCase() : 'N/A'}
              </p>
            </div>

            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Bond ID:</p>
              <p className="text-sm md:text-xl font-bold text-center">{bond?.bond_id || 'N/A'}</p>
            </div>
            
            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Status:</p>
              <p className="text-sm md:text-xl font-bold text-center">{bond ? getBondStatus(bond) : 'N/A'}</p>
            </div>

            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Total Supply:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond ? `${formatAmount(bond.total_amount)} ${bondSymbol}` : 'N/A'}
              </p>
            </div>

            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Bond Price:</p>
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

            {calculateDiscount(bond) !== null && (
              <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
                <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Markup:</p>
                <div className="flex items-center justify-center">
                  <span className={`text-sm md:text-xl font-bold ${
                    calculateDiscount(bond) < 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {Math.abs(calculateDiscount(bond)).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}%
                    <span className="text-xs md:text-sm ml-1">
                      {calculateDiscount(bond) < 0 ? 'Discount' : 'Premium'}
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Maker Fee Rate:</p>
              <div className="flex items-center justify-center">
                <span className="text-sm md:text-xl font-bold">
                  {bond?.maker_fee_rate ? `${(parseFloat(bond.maker_fee_rate) * 100).toFixed(2)}%` : 
                   bond?.fee_rate ? `${(parseFloat(bond.fee_rate) * 0.7 * 100).toFixed(2)}%` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Taker Fee Rate:</p>
              <div className="flex items-center justify-center">
                <span className="text-sm md:text-xl font-bold">
                  {bond?.taker_fee_rate ? `${(parseFloat(bond.taker_fee_rate) * 100).toFixed(2)}%` : 
                   bond?.fee_rate ? `${(parseFloat(bond.fee_rate) * 0.3 * 100).toFixed(2)}%` : 'N/A'}
                </span>
              </div>
            </div>

            {/* <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Purchase End:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond?.purchase_end_time ? formatDate(bond.purchase_end_time) : 'N/A'}
              </p>
            </div>

            <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
              <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Maturity Date:</p>
              <p className="text-sm md:text-xl font-bold text-center">
                {bond?.claim_end_time ? formatDate(bond.claim_end_time) : 'N/A'}
              </p>
            </div> */}

            {bond?.description && (
              <div className="col-span-2 p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
                <p className="text-gray-400 text-xs mb-0.5 md:mb-1">Description:</p>
                <p className="text-sm md:text-base">{bond.description}</p>
              </div>
            )}

          </div>
          
          <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-yellow-400">Bond Timeline</h3>
            <div className="overflow-x-auto">
              <BondTimeline bond={bond} />
            </div>
          </div>
          
          <div className="col-span-2 mt-4 md:mt-6">
            <p className="text-gray-400 text-xs md:text-sm mb-2">Bond Sale Progress:</p>
            <div className="flex items-center p-3 bond-buy-text-container md:p-4 bg-gray-900/50 rounded-lg">
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
                  Sold: <span className="text-yellow-300 font-bold">
                    {bond ? `${formatAmount(bond.total_amount - bond.remaining_supply)} ${bondSymbol}` : 'N/A'}
                  </span>
                </p>
                <p className="text-xs md:text-sm">
                  Remaining: <span className="text-yellow-300 font-bold">
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

        {isBondActive && (
          <div className="bond-buy backdrop-blur-sm rounded-lg p-4 md:p-8 shadow-xl border border-gray-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-2xl font-bold text-yellow-400 mb-2 sm:mb-0">Purchase Bond</h2>
              <div className="flex flex-col items-start sm:items-end">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-400">Price:</span>
                  <span className="text-base sm:text-lg font-bold">{bond?.price || 'N/A'}</span>
                  <div className="flex items-center">
                    <span className="text-base sm:text-lg">{purchasingSymbol}</span>
                    <img 
                      src={getTokenImage(purchasingSymbol)} 
                      alt={purchasingSymbol}
                      className="w-4 h-4 sm:w-5 sm:h-5 ml-2 rounded-full"
                    />
                  </div>
                </div>
                <div className="text-xs text-yellow-300 mt-1">
                  <CountdownTimer
                    date={new Date(Number(bond.purchase_end_time) / 1_000_000)}
                    renderer={({ days, hours, minutes, seconds }) => (
                      <span>
                        Sale ends in: {days}d {hours}h {minutes}m {seconds}s
                      </span>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1 sm:mb-2">
                  Amount ({purchasingSymbol})
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={purchaseAmount}
                    onChange={handlePurchaseAmountChange}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 text-base sm:text-lg rounded-lg bg-gray-900/50 border border-gray-700 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition-all duration-200"
                    placeholder="0.0"
                  />
                  {bond?.purchase_denom && walletBalances[bond.purchase_denom] && (
                    <button 
                      className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 px-2 sm:px-3 py-1 text-xs sm:text-sm bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 rounded-md transition-colors"
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
                  <p className="text-red-500 text-xs sm:text-sm mt-1 sm:mt-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Amount exceeds maximum of {calculateMaxPurchaseAmount(bond).toFixed(6)} {purchasingSymbol}
                  </p>
                )}
              </div>

              <div className="bg-gray-900/30 rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 text-sm sm:text-base">
                {bond?.purchase_denom && walletBalances[bond.purchase_denom] && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Available:</span>
                    <span className="text-yellow-300 font-medium">
                      {walletBalances[bond.purchase_denom]?.toLocaleString(undefined, {
                        minimumFractionDigits: 6,
                        maximumFractionDigits: 6
                      })} {purchasingSymbol}
                    </span>
                  </div>
                )}
                
                {purchaseAmount && bond && calculateDiscount(bond) !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Discount:</span>
                    <span className={`font-medium ${
                      calculateDiscount(bond) < 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {Math.abs(calculateDiscount(bond)).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}%
                      <span className="text-xs ml-1">
                        {calculateDiscount(bond) < 0 ? 'Discount' : 'Premium'}
                      </span>
                    </span>
                  </div>
                )}
                
                {purchaseAmount && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">You Receive:</span>
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
                disabled={!connectedWalletAddress || isPurchaseLoading || !purchaseAmount}
                className="w-full py-3 sm:py-4 mt-3 sm:mt-4 bg-yellow-300 hover:bg-yellow-400 
                  disabled:bg-gray-600 disabled:cursor-not-allowed text-black 
                  text-sm sm:text-base font-bold rounded-lg transition-all duration-300 
                  flex items-center justify-center space-x-2"
              >
                {isPurchaseLoading ? (
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

        {userBondPurchase && userBondPurchase.length > 0 && (
          <div className="bond-buy backdrop-blur-sm rounded-lg p-6 md:p-8 shadow-xl border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-yellow-400">Your Bond Purchases</h2>
            </div>

            <div className="space-y-4">
              {userBondPurchase.map((purchase, index) => {
                const isClaimingThis = claimingStates[index];
                const canClaimNow = canClaimBond(bond?.claim_start_time);
                const isClaimed = purchase.status === "Claimed" || 
                  (purchase.claimed_amount && 
                    parseInt(purchase.claimed_amount) >= parseInt(purchase.amount));
                const isClaimable = canClaimNow && !isClaimed;

                return (
                  <div 
                    key={purchase.nft_token_id}
                    className={`bg-gray-900/50 rounded-lg p-4 border border-gray-700 
                      transition-all duration-300 relative
                      ${isClaimed ? 'opacity-75' : ''}
                      ${isClaimable ? 'shadow-[0_0_15px_-3px_rgba(34,197,94,0.3)]' : ''}`}
                  >
                    {isClaimable && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 
                        animate-pulse shadow-[0_0_8px_2px_rgba(34,197,94,0.6)]"
                      />
                    )}
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm md:text-base font-medium">NFT #{purchase.nft_token_id}</span>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs ${
                        isClaimed ? 'bg-gray-500/20 text-gray-400' : 
                        isClaimable ? 'bg-green-500/20 text-green-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {isClaimed ? 'Claimed' : 
                         isClaimable ? 'Ready to Claim' : 
                         'Pending'}
                      </div>
                    </div>

                    <div className="bg-gray-900/30 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Amount:</span>
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-medium">{formatAmount(purchase.amount)}</span>
                            {bond?.token_denom && (
                              <img
                                src={getTokenImage(bond.token_denom)}
                                alt={getTokenSymbol(bond.token_denom)}
                                className="w-5 h-5 rounded-full"
                              />
                            )}
                          </div>
                          {purchase.claimed_amount && parseInt(purchase.claimed_amount) > 0 && (
                            <span className="text-sm text-gray-400">
                              Claimed: {formatAmount(purchase.claimed_amount)} / {formatAmount(purchase.amount)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Purchase Date:</span>
                        <span className="text-white">{formatDate(purchase.purchase_time)}</span>
                      </div>
                    </div>

                    {!isClaimed && (
                      <button
                        onClick={(e) => handleClaim(bondId, purchase.nft_token_id, index, e)}
                        disabled={isClaimingThis || !canClaimNow}
                        className="w-full py-4 mt-4 bg-yellow-300 hover:bg-yellow-400 
                          disabled:bg-gray-600 disabled:cursor-not-allowed text-black 
                          font-bold rounded-lg transition-all duration-300 flex items-center 
                          justify-center space-x-2"
                      >
                        {isClaimingThis ? (
                          <>
                            <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Claiming...</span>
                          </>
                        ) : canClaimNow ? (
                          'Claim'
                        ) : (
                          `Claim available on ${formatDate(bond?.claim_start_time)}`
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
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
              <Dialog.Title className="text-xl font-bold text-yellow-300 mb-4">
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
              <Dialog.Title className="text-xl font-bold text-yellow-300 mb-4">
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