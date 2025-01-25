import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
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
import { nftInfoCache, CACHE_DURATION, batchGetNFTInfo } from '../utils/nftCache';
import { useCrypto } from '../context/CryptoContext';
import { useNetwork } from '../context/NetworkContext';
import NetworkSwitcher from '../components/NetworkSwitcher';
import { useBondCache } from '../context/BondCacheContext';

const migalooRPC = "https://migaloo-rpc.polkachu.com/";
const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";
const OPHIR_DECIMAL = BigInt(1000000);
const BONDS_PER_PAGE = 30; // API max limit is 30

const CountdownTimer = ({ targetDate, label, onEnd, bondId }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const difference = targetDate.getTime() - now;

      if (difference <= 0) {
        if (onEnd) {
          onEnd(bondId);
        }
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
  }, [targetDate, onEnd, bondId]);

  return (
    <div className="text-xs text-gray-400">
      {label && <span className="mr-1">{label}</span>}
      {timeLeft}
    </div>
  );
};

const DiscountTooltip = ({ bondDenom }) => (
  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 
    bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 
    transition-opacity duration-200 whitespace-normal max-w-xs z-10 border border-gray-700">
    <div className="mb-2">
      <span className="text-green-400">Discount</span>: Token is selling below market price
    </div>
    <div>
      <span className="text-red-400">Premium</span>: Token is selling above market price
    </div>
  </div>
);

const SearchBar = ({ value, onChange }) => (
  <div className="flex items-center gap-4 mb-6">
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder="Search bonds..."
        className="w-full bg-gray-800/50 text-white rounded-lg px-4 py-3 pl-10 
          border border-gray-700 focus:border-yellow-500 focus:outline-none
          transition duration-300"
      />
      <svg
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </div>
  </div>
);

const Bonds = () => {
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const { prices } = useCrypto();
  const navigate = useNavigate();
  const { isTestnet, rpc, contractAddress } = useNetwork();
  const { fetchAllBonds, bonds: cachedBonds, isFetching: isCacheFetching } = useBondCache();

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
  const [statusFilter, setStatusFilter] = useState('active');
  const [denomFilter, setDenomFilter] = useState('all');
  const [showUserBondsOnly, setShowUserBondsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false);
  const [isLoadingUserBonds, setIsLoadingUserBonds] = useState(false);
  const maxRetries = 3;
  const [expandedBondGroups, setExpandedBondGroups] = useState(new Set());
  const [hasSetInitialFilter, setHasSetInitialFilter] = useState(false);
  const [refreshingBonds, setRefreshingBonds] = useState({});
  const [claimingAllStates, setClaimingAllStates] = useState({});
  const [nftCollections, setNftCollections] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMoreBonds, setHasMoreBonds] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const convertContractTimeToDate = (contractTime) => {
    try {
      // Ensure contractTime is treated as a string and handle both number and string inputs
      const timeString = contractTime?.toString() || '0';
      
      // Check if the time is already in milliseconds (less than 13 digits)
      if (timeString.length <= 13) {
        return new Date(parseInt(timeString));
      }
      
      // Otherwise, convert from nanoseconds to milliseconds
      return new Date(parseInt(timeString) / 1_000_000);
    } catch (error) {
      console.error('Error converting contract time:', error, contractTime);
      return new Date();
    }
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
        message,
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
      let allBonds = [];
      let hasMore = true;
      
      while (hasMore) {
        // Get the last bond's ID for pagination
        const lastBondId = allBonds.length > 0 
          ? allBonds[allBonds.length - 1].bond_id.toString()
          : undefined;

        const message = {
          get_all_bond_offers: {
            limit: BONDS_PER_PAGE,
            ...(lastBondId && { start_after: lastBondId })
          }
        };

        console.log('Fetching bonds with message:', message);
        const data = await queryContract(message);
        
        if (!data?.bond_offers || data.bond_offers.length === 0) {
          hasMore = false;
          break;
        }

        const transformedBonds = data.bond_offers.map(offer => ({
          ...offer.bond_offer,
          contract_addr: offer.contract_addr,
          start_time: convertContractTimeToDate(offer.bond_offer.purchase_start_time),
          end_time: convertContractTimeToDate(offer.bond_offer.purchase_end_time),
          maturity_date: convertContractTimeToDate(offer.bond_offer.maturity_date)
        }));

        allBonds = [...allBonds, ...transformedBonds];
        console.log(`Fetched ${transformedBonds.length} bonds. Total: ${allBonds.length}`);
        
        // If we got less than the limit, we're done
        hasMore = transformedBonds.length === BONDS_PER_PAGE;
      }

      setBonds(allBonds);

    } catch (error) {
      console.error("Error fetching bonds:", error);
      showAlert("Failed to fetch bonds. Please try again later.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Update the useEffect to prevent infinite loops
  useEffect(() => {
    fetchData();
  }, [contractAddress, rpc]); // Only re-run if contract or RPC changes

  // Add intersection observer for infinite scrolling
  const observerTarget = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMoreBonds && !isFetchingMore && !isLoading) {
          setIsFetchingMore(true); // Set loading state before fetching
          fetchData(page + 1, true);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMoreBonds, isFetchingMore, isLoading, page]);

  const invalidateNFTCache = (contractAddr, tokenId) => {
    const cacheKey = `${contractAddr}_${tokenId}`;
    if (nftInfoCache.has(cacheKey)) {
      console.log('🗑️ Invalidating NFT cache for:', cacheKey);
      nftInfoCache.delete(cacheKey);
    }
  };

  const getNFTInfo = async (contractAddr, tokenId, forceRefresh = false) => {
    // If not forcing refresh, try to get from cache first
    if (!forceRefresh) {
      const cachedData = nftInfoCache.get(contractAddr, tokenId);
      if (cachedData) {
        console.log('📦 Using cached NFT info for:', `${contractAddr}_${tokenId}`);
        return cachedData;
      }
    }

    try {
      const nftClient = await CosmWasmClient.connect(rpc);
      const nftInfo = await nftClient.queryContractSmart(
        contractAddr,
        {
          nft_info: {
            token_id: tokenId
          }
        }
      );
      
      // Cache the result
      nftInfoCache.set(contractAddr, tokenId, nftInfo);
      
      console.log(`📦 Fetched and cached NFT Info for token ${tokenId}:`, nftInfo);
      return nftInfo;
    } catch (error) {
      console.error(`Error fetching NFT info for token ${tokenId}:`, error);
      throw error;
    }
  };

  const getTokenSymbol = (denom) => {
    if (!denom) return '';
    return tokenMappings[denom]?.symbol || denom;
  };

  const getTokenImage = (denom) => {
    let token = tokenMappings[denom]?.symbol || denom;
    // Map daoOphir to ophir for image lookup
    if (token?.toLowerCase().includes('daoophir')) {
      token = 'ophir';
    }
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
        'Active': 0,
        'Upcoming': 1, 
        'Sold Out': 2,
        'Ended': 3,
        'Matured': 4
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
      
      // Add search query filtering
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = searchQuery === '' || 
        bond.bond_name?.toLowerCase().includes(searchLower) ||
        bond.bond_id?.toString().includes(searchLower) ||
        getTokenSymbol(bond.token_denom)?.toLowerCase().includes(searchLower) ||
        getTokenSymbol(bond.purchase_denom)?.toLowerCase().includes(searchLower) ||
        bond.description?.toLowerCase().includes(searchLower);

      return matchesStatus && matchesDenom && matchesUserBonds && matchesSearch;
    });
  }, [sortedBonds, statusFilter, denomFilter, showUserBondsOnly, searchQuery, userBonds, getBondStatus, getTokenSymbol]);

  // Search handler
  const handleSearch = useCallback((e) => {
    setSearchQuery(e.target.value);
  }, []);

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

    // Calculate using the new formula:
    // ((Bond Price * Sale Token Market Price) - List Token Market Price) / List Token Market Price
    const bondPriceInUSD = parseFloat(bond.price) * saleTokenPrice;
    const discount = ((bondPriceInUSD - listTokenPrice) / listTokenPrice) * 100;
    
    return discount;
  }, [prices]);

  const BondCard = ({ bond }) => {
    if (!bond) return null;

    const bondSymbol = getTokenSymbol(bond.token_denom);
    const purchasingSymbol = getTokenSymbol(bond.purchase_denom);
    const status = getBondStatus(bond);
    const bondImage = getTokenImage(bondSymbol);
    const purchasingImage = getTokenImage(purchasingSymbol);
    const isMatured = status === 'Matured';
    const discount = calculateDiscount(bond);
    
    // Get the correct date based on status
    const displayDate = status === 'Upcoming' 
      ? bond.start_time
      : bond.maturity_date || bond.end_time; // Fallback to end_time if maturity_date is not set

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
                onEnd={() => refreshBond(bond.bond_id)}
                bondId={bond.bond_id}
              />
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Total Supply</span>
            <span className="font-medium">
              <ToggleableAmount amount={bond.total_amount} denom={bond.token_denom} />
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Remaining</span>
            {isSoldOut(bond.remaining_supply) ? (
              <span className="text-red-400 font-medium">Sold Out</span>
            ) : (
              <span className="font-medium">
                <ToggleableAmount amount={bond.remaining_supply} denom={bond.token_denom} />
              </span>
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
              {formatDate(displayDate)}
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

        {discount !== null && (
          <div className={`mt-2 text-sm relative group`}>
            <span className={`${
              discount < 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {Math.abs(discount).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}%
              <span className="text-xs ml-1">
                {discount < 0 ? 'Discount' : 'Premium'}
              </span>
            </span>
            <DiscountTooltip bondDenom={getTokenSymbol(bond.token_denom)} />
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
          `<a href="${txnUrl}" target="_blank">View Transaction ${result.transactionHash}</a>`
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
      <>
        <table className="w-full mb-5">
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
              <th className="text-center py-2 w-1/6 relative group">
                <span className="flex items-center justify-center">
                  Markup
                  <DiscountTooltip />
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
              const discount = calculateDiscount(bond);

              // Get the correct date based on status
              const displayDate = bond?.maturity_date ;

              return (
                <tr 
                  key={bond.bond_id}
                  className={`border-b border-gray-800 cursor-pointer transition duration-300
                    ${isMatured 
                      ? 'bg-red-900/10 hover:bg-red-800/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.3)]' 
                      : 'hover:bg-gray-700'
                    }`}
                  onClick={() => handleBondClick(bond.bond_id)}
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
                          onEnd={() => refreshBond(bond.bond_id)}
                          bondId={bond.bond_id}
                        />
                      )}
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <div className="flex items-center justify-center">
                      <ToggleableAmount 
                        amount={bond.total_amount} 
                        denom={bond.token_denom} 
                        className="mr-2"
                      />
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
                    {formatDate(displayDate)}
                  </td>
                  <td className="py-4 text-center">
                    {discount !== null ? (
                      <span className={`${
                        discount < 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {Math.abs(discount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}%
                        <span className="text-xs ml-1">
                          {discount < 0 ? 'Discount' : 'Premium'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
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
        
        {hasMoreBonds && (
          <div 
            ref={observerTarget}
            className="w-full py-4 flex justify-center"
          >
            {isFetchingMore && (
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-400"></div>
            )}
          </div>
        )}
      </>
    );
  };

  const [claimedBonds, setClaimedBonds] = useState(new Set());

  const lastClaimedBondIdRef = useRef(null);

  const isClaimable = (bond, userBond) => {
    if (!bond || !userBond || !userBond.amount) {
      return false;
    }
    
    // Check if the bond is already claimed based on status
    if (userBond.status === "Claimed") {
      console.log(`Bond ${userBond.bond_id} is already fully claimed`);
      return false;
    }

    // Parse the amounts as integers for comparison
    const totalAmount = parseInt(userBond.amount);
    const claimedAmount = parseInt(userBond.claimed_amount || "0");
    
    // Check if claimed_amount exists and is less than amount
    const hasUnclaimedAmount = (totalAmount - claimedAmount) > 0;
    // console.log('Claim check:', {
    //   bondId: userBond.bond_id,
    //   totalAmount,
    //   claimedAmount,
    //   hasUnclaimedAmount,
    //   status: userBond.status
    // });

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

  const toggleGroup = (bondId) => {
    setExpandedBondGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bondId)) {
        newSet.delete(bondId);
      } else {
        newSet.add(bondId);
      }
      return newSet;
    });
  };


  // Add function to check if a bond has matching NFTs in user's collection
  const getBondNFTsInCollection = useCallback((contractAddr) => {
    if (!nftCollections || !contractAddr) return [];
    
    const matchingCollection = nftCollections.find(
      collection => collection.collectionAddress.toLowerCase() === contractAddr.toLowerCase()
    );
    
    return matchingCollection?.tokens || [];
  }, [nftCollections]);

  const UserBondsSection = () => {
    const [activeBondId, setActiveBondId] = useState(null);
    const prevUserBondsRef = useRef(userBonds);

    useEffect(() => {
      if (activeBondId) {
        setExpandedBondGroups(prev => new Set([...prev, activeBondId]));
      }
    }, [userBonds, activeBondId]);

    if (!connectedWalletAddress) return null;

    if (userBonds.length === 0) return null;

    // Group bonds and check for claimable purchases
    const groupedBonds = userBonds.reduce((acc, purchase) => {
      const bond = bonds.find(b => b.bond_id === purchase.bond_id);
      const bondName = bond?.bond_name || `Bond #${purchase.bond_id}`;
      
      if (!acc[purchase.bond_id]) {
        // Get all NFTs in this collection
        const nftsInCollection = getBondNFTsInCollection(purchase.contract_address);
        
        acc[purchase.bond_id] = {
          bondName,
          bondImage: bond?.backing_denom ? getTokenImage(bond.backing_denom) : null,
          purchases: [],
          hasClaimable: false,
          claimableCount: 0,
          totalPurchases: 0,
          claimedCount: 0,
          contract_address: purchase.contract_address,
          first_token_id: purchase.nft_token_id,
          // Add total NFTs in collection
          totalNFTsInCollection: nftsInCollection.length,
          nftIds: nftsInCollection
        };

        // Try to get NFT image asynchronously
        getNFTInfo(purchase.contract_address, purchase.nft_token_id)
          .then(nftInfo => {
            if (nftInfo?.extension?.image) {
              acc[purchase.bond_id].bondImage = nftInfo.extension.image;
              setBonds(prev => [...prev]);
            }
          })
          .catch(error => {
            console.warn('Failed to get NFT image:', error);
          });
      }
      
      // Add debug logs
      console.log(`Checking purchase for bond ${purchase.bond_id}:`, {
        status: purchase.status,
        amount: purchase.amount,
        claimed_amount: purchase.claimed_amount,
        canClaim: canClaim(bond)
      });
      
      // Check if this purchase is claimable
      const isClaimable = canClaim(bond) && 
        purchase.status !== "Claimed" && 
        (!purchase.claimed_amount || 
          parseInt(purchase.amount) > parseInt(purchase.claimed_amount || '0'));
      
      // Update counters
      acc[purchase.bond_id].totalPurchases++;
      if (purchase.status === "Claimed" || 
          (purchase.claimed_amount && parseInt(purchase.claimed_amount) >= parseInt(purchase.amount))) {
        acc[purchase.bond_id].claimedCount++;
      }
      
      if (isClaimable) {
        acc[purchase.bond_id].hasClaimable = true;
        acc[purchase.bond_id].claimableCount++;
      }
      
      // Add debug log for group status
      console.log(`Bond group ${purchase.bond_id} status:`, {
        hasClaimable: acc[purchase.bond_id].hasClaimable,
        claimableCount: acc[purchase.bond_id].claimableCount,
        totalPurchases: acc[purchase.bond_id].totalPurchases,
        claimedCount: acc[purchase.bond_id].claimedCount
      });
      
      acc[purchase.bond_id].purchases.push(purchase);
      return acc;
    }, {});

    // Convert to array and sort by claimable status
    const sortedBondGroups = Object.entries(groupedBonds).sort((a, b) => {
      // Sort by claimable status first
      if (a[1].hasClaimable && !b[1].hasClaimable) return -1;
      if (!a[1].hasClaimable && b[1].hasClaimable) return 1;
      // Then by bond name
      return a[1].bondName.localeCompare(b[1].bondName);
    });
  };

  // Move FiltersSection outside of Bonds component
  const FiltersSection = memo(({ 
    bonds, 
    userBonds, 
    filteredBonds,
    statusFilter,
    setStatusFilter,
    denomFilter,
    setDenomFilter,
    showUserBondsOnly,
    setShowUserBondsOnly,
    getTokenSymbol,
    getUniquePurchaseDenoms,
    getBondStatus,
    isClaimable,
    handleClaimAllBonds
  }) => {
    const [showFilters, setShowFilters] = useState(false);
    const [isClaimingAll, setIsClaimingAll] = useState(false);
    const [claimProgress, setClaimProgress] = useState({
      total: 0,
      current: 0,
      isActive: false
    });

    // Calculate total claimable bonds across all groups
    const totalClaimableBonds = useMemo(() => {
      return userBonds.reduce((total, purchase) => {
        const bond = bonds.find(b => b.bond_id === purchase.bond_id);
        if (isClaimable(bond, purchase)) {
          return total + 1;
        }
        return total;
      }, 0);
    }, [userBonds, bonds, isClaimable]);

    return (
      <div className="mb-6 space-y-4">
        {totalClaimableBonds > 0 && (
          <button
            onClick={handleClaimAllBonds}
            disabled={isClaimingAll}
            className="w-full px-4 py-3 rounded-lg border border-green-600 
              bg-green-500/20 text-green-400 hover:bg-green-500/30 hover:border-green-500
              transition duration-300 flex items-center justify-center space-x-2
              disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {isClaimingAll ? (
              <>
                <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                <span>
                  {claimProgress.isActive 
                    ? `Claiming Rewards (${claimProgress.current}/${claimProgress.total})`
                    : 'Claiming All Available Rewards...'}
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Claim All Available Rewards ({totalClaimableBonds})</span>
              </>
            )}
          </button>
        )}

        <div className="flex items-center gap-4">
          {/* Filters Dropdown Button */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 bg-gray-800/50 text-white px-4 py-3 
                rounded-lg border border-gray-700 hover:border-yellow-500 transition duration-300"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              <span>Filters</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${
                  showFilters ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Filters Dropdown Content */}
            {showFilters && (
              <div className="absolute right-0 mt-2 w-72 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-50
                sm:right-0 right-auto sm:left-auto left-0
                sm:transform-none transform-gpu
                max-w-[calc(100vw-2rem)]">
                <div className="p-4 space-y-4">
                  {/* Status filter */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full bg-gray-700 text-white rounded-md px-3 py-2 border border-gray-600 
                        focus:border-yellow-200 focus:outline-none transition duration-300"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="ended">Ended</option>
                      <option value="matured">Matured</option>
                      <option value="sold out">Sold Out</option>
                    </select>
                  </div>

                  {/* Denom filter */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Payment Method</label>
                    <select
                      value={denomFilter}
                      onChange={(e) => setDenomFilter(e.target.value)}
                      className="w-full bg-gray-700 text-white rounded-md px-3 py-2 border border-gray-600 
                        focus:border-yellow-200 focus:outline-none transition duration-300"
                    >
                      <option value="all">All Payment Methods</option>
                      {getUniquePurchaseDenoms.map(denom => (
                        <option key={denom} value={denom}>
                          Buy with {getTokenSymbol(denom)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* User bonds filter - only show if user has bonds */}
                  {userBonds.length > 0 && (
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showUserBondsOnly}
                        onChange={(e) => setShowUserBondsOnly(e.target.checked)}
                        className="form-checkbox h-4 w-4 text-yellow-500 rounded border-gray-600 
                          focus:ring-yellow-500"
                      />
                      <span className="text-white">Show my bonds only</span>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filter stats */}
        <div className="text-sm text-gray-400">
          Showing {filteredBonds.length} of {bonds.length} bonds
        </div>
      </div>
    );
  });

  // Add this effect to handle the initial status filter
  useEffect(() => {
    if (!hasSetInitialFilter && !isLoading && bonds.length > 0) {
      const hasActiveBonds = bonds.some(bond => getBondStatus(bond) === 'Active');
      if (!hasActiveBonds) {
        setStatusFilter('all');
      }
      setHasSetInitialFilter(true);
    }
  }, [bonds, isLoading, hasSetInitialFilter]);

  // Add this function to refresh a specific bond
  const refreshBond = async (bondId) => {
    try {
      console.log('🔄 Refreshing bond data for bond:', bondId);
      const message = { 
        get_bond_offer: {
          bond_id: parseInt(bondId)
        }
      };
      const data = await queryContract(message);
      
      if (data && data.bond_offer) {
        setBonds(prevBonds => {
          return prevBonds.map(bond => {
            if (bond.bond_id === bondId) {
              return {
                ...data.bond_offer,
                start_time: convertContractTimeToDate(data.bond_offer.purchase_start_time),
                end_time: convertContractTimeToDate(data.bond_offer.purchase_end_time),
                maturity_date: convertContractTimeToDate(data.bond_offer.maturity_date)
              };
            }
            return bond;
          });
        });
      }
    } catch (error) {
      console.error("Error refreshing bond:", error);
    }
  };

  // Add function to fetch NFT collections
  const fetchNFTCollections = async () => {
    if (!connectedWalletAddress) return;
    
    try {
      const chainId = isTestnet ? "narwhal-2" : "migaloo-1";
      const response = await fetch(
        `https://indexer.daodao.zone/${chainId}/account/${connectedWalletAddress}/nft/collections`
      );
      
      if (!response.ok) {
        console.warn('NFT collections fetch failed, defaulting to purchased bonds only:', response.status);
        setNftCollections([]);
        return;
      }
      
      const collections = await response.json();
      console.log('🎉 Fetched NFT collections:', collections);
      setNftCollections(collections);
    } catch (error) {
      console.warn('Failed to fetch NFT collections, defaulting to purchased bonds:', error);
      setNftCollections([]);
    }
  };

  // Add handleClaimAllBonds function
  const handleClaimAllBonds = async () => {
    try {
      if (!connectedWalletAddress) {
        showAlert("Please connect your wallet first", "error");
        return;
      }

      // Get all claimable purchases with proper validation
      const claimablePurchases = userBonds.filter(purchase => {
        const bond = bonds.find(b => b.bond_id === purchase.bond_id);
        const isValidPurchase = isClaimable(bond, purchase);
        console.log(`Purchase ${purchase.nft_token_id} claimable status:`, {
          bondId: purchase.bond_id,
          isValidPurchase,
          amount: purchase.amount,
          claimedAmount: purchase.claimed_amount,
          status: purchase.status
        });
        return isValidPurchase;
      });

      if (claimablePurchases.length === 0) {
        showAlert("No claimable rewards found", "info");
        return;
      }

      // Create array of instructions with proper validation
      const instructions = claimablePurchases.map(purchase => ({
        contractAddress: contractAddress,
        msg: {
          claim_rewards: {
            bond_id: parseInt(purchase.bond_id),
            nft_token_id: purchase.nft_token_id
          }
        }
      }));

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      // Increase gas limit for multiple transactions
      const gasPerMsg = 750000; // Increased from 500000
      const totalGas = Math.min(3000000, gasPerMsg * instructions.length); // Increased from 2000000

      const fee = {
        amount: [{ denom: "uwhale", amount: "75000" }], // Increased from 50000
        gas: totalGas.toString(),
      };

      console.log('Executing claim all with:', {
        instructions: instructions.length,
        totalGas,
        fee
      });

      const result = await client.executeMultiple(
        connectedWalletAddress,
        instructions,
        fee,
        "Claim All Available Bond Rewards"
      );

      if (result.transactionHash) {
        // Invalidate cache for all claimed NFTs
        for (const purchase of claimablePurchases) {
          try {
            const bondQuery = { 
              get_bond_offer: { 
                bond_id: parseInt(purchase.bond_id) 
              } 
            };
            const bondData = await queryContract(bondQuery);
            const nftContractAddr = bondData?.bond_offer?.nft_contract_addr || purchase.contract_address;
            
            if (nftContractAddr) {
              console.log(`Invalidating cache for NFT ${purchase.nft_token_id}`);
              nftInfoCache.delete(nftContractAddr, purchase.nft_token_id);
            }
          } catch (error) {
            console.warn(`Failed to invalidate cache for NFT ${purchase.nft_token_id}:`, error);
          }
        }

        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        
        showAlert(
          `Successfully claimed all available rewards! (${claimablePurchases.length} bonds)`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction ${result.transactionHash}</a>`
        );
        
        // Add delay before refreshing data
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Refresh data sequentially
        await fetchData();
      }
    } catch (error) {
      console.error("Error claiming all rewards:", error);
      showAlert(`Error claiming rewards: ${error.message}`, "error");
    }
  };

  // Add effect to fetch collections when wallet connects
  useEffect(() => {
    if (connectedWalletAddress) {
      fetchNFTCollections();
    }
  }, [connectedWalletAddress, isTestnet]);

  const ToggleableAmount = ({ amount, denom, className = "" }) => {
    const [showPrice, setShowPrice] = useState(false);

    const tokenSymbol = getTokenSymbol(denom)?.toLowerCase();
    const price = prices[tokenSymbol];
    const formattedAmount = formatAmount(amount);
    
    // Calculate USD value based on raw amount
    const rawAmount = parseFloat(amount) / OPHIR_DECIMAL;
    const value = price ? (rawAmount * price).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) : null;

    return (
      <div 
        onClick={(e) => {
          e.stopPropagation();
          if (price) setShowPrice(!showPrice);
        }}
        className={`cursor-pointer transition-all duration-300 ${className} ${price ? 'hover:text-yellow-400' : ''}`}
        title={price ? 'Click to toggle USD value' : 'Price data unavailable'}
      >
        {showPrice && price ? value : formattedAmount}
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
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold h1-color">Bonds</h1>
            <NetworkSwitcher />
          </div>
          <div className="flex space-x-4 items-center">
            <Link
              to="/bonds/create"
              className="create-bond-button landing-button rounded-md hover:bg-yellow-500 transition duration-300"
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
            <SearchBar value={searchQuery} onChange={handleSearch} />
            <FiltersSection 
              bonds={bonds}
              userBonds={userBonds}
              filteredBonds={filteredBonds}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              denomFilter={denomFilter}
              setDenomFilter={setDenomFilter}
              showUserBondsOnly={showUserBondsOnly}
              setShowUserBondsOnly={setShowUserBondsOnly}
              getTokenSymbol={getTokenSymbol}
              getUniquePurchaseDenoms={getUniquePurchaseDenoms}
              getBondStatus={getBondStatus}
              isClaimable={isClaimable}
              handleClaimAllBonds={handleClaimAllBonds}
            />

            <div className="hidden md:block">
              {renderBondTable()}
            </div>

            <div className="md:hidden">
              {filteredBonds.map((bond) => (
                <BondCard key={bond.bond_id} bond={bond} />
              ))}
              {hasMoreBonds && filteredBonds.length > 0 && (
                <div 
                  ref={observerTarget}
                  className="w-full py-4 flex justify-center"
                >
                  {isFetchingMore && (
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-400"></div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Bonds;