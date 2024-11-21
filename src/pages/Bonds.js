import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SigningStargateClient } from "@cosmjs/stargate";
import { SigningCosmWasmClient, CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { tokenMappings } from "../utils/tokenMappings";
import { daoConfig } from "../utils/daoConfig";
import { tokenImages } from "../utils/tokenImages";
import BigInt from "big-integer";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import { Link, useNavigate } from "react-router-dom";
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';

const migalooRPC = "https://migaloo-rpc.polkachu.com/";
const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";
const OPHIR_DECIMAL = BigInt(1000000);

const CountdownTimer = ({ targetDate, label }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const difference = targetDate.getTime() - now;

      if (difference <= 0) {
        return 'Ended';
      }

      // Calculate time units
      const years = Math.floor(difference / (1000 * 60 * 60 * 24 * 365));
      const days = Math.floor((difference % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      // More compact format
      if (years > 0) return `${years}y ${days}d`;
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m ${seconds}s`;
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="text-xs text-gray-400">
      {label && <span className="mr-1">{label}</span>}
      {timeLeft}
    </div>
  );
};

const Bonds = () => {
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const navigate = useNavigate();

  const [isTestnet, setIsTestnet] = useState(true);
  const [rpc, setRPC] = useState(migalooTestnetRPC);
  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [bonds, setBonds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [userBonds, setUserBonds] = useState([]);
  const [claimingStates, setClaimingStates] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [denomFilter, setDenomFilter] = useState('all');
  const [showUserBondsOnly, setShowUserBondsOnly] = useState(false);
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false);
  const [isLoadingUserBonds, setIsLoadingUserBonds] = useState(false);
  const maxRetries = 3;

  const contractAddress = isTestnet ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET : daoConfig.BONDS_CONTRACT_ADDRESS;

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const convertContractTimeToDate = (contractTime) => {
    // Convert from nanoseconds to milliseconds by dividing by 1_000_000
    return new Date(parseInt(contractTime) / 1_000_000);
  };

  const getSigner = async () => {
    try {
      if (!window.keplr) {
        throw new Error("Keplr wallet not found. Please install Keplr extension.");
      }

      const chainId = isTestnet ? "narwhal-2" : "migaloo-1";
      
      await window.keplr.enable(chainId);
      const offlineSigner = window.keplr.getOfflineSigner(chainId);
      return offlineSigner;
    } catch (error) {
      console.error("Error getting signer:", error);
      showAlert(error.message, "error");
      throw error;
    }
  };

  const queryContract = async (message) => {
    console.log('🚀 Initiating contract query with message:', message);
    console.log('📍 Contract address:', contractAddress);
    console.log('🔗 RPC endpoint:', rpc);
    
    try {
      const client = await CosmWasmClient.connect(rpc);
      console.log('✅ CosmWasm client connected successfully');
      
      const queryResponse = await client.queryContractSmart(
        contractAddress,
        message
      );
      console.log('📦 Query response:', queryResponse);
      return queryResponse;
      
    } catch (error) {
      console.error('❌ Contract query failed:', {
        error,
        message,
        contractAddress,
        rpc
      });
      throw error;
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const message = { get_all_bond_offers: {} };
      const data = await queryContract(message);
      
      if (data && Array.isArray(data.bond_offers)) {
        const transformedBonds = data.bond_offers.map(offer => ({
          ...offer.bond_offer,
          start_time: convertContractTimeToDate(offer.bond_offer.purchase_start_time),
          end_time: convertContractTimeToDate(offer.bond_offer.purchase_end_time),
          maturity_date: convertContractTimeToDate(offer.bond_offer.maturity_date)
        }));
        setBonds(transformedBonds);
      }
    } catch (error) {
      console.error("Error fetching bonds:", error);
      showAlert("Failed to fetch bonds. Please try again later.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserBonds = async (retry = 0) => {
    if (!connectedWalletAddress || !bonds.length) return;

    try {
      setIsLoadingUserBonds(true);
      console.log('🔍 Starting user bonds fetch for:', connectedWalletAddress);
      console.log('📊 Current bonds:', bonds);
      console.log('🔄 Retry attempt:', retry);
      
      // Try primary method first
      try {
        const message = { 
          get_bonds_by_user: { 
            buyer: connectedWalletAddress
          } 
        };
        
        console.log('📤 Attempting primary query:', message);
        const data = await queryContract(message);
        
        if (data && Array.isArray(data.bond_purchases)) {
          console.log('✅ Primary query successful:', data);
          const transformedBonds = data.bond_purchases.map(purchase => ({
            ...purchase,
            purchase_time: convertContractTimeToDate(purchase.purchase_time),
            amount: purchase.amount,
            claimed_amount: purchase.claimed_amount,
            bond_id: purchase.bond_id,
          }));
          setUserBonds(transformedBonds);
          setInitialLoadAttempted(true);
          return;
        }
      } catch (primaryError) {
        console.log('⚠️ Primary query failed, proceeding to backup method');
      }
      
      // Backup method
      console.log('🔄 Starting backup method...');
      const allBondPurchases = [];
      const fetchPromises = [];

      // Create array of promises for parallel execution
      bonds.forEach(bond => {
        const backupMessage = {
          get_bond_purchase: {
            bond_id: parseInt(bond.bond_id),
            buyer: connectedWalletAddress
          }
        };
        
        const fetchPromise = queryContract(backupMessage)
          .then(bondData => {
            if (bondData && Array.isArray(bondData.bond_purchases)) {
              return bondData.bond_purchases.map(purchase => ({
                ...purchase,
                purchase_time: convertContractTimeToDate(purchase.purchase_time),
                amount: purchase.amount,
                claimed_amount: purchase.claimed_amount,
                bond_id: bond.bond_id,
              }));
            }
            return [];
          })
          .catch(error => {
            if (!error.message.includes('No bond purchase found')) {
              console.warn(`Failed to fetch purchases for bond ${bond.bond_id}:`, error);
            }
            return [];
          });

        fetchPromises.push(fetchPromise);
      });

      // Wait for all queries to complete
      const results = await Promise.all(fetchPromises);
      
      // Combine all results
      results.forEach(bondPurchases => {
        allBondPurchases.push(...bondPurchases);
      });

      console.log('🎯 Backup method results:', allBondPurchases);
      
      if (allBondPurchases.length > 0) {
        setUserBonds(allBondPurchases);
        setInitialLoadAttempted(true);
      } else {
        console.log('ℹ️ No bond purchases found for user');
        setUserBonds([]);
        setInitialLoadAttempted(true);
      }

    } catch (error) {
      console.error('❌ Bond fetch failed completely:', error);
      
      // Implement retry logic
      if (retry < maxRetries) {
        console.log(`🔄 Retrying... Attempt ${retry + 1} of ${maxRetries}`);
        // Exponential backoff
        setTimeout(() => {
          fetchUserBonds(retry + 1);
        }, Math.min(1000 * Math.pow(2, retry), 8000));
      } else {
        console.error('❌ Max retries reached');
        setUserBonds([]);
        setInitialLoadAttempted(true);
      }
    } finally {
      setIsLoadingUserBonds(false);
    }
  };

  useEffect(() => {
    const initializeUserBonds = async () => {
      if (connectedWalletAddress && bonds.length > 0 && !initialLoadAttempted) {
        await fetchUserBonds();
      }
    };

    initializeUserBonds();
  }, [connectedWalletAddress, bonds, initialLoadAttempted]);

  useEffect(() => {
    const updateUserBonds = async () => {
      if (connectedWalletAddress && bonds.length > 0 && initialLoadAttempted && !isLoadingUserBonds) {
        await fetchUserBonds();
      }
    };

    updateUserBonds();
  }, [connectedWalletAddress, bonds]);

  useEffect(() => {
    const rpcEndpoint = isTestnet ? migalooTestnetRPC : migalooRPC;
    setRPC(rpcEndpoint);
  }, [isTestnet]);

  useEffect(() => {
    fetchData();
    if (connectedWalletAddress) {
      fetchUserBonds();
    }
  }, [rpc, connectedWalletAddress]);

  const getTokenSymbol = (denom) => {
    if (!denom) return '';
    return tokenMappings[denom]?.symbol || denom;
  };

  const getTokenImage = (denom) => {
    const token = tokenMappings[denom] || denom;
    return tokenImages[token];
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const isSoldOut = (remainingSupply) => {
    if (!remainingSupply) return false;
    return parseInt(remainingSupply) / OPHIR_DECIMAL < 0.00001;
  };

  const getBondStatus = useCallback((bond) => {
    if (!bond) return 'UNKNOWN';
    
    const now = new Date();
    
    if (!bond.start_time) return 'UNKNOWN';
    
    if (now < bond.start_time) {
      return 'Upcoming';
    }
    
    
    if (isSoldOut(bond.remaining_supply)) {
      return 'Sold Out';
    }
    
    if (now >= bond.start_time && now <= bond.end_time) {
      return 'Active';
    }
    
    if (now > bond.end_time && now <= bond.maturity_date) {
      return 'Ended';
    }
    
    return 'Matured';
  }, []);

  const handleBondClick = (bondId) => {
    if (!bondId) return;
    navigate(`/bonds/${bondId}`);
  };

  const sortedBonds = useMemo(() => {
    let sortableBonds = [...bonds];
    
    sortableBonds.sort((a, b) => {
      const statusOrder = { 
        'Upcoming': 0, 
        'Active': 1, 
        'Sold Out': 2, 
        'Ended': 3,
        'Matured': 4  // Matured status will always be last
      };
      const statusA = getBondStatus(a);
      const statusB = getBondStatus(b);
      
      // First compare by status
      if (statusOrder[statusA] !== statusOrder[statusB]) {
        return statusOrder[statusA] - statusOrder[statusB];
      }
      
      // If statuses are the same, apply the user's sort configuration
      if (sortConfig.key !== null) {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
      }
      return 0;
    });

    return sortableBonds;
  }, [bonds, sortConfig, getBondStatus]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (columnName) => {
    if (sortConfig.key === columnName) {
      return sortConfig.direction === 'ascending' 
        ? <ChevronUpIcon className="w-4 h-4 inline-block ml-1" />
        : <ChevronDownIcon className="w-4 h-4 inline-block ml-1" />;
    }
    return null;
  };

  const getUniquePurchaseDenoms = useMemo(() => {
    const denoms = new Set(bonds.map(bond => bond.purchase_denom));
    return Array.from(denoms);
  }, [bonds]);

  const filteredBonds = useMemo(() => {
    return sortedBonds.filter((bond) => {
      const status = getBondStatus(bond);
      const matchesStatus = statusFilter === 'all' || status.toLowerCase() === statusFilter.toLowerCase();
      const matchesDenom = denomFilter === 'all' || bond.purchase_denom === denomFilter;
      const matchesUserBonds = !showUserBondsOnly || 
        userBonds.some(userBond => userBond.bond_id === bond.bond_id);

      return matchesStatus && matchesDenom && matchesUserBonds;
    });
  }, [sortedBonds, statusFilter, denomFilter, showUserBondsOnly, userBonds, getBondStatus]);

  const formatAmount = (amount, isPrice = false) => {
    if (!amount) return '0';
    
    try {
      const num = isPrice 
        ? parseFloat(amount)
        : parseInt(amount) / OPHIR_DECIMAL;
      
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6
      });
    } catch (error) {
      console.error("Error formatting amount:", error);
      return '0';
    }
  };

  const BondCard = ({ bond }) => {
    if (!bond) return null;

    const bondSymbol = getTokenSymbol(bond.token_denom);
    const purchasingSymbol = getTokenSymbol(bond.purchase_denom);
    const status = getBondStatus(bond);
    const bondImage = getTokenImage(bondSymbol);
    const purchasingImage = getTokenImage(purchasingSymbol);
    const isMatured = status === 'Matured';
    
    return (
      <div 
        className={`backdrop-blur-sm rounded-xl p-6 mb-4 cursor-pointer 
          transition duration-300 shadow-lg hover:shadow-xl 
          border border-gray-700/50 hover:border-gray-600/50
          ${isMatured 
            ? 'bg-red-900/10 hover:bg-red-800/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]' 
            : 'bg-gray-800/80 hover:bg-gray-700/80'
          }`}
        onClick={() => handleBondClick(bond.bond_id)}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center">
            {bondImage && (
              <div className="w-10 h-10 rounded-full mr-3 overflow-hidden shadow-md">
                <img src={bondImage} alt={bondSymbol} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">{bond.bond_name || 'Unknown Bond'}</h3>
              {/* <div className="text-sm text-gray-400">{bond.bond_id}</div> */}
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm ${
            status === 'Active' ? 'bg-green-500/20 text-green-400 flex flex-col items-center' :
            status === 'Sold Out' ? 'bg-red-500/20 text-red-400' :
            status === 'Upcoming' ? 'bg-blue-500/20 text-blue-400 flex flex-col items-center' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {status}
            {(status === 'Upcoming' || status === 'Active') && (
              <CountdownTimer 
                targetDate={status === 'Upcoming' ? bond.start_time : bond.end_time} 
                label={status === 'Active' ? 'Ends in:' : undefined}
              />
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Total Supply</span>
            <span className="font-medium">{formatAmount(bond.total_amount)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Remaining</span>
            {isSoldOut(bond.remaining_supply) ? (
              <span className="text-red-400 font-medium">Sold Out</span>
            ) : (
              <span className="font-medium">{formatAmount(bond.remaining_supply)}</span>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Bond Price</span>
            <div className="flex items-center">
              <span className="font-medium mr-2">
                {formatAmount(bond.price, true)} {purchasingSymbol}
              </span>
              {purchasingImage && (
                <div className="w-5 h-5 rounded-full overflow-hidden">
                  <img src={purchasingImage} alt={purchasingSymbol} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-gray-400">
              {status === 'Upcoming' ? 'Opens' : 'Maturity Date'}
            </span>
            <span className="font-medium">
              {status === 'Upcoming' 
                ? formatDate(bond.start_time)
                : formatDate(bond.maturity_date)
              }
            </span>
          </div>
        </div>

        {bond.immediate_claim && (
          <div className="mt-4 text-sm text-green-400 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Immediate Claim Available
          </div>
        )}

        {bond.description && (
          <div className="mt-4 text-sm text-gray-400 border-t border-gray-700/50 pt-4">
            {bond.description}
          </div>
        )}
      </div>
    );
  };

  const canWithdraw = (bond) => {
    if (!bond) return false;
    const now = new Date();
    const maturityDate = new Date(parseInt(bond.maturity_date) / 1_000_000);
    return now >= maturityDate;
  };

  const handleWithdraw = async (bondId) => {
    try {
      if (!connectedWalletAddress) {
        showAlert("Please connect your wallet first", "error");
        return;
      }

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const withdrawMsg = {
        withdraw_bond: {
          bond_id: parseInt(bondId)
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        withdrawMsg,
        fee,
        "Withdraw Bond"
      );

      if (result.transactionHash) {
        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Bond withdrawn successfully!`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction</a>`
        );
        
        // Refresh data
        await fetchData();
      }
    } catch (error) {
      console.error("Error withdrawing bond:", error);
      showAlert(`Error withdrawing bond: ${error.message}`, "error");
    }
  };

  const renderBondTable = () => {
    if (!Array.isArray(filteredBonds) || filteredBonds.length === 0) {
      return <div>No bonds available</div>;
    }

    return (
      <table className="w-full">
        <thead>
          <tr className="bond-table-header">
            <th className="bond-table-left-border-radius text-left pl-4 py-2 w-1/4 cursor-pointer" onClick={() => requestSort('bond_denom_name')}>
              <span className="flex items-center">
                Bond Name {renderSortIcon('bond_denom_name')}
              </span>
            </th>
            <th className="text-center py-2 w-1/6 cursor-pointer" onClick={() => requestSort('status')}>
              <span className="flex items-center justify-center">
                Status {renderSortIcon('status')}
              </span>
            </th>
            <th className="text-center py-2 w-1/6 cursor-pointer" onClick={() => requestSort('total_amount')}>
              <span className="flex items-center justify-center">
                Total Supply {renderSortIcon('total_amount')}
              </span>
            </th>
            <th className="text-center py-2 w-1/6 cursor-pointer" onClick={() => requestSort('price')}>
              <span className="flex items-center justify-center">
                Bond Price {renderSortIcon('price')}
              </span>
            </th>
            <th className="text-center py-2 w-1/4 cursor-pointer" onClick={() => requestSort('maturity_date')}>
              <span className="flex items-center justify-center">
                {sortConfig.key === 'start_time' ? 'Start Date' : 'Maturity Date'} {renderSortIcon('maturity_date')}
              </span>
            </th>
            <th className="bond-table-right-border-radius w-12"></th>
          </tr>
        </thead>
        <tbody>
          {filteredBonds.map((bond) => {
            if (!bond) return null;
            
            const bondSymbol = getTokenSymbol(bond.token_denom);
            const purchasingSymbol = getTokenSymbol(bond.purchase_denom);
            const bondImage = getTokenImage(bondSymbol);
            const purchasingImage = getTokenImage(purchasingSymbol);
            const status = getBondStatus(bond);
            const isMatured = status === 'Matured';

            return (
              <tr 
                key={bond.bond_id}
                className={`border-b border-gray-800 cursor-pointer transition duration-300
                  ${isMatured 
                    ? 'bg-red-900/10 hover:bg-red-800/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]' 
                    : 'hover:bg-gray-700'
                  }`}
                onClick={(e) => {
                  // Prevent navigation if clicking action buttons
                  if (e.target.tagName === 'BUTTON') {
                    e.stopPropagation();
                    return;
                  }
                  handleBondClick(bond.bond_id);
                }}
              >
                <td className="py-4 pl-4">
                  <div className="flex items-center">
                    {bondImage && (
                      <div className="w-8 h-8 rounded-full mr-2 overflow-hidden">
                        <img src={bondImage} alt={bondSymbol} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div>
                      {bond.bond_name || 'Unknown Bond'}
                      {bond.immediate_claim && <span className="ml-2 text-green-400 text-sm">(Immediate)</span>}
                    </div>
                  </div>
                </td>
                <td className="py-4 text-center">
                  <div className="flex flex-col items-center">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      status === 'Active' ? 'bg-green-500/20 text-green-400' :
                      status === 'Sold Out' ? 'bg-red-500/20 text-red-400' :
                      status === 'Upcoming' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {status}
                    </span>
                    {(status === 'Upcoming' || status === 'Active') && (
                      <CountdownTimer 
                        targetDate={status === 'Upcoming' ? bond.start_time : bond.end_time}
                        label={status === 'Active' ? 'Ends in:' : undefined}
                      />
                    )}
                  </div>
                </td>
                <td className="py-4 text-center">
                  <div className="flex items-center justify-center">
                    <span className="mr-2">{formatAmount(bond.total_amount)}</span>
                    {bondImage && (
                      <div className="w-5 h-5 rounded-full overflow-hidden">
                        <img src={bondImage} alt={bondSymbol} className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    {isSoldOut(bond.remaining_supply) ? (
                      <span className="text-red-500">Sold Out</span>
                    ) : (
                      `Remaining: ${formatAmount(bond.remaining_supply)}`
                    )}
                  </div>
                </td>
                <td className="py-4">
                  <div className="flex items-center justify-center">
                    <span className="mr-2">{formatAmount(bond.price, true)} {purchasingSymbol}</span>
                    {purchasingImage && (
                      <div className="w-5 h-5 rounded-full overflow-hidden">
                        <img src={purchasingImage} alt={purchasingSymbol} className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-4 text-center">
                  {status === 'Upcoming' 
                    ? formatDate(bond.start_time)
                    : formatDate(bond.maturity_date)
                  }
                </td>
                <td className="py-4 text-center pr-2 pl-2">
                  <div className="flex items-center justify-end space-x-2">
                    {canWithdraw(bond) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWithdraw(bond.bond_id);
                        }}
                        className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 
                          hover:bg-green-500/30 rounded-md transition-colors"
                        title="Withdraw matured bonds"
                      >
                        Withdraw
                      </button>
                    )}
                    <button 
                      className="text-gray-400 hover:text-white transition duration-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBondClick(bond.bond_id);
                      }}
                    >
                      →
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const handleClaim = async (bondId, nftTokenId, purchaseIndex) => {
    // Create a unique key combining bondId and purchaseIndex
    const claimKey = `${bondId}_${purchaseIndex}`;
    
    try {
      setClaimingStates(prev => ({ ...prev, [claimKey]: true }));

      if (!connectedWalletAddress) {
        showAlert("Please connect your wallet first", "error");
        return;
      }

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const claimMsg = {
        claim_rewards: {
          bond_id: parseInt(bondId),
          nft_token_id: nftTokenId
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      console.log('Claiming rewards with:', {
        bondId,
        nftTokenId,
        purchaseIndex,
        claimKey,
        message: claimMsg
      });

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        claimMsg,
        fee,
        "Claim Bond Rewards"
      );

      if (result.transactionHash) {
        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Rewards claimed successfully!`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction</a>`
        );
        
        // Refresh data
        await fetchUserBonds();
      }
    } catch (error) {
      console.error("Error claiming rewards:", error);
      showAlert(`Error claiming rewards: ${error.message}`, "error");
    } finally {
      setClaimingStates(prev => ({ ...prev, [claimKey]: false }));
    }
  };

  const isClaimable = (bond, userBond) => {
    if (!bond || !userBond || !userBond.amount) {
      return false;
    }
    
    // Check if claimed_amount exists and is less than amount
    const hasUnclaimedAmount = !userBond.claimed_amount || 
      parseInt(userBond.amount) > parseInt(userBond.claimed_amount);

    // Check if bond is claimable based on time
    const now = new Date();
    const claimStartDate = convertContractTimeToDate(bond.claim_start_time);
    const isAfterClaimStart = now >= claimStartDate;

    return hasUnclaimedAmount && isAfterClaimStart;
  };

  const canClaim = (bond) => {
    if (!bond) return false;
    
    const now = new Date();
    const claimStartDate = convertContractTimeToDate(bond.claim_start_time);
    return now >= claimStartDate;
  };

  const UserBondsSection = () => {
    if (!connectedWalletAddress || userBonds.length === 0) return null;

    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Bonds</h2>
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {userBonds.map((purchase, index) => {
            const claimKey = `${purchase.bond_id}_${index}`;
            const isClaimingThis = claimingStates[claimKey];
            const bond = bonds.find(b => b.bond_id === purchase.bond_id);
            const isClaimed = purchase.claimed_amount && parseInt(purchase.claimed_amount) > 0;

            return (
              <div 
                key={index} 
                className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 
                  transition-all duration-300 backdrop-blur-sm cursor-pointer"
                onClick={(e) => {
                  // Prevent navigation if clicking the claim button
                  if (e.target.tagName === 'BUTTON') {
                    e.stopPropagation();
                    return;
                  }
                  handleBondClick(purchase.bond_id);
                }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    {bond?.backing_denom && (
                      <img
                        src={getTokenImage(bond.backing_denom)}
                        alt={bond.backing_denom}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <span className="text-lg font-medium">
                      {bond?.bond_name || `Bond #${purchase.bond_id}`}
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    !isClaimed ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {isClaimed ? 'Claimed' : 'Unclaimed'}
                  </span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Amount:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium">{formatAmount(purchase.amount)}</span>
                      {bond?.backing_denom && (
                        <img
                          src={getTokenImage(bond.backing_denom)}
                          alt={bond.backing_denom}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Purchase Date:</span>
                    <span>{formatDate(purchase.purchase_time)}</span>
                  </div>
                </div>

                {isClaimable(bond, purchase) && (
                  <div className="mt-4">
                    <button
                      onClick={() => handleClaim(purchase.bond_id, purchase.nft_token_id, index)}
                      disabled={isClaimingThis}
                      className="w-full landing-button px-4 py-2 rounded-md 
                        transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                        hover:bg-yellow-500 disabled:hover:bg-yellow-500/50"
                    >
                      {isClaimingThis ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Claiming...</span>
                        </div>
                      ) : (
                        'Claim'
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile view */}
        <div className="md:hidden space-y-2">
          {userBonds.map((purchase, index) => {
            const claimKey = `${purchase.bond_id}_${index}`;
            const isClaimingThis = claimingStates[claimKey];
            const bond = bonds.find(b => b.bond_id === purchase.bond_id);
            const isClaimed = purchase.claimed_amount && parseInt(purchase.claimed_amount) > 0;

            return (
              <div 
                key={index} 
                className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 
                  transition-all duration-300 backdrop-blur-sm cursor-pointer"
                onClick={(e) => {
                  // Prevent navigation if clicking the claim button
                  if (e.target.tagName === 'BUTTON') {
                    e.stopPropagation();
                    return;
                  }
                  handleBondClick(purchase.bond_id);
                }}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    {bond?.backing_denom && (
                      <img
                        src={getTokenImage(bond.backing_denom)}
                        alt={bond.backing_denom}
                        className="w-8 h-8 rounded-full"
                      />
                    )}
                    <span className="text-lg font-medium">
                      {bond?.bond_name || `Bond #${purchase.bond_id}`}
                    </span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    !isClaimed ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {isClaimed ? 'Claimed' : 'Unclaimed'}
                  </span>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Amount:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-medium">{formatAmount(purchase.amount)}</span>
                      {bond?.backing_denom && (
                        <img
                          src={getTokenImage(bond.backing_denom)}
                          alt={bond.backing_denom}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Purchase Date:</span>
                    <span>{formatDate(purchase.purchase_time)}</span>
                  </div>
                </div>

                {isClaimable(bond, purchase) && (
                  <div className="mt-4">
                    <button
                      onClick={() => handleClaim(purchase.bond_id, purchase.nft_token_id, index)}
                      disabled={isClaimingThis}
                      className="w-full landing-button px-4 py-2 rounded-md 
                        transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed
                        hover:bg-yellow-500 disabled:hover:bg-yellow-500/50"
                    >
                      {isClaimingThis ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>Claiming...</span>
                        </div>
                      ) : (
                        'Claim'
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const FiltersSection = () => {
    return (
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-700 text-white rounded-md px-3 py-2 border border-gray-600 
              focus:border-yellow-200 focus:outline-none transition duration-300"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="upcoming">Upcoming</option>
            <option value="ended">Ended</option>
            <option value="matured">Matured</option>
            <option value="sold out">Sold Out</option>
          </select>

          {/* Denom filter */}
          <select
            value={denomFilter}
            onChange={(e) => setDenomFilter(e.target.value)}
            className="bg-gray-700 text-white rounded-md px-3 py-2 border border-gray-600 focus:border-yellow-200 focus:outline-none"
          >
            <option value="all">All Payment Methods</option>
            {getUniquePurchaseDenoms.map(denom => (
              <option key={denom} value={denom}>
                Buy with {getTokenSymbol(denom)}
              </option>
            ))}
          </select>

          {/* User bonds filter - only show if user has bonds */}
          {userBonds.length > 0 && (
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showUserBondsOnly}
                onChange={(e) => setShowUserBondsOnly(e.target.checked)}
                className="form-checkbox h-4 w-4 text-yellow-500 rounded border-gray-600 focus:ring-yellow-500"
              />
              <span className="text-white">Show my bonds only</span>
            </label>
          )}
        </div>

        {/* Filter stats */}
        <div className="text-sm text-gray-400">
          Showing {filteredBonds.length} of {bonds.length} bonds
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`global-bg-new text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-10">
        {/* Snackbar for alerts */}
        <Snackbar
          open={alertInfo.open}
          autoHideDuration={6000}
          onClose={() => setAlertInfo({ ...alertInfo, open: false })}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          {alertInfo.htmlContent ? (
            <SnackbarContent
              style={{
                color: "black",
                backgroundColor:
                  alertInfo.severity === "error" ? "#ffcccc" : "#ccffcc",
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

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold h1-color">
            {isTestnet ? "Bonds (Testnet)" : "Bonds"}
          </h1>
          <div className="flex space-x-4 items-center">
            <Link
              to="/bonds/create"
              className="landing-button px-4 py-1.5 rounded-md hover:bg-yellow-500 transition duration-300 text-sm"
            >
              Create Bond
            </Link>
          </div>
        </div>

        <UserBondsSection />

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-[calc(100vh-200px)]">
            <div className="text-white mb-4">Fetching Bond Data...</div>
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400"></div>
          </div>
        ) : (
          <>
            <FiltersSection />

            <div className="hidden md:block">
              {renderBondTable()}
            </div>

            <div className="md:hidden">
              {filteredBonds.map((bond) => (
                <BondCard key={bond.bond_id} bond={bond} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Bonds;