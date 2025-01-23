import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';
import { Link } from 'react-router-dom';
import { formatTokenAmount, parseTokenAmount } from '../utils/helpers';
import { tokenSymbols, tokenMappings } from '../utils/tokenMappings';
import { tokenImages } from '../utils/tokenImages';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import { daoConfig } from '../utils/daoConfig';
import BigInt from "big-integer";
import { SigningCosmWasmClient, CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import { useNetwork } from '../context/NetworkContext';
import TokenDropdown from '../components/TokenDropdown';
import NetworkSwitcher from '../components/NetworkSwitcher';
import { getNFTInfo, nftInfoCache, batchGetNFTInfo } from '../utils/nftCache';
import { useCrypto } from '../context/CryptoContext';

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

function ResaleBonds() {

  const { isTestnet, rpc, chainId } = useNetwork();
  const { prices } = useCrypto();
  const OPHIR_DECIMAL = BigInt(1000000);

  const convertContractTimeToDate = (contractTime) => {
    try {
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

  const [isLoading, setIsLoading] = useState(false);
  const [resaleOffers, setResaleOffers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateOfferModalOpen, setIsCreateOfferModalOpen] = useState(false);
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    bond_id: '',
    nft_id: '',
    price_per_bond: '',
    price_denom: 'uwhale',
    start_time: DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"),
    end_time: DateTime.now().plus({ days: 7 }).toFormat("yyyy-MM-dd'T'HH:mm"),
  });
  const [userBonds, setUserBonds] = useState([]);
  const [client, setClient] = useState(null);
  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [bondDetails, setBondDetails] = useState({});
  const [uniqueDenoms, setUniqueDenoms] = useState([]);
  const [signingClient, setSigningClient] = useState(null);
  const [nftInfoCache] = useState(new Map());
  const [allowedDenoms, setAllowedDenoms] = useState([]);
  const [bondOffersCache, setBondOffersCache] = useState(new Map());
  const BOND_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for bond offers

  const bondContractAddress = isTestnet ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET : daoConfig.BONDS_CONTRACT_ADDRESS;

  const getBondOfferFromCache = (bondId) => {
    const cached = bondOffersCache.get(bondId);
    if (cached && Date.now() - cached.timestamp < BOND_CACHE_DURATION) {
      return cached.data;
    }
    return null;
  };

  const setBondOfferInCache = (bondId, data) => {
    setBondOffersCache(prev => {
      const newCache = new Map(prev);
      newCache.set(bondId, {
        data,
        timestamp: Date.now()
      });
      return newCache;
    });
  };

  const invalidateBondCache = (bondId) => {
    setBondOffersCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(bondId);
      return newCache;
    });
  };

  const fetchBondOffer = async (bondId) => {
    // Check cache first
    const cachedOffer = getBondOfferFromCache(bondId);
    if (cachedOffer) {
      console.log('📦 Using cached bond offer for:', bondId);
      return cachedOffer;
    }

    try {
      const message = {
        get_bond_offer: { bond_id: parseInt(bondId) }
      };
      const response = await queryContract(message);
      const bondOffer = response.bond_offer;
      
      // Cache the result
      setBondOfferInCache(bondId, bondOffer);
      return bondOffer;
    } catch (error) {
      console.error(`Error fetching bond offer ${bondId}:`, error);
      throw error;
    }
  };

  // Add retry logic with exponential backoff
  const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await fn();
      } catch (error) {
        if (error?.message?.includes('429') && retries < maxRetries - 1) {
          retries++;
          const delay = initialDelay * Math.pow(2, retries - 1);
          console.log(`Retrying after ${delay}ms (attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  };

  // Optimize queryContract with connection reuse and retries
  const [cosmWasmClient, setCosmWasmClient] = useState(null);

  useEffect(() => {
    const initClient = async () => {
      try {
        const client = await CosmWasmClient.connect(rpc);
        setCosmWasmClient(client);
      } catch (error) {
        console.error('Failed to initialize CosmWasm client:', error);
      }
    };
    initClient();
  }, [rpc]);

  const queryContract = async (message) => {
    console.log('🚀 Initiating contract query with message:', message);
    
    if (!cosmWasmClient) {
      throw new Error('CosmWasm client not initialized');
    }

    try {
      const queryResponse = await retryWithBackoff(async () => {
        return await cosmWasmClient.queryContractSmart(
          bondContractAddress,
          message
        );
      });
      
      console.log('📦 Query response:', queryResponse);
      return queryResponse;
      
    } catch (error) {
      console.error('❌ Contract query failed:', {
        error,
        message,
        contractAddress: bondContractAddress,
        rpc
      });
      throw error;
    }
  };

  // Batch fetch bond offers
  const batchFetchBondOffers = async (bondIds) => {
    const results = new Map();
    const uncachedBondIds = [];

    // Check cache first
    for (const bondId of bondIds) {
      const cached = getBondOfferFromCache(bondId);
      if (cached) {
        results.set(bondId, cached);
      } else {
        uncachedBondIds.push(bondId);
      }
    }

    // Fetch uncached bonds in smaller batches
    const batchSize = 3;
    for (let i = 0; i < uncachedBondIds.length; i += batchSize) {
      const batch = uncachedBondIds.slice(i, i + batchSize);
      await Promise.all(batch.map(async (bondId) => {
        try {
          const bondOffer = await fetchBondOffer(bondId);
          results.set(bondId, bondOffer);
        } catch (error) {
          console.error(`Error fetching bond offer ${bondId}:`, error);
        }
      }));
      
      // Add small delay between batches to avoid rate limiting
      if (i + batchSize < uncachedBondIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  };

  const [isUserBondsLoading, setIsUserBondsLoading] = useState(false);
  const [isResaleOffersLoading, setIsResaleOffersLoading] = useState(false);

  const fetchResaleOffers = async () => {
    try {
      console.log('🔍 Fetching resale offers...');
      setIsResaleOffersLoading(true);
      
      const message = {
        list_resale_offers: {}
      };
      
      const response = await queryContract(message);
      console.log('📦 Raw resale offers response:', response);

      // Process offers with cached data
      const offersWithDetails = await Promise.all(response.offers.map(async (offer) => {
        try {
          const bondOffer = await fetchBondOffer(offer.bond_id);
          let nftInfo = null;
          
          if (bondOffer?.nft_contract_addr) {
            const contractResults = await getNFTInfo(
              bondOffer.nft_contract_addr,
              offer.nft_id,
              rpc
            );
            nftInfo = contractResults;
          }

          const amount = nftInfo?.extension?.attributes?.find(attr => attr.trait_type === 'amount')?.value || 
                        bondOffer?.total_amount || "0";

          return {
            ...offer,
            bond_id: parseInt(offer.bond_id),
            nft_id: offer.nft_id,
            bond_name: bondOffer?.bond_name || `Bond #${offer.bond_id}`,
            nft_info: nftInfo,
            bond_details: bondOffer,
            amount: amount,
            token_denom: bondOffer?.token_denom || 'uwhale',
            start_time: offer.start_time,
            end_time: offer.end_time,
            price_denom: offer.price_denom,
            price: offer.price_per_bond
          };
        } catch (error) {
          console.error(`Error processing offer ${offer.bond_id}:`, error);
          return null;
        }
      }));

      // Filter out any null results from errors
      const validOffers = offersWithDetails.filter(offer => offer !== null);
      console.log('📦 Processed offers:', validOffers);
      setResaleOffers(validOffers);
      
    } catch (error) {
      console.error('❌ Error fetching resale offers:', error);
      showAlert("Error fetching resale offers", "error");
    } finally {
      setIsResaleOffersLoading(false);
    }
  };

  const fetchUserBonds = async () => {
    if (!connectedWalletAddress) return;

    try {
      setIsUserBondsLoading(true);
      console.log('🔍 Starting user bonds fetch for:', connectedWalletAddress);
      
      let allUserBonds = new Map();
      
      // Create a single CosmWasm client instance to reuse
      const client = await CosmWasmClient.connect(rpc);
      console.log('✅ Connected to CosmWasm client');
      
      // First get all bond offers to get NFT contract addresses
      const message = {
        get_all_bond_offers: {
          limit: 100 // Adjust as needed
        }
      };
      
      const bondOffersResponse = await queryContract(message);
      console.log('📦 Got bond offers response:', bondOffersResponse);
      
      if (!bondOffersResponse?.bond_offers) {
        console.warn('No bond offers found');
        return;
      }
      
      // Create a map of bond ID to NFT contract address and bond offer
      const bondContracts = new Map();
      bondOffersResponse.bond_offers.forEach(offer => {
        if (offer.contract_addr) {
          bondContracts.set(offer.bond_offer.bond_id, {
            contractAddr: offer.contract_addr,
            bondOffer: offer.bond_offer
          });
        }
      });
      
      console.log('📦 Found NFT contracts:', Array.from(bondContracts.entries()));

      // Process each bond's NFT contract
      const contractQueries = Array.from(bondContracts.entries()).map(async ([bondId, { contractAddr, bondOffer }]) => {
        try {
          console.log(`🔍 Checking ownership for bond ${bondId} at contract ${contractAddr}`);
          
          // Query current ownership for this contract
          const ownershipQuery = {
            tokens: {
              owner: connectedWalletAddress
            }
          };

          const ownershipResponse = await client.queryContractSmart(contractAddr, ownershipQuery);
          const ownedTokenIds = ownershipResponse.tokens || [];
          console.log(`Found ${ownedTokenIds.length} tokens for bond ${bondId}:`, ownedTokenIds);

          if (ownedTokenIds.length === 0) return;

          // Get NFT info for each owned token
          const nftInfos = await batchGetNFTInfo(contractAddr, ownedTokenIds, rpc);
          console.log(`📦 Got NFT info for bond ${bondId}:`, nftInfos);

          // Process each owned NFT
          const nftProcessing = ownedTokenIds.map(async (tokenId) => {
            const nftInfo = nftInfos[tokenId];
            if (!nftInfo) {
              console.warn(`No NFT info found for token ${tokenId} in bond ${bondId}`);
              return;
            }

            const attributes = nftInfo.extension?.attributes || [];
            const purchaseTimeAttr = attributes.find(attr => attr.trait_type === 'purchase_time');
            const claimedAmountAttr = attributes.find(attr => attr.trait_type === 'claimed_amount');
            const amountAttr = attributes.find(attr => attr.trait_type === 'amount');
            const bondIdAttr = attributes.find(attr => attr.trait_type === 'bond_id');

            // Skip if this NFT is not for this bond
            const nftBondId = bondIdAttr ? parseInt(bondIdAttr.value) : parseInt(bondId);
            if (nftBondId !== parseInt(bondId)) {
              console.log(`Token ${tokenId} bond ID ${nftBondId} doesn't match expected bond ${bondId}`);
              return;
            }

            let purchaseTime;
            if (purchaseTimeAttr?.value) {
              purchaseTime = new Date(parseInt(purchaseTimeAttr.value) * 1000);
            }

            if (!purchaseTime || purchaseTime.toString() === 'Invalid Date') {
              purchaseTime = new Date();
            }

            const now = new Date();
            const purchaseEndDate = convertContractTimeToDate(bondOffer.purchase_end_time);
            const maturityDate = convertContractTimeToDate(bondOffer.maturity_date);
            const canListForResale = now > purchaseEndDate && now < maturityDate;

            const uniqueKey = `${bondId}_${tokenId}`;
            console.log(`Adding bond to collection: ${uniqueKey}`, {
              bondId,
              tokenId,
              amount: amountAttr?.value || bondOffer.total_amount,
              claimed: claimedAmountAttr?.value || "0"
            });

            allUserBonds.set(uniqueKey, {
              bond_id: parseInt(bondId),
              nft_id: tokenId,
              contract_address: contractAddr,
              purchase_time: purchaseTime,
              amount: amountAttr?.value || bondOffer.total_amount,
              claimed_amount: claimedAmountAttr?.value || "0",
              name: nftInfo.extension?.name || bondOffer.bond_name || `Bond #${bondId}`,
              canListForResale,
              purchaseEndDate,
              maturityDate,
              bondOffer,
              nftInfo,
              currently_owned: true
            });
          });

          await Promise.all(nftProcessing);
        } catch (error) {
          console.error(`Error processing bond ${bondId}:`, error);
        }
      });

      await Promise.all(contractQueries);

      const uniqueUserBonds = Array.from(allUserBonds.values());
      console.log('✅ Final unique user bonds array:', uniqueUserBonds);
      setUserBonds(uniqueUserBonds);

    } catch (error) {
      console.error('❌ Error fetching user bonds:', error);
      showAlert(`Error fetching your bonds: ${error.message}`, "error");
    } finally {
      setIsUserBondsLoading(false);
    }
  };

  const fetchUniqueDenoms = async () => {
    try {
      console.log('🔍 Fetching unique denominations...');
      
      const message = {
        get_unique_denoms: {}
      };
      
      const response = await queryContract(message);
      console.log('📦 Unique denoms response:', response);
      
      const uniqueDenominations = [...new Set(
        response.bond_denoms.map(item => item.denomination)
      )];
      
      setUniqueDenoms(uniqueDenominations);
    } catch (error) {
      console.error('❌ Error fetching unique denominations:', error);
      showAlert(`Error fetching denominations: ${error.message}`, "error");
    }
  };

  useEffect(() => {
    console.log('ResaleBonds useEffect triggered');
    
    if (client) {
      fetchResaleOffers();
      fetchUniqueDenoms();
      if (connectedWalletAddress) {
        fetchUserBonds();
      }
    } else {
      console.log('No client available yet');
      setIsLoading(false);
    }
  }, [client, connectedWalletAddress]);

  useEffect(() => {
    const initClient = async () => {
      try {
        const cosmWasmClient = await CosmWasmClient.connect(rpc);
        setClient(cosmWasmClient);
      } catch (error) {
        console.error('Failed to initialize CosmWasm client:', error);
        showAlert('Failed to connect to the network', 'error');
      }
    };

    initClient();
  }, [rpc]);

  useEffect(() => {
    const initSigningClient = async () => {
      if (window.keplr && connectedWalletAddress) {
        try {
          await window.keplr.enable(chainId);
          const offlineSigner = await window.keplr.getOfflineSigner(chainId);
          const client = await SigningCosmWasmClient.connectWithSigner(rpc, offlineSigner);
          setSigningClient(client);
        } catch (error) {
          console.error('Failed to initialize signing client:', error);
          showAlert('Failed to connect to Keplr', 'error');
        }
      }
    };

    initSigningClient();
  }, [connectedWalletAddress, rpc]);

  useEffect(() => {
    const fetchAllowedDenoms = async () => {
      try {
        console.log('🔍 Fetching allowed denominations...');
        const client = await CosmWasmClient.connect(rpc);
        
        const query = {
          get_allowed_resale_denoms: {}
        };
        
        const response = await client.queryContractSmart(
          bondContractAddress,
          query
        );
        
        if (response?.denoms) {
          console.log('📦 Allowed denoms response:', response.denoms);
          setAllowedDenoms(response.denoms);
        }
      } catch (error) {
        console.error('❌ Error fetching allowed denominations:', error);
        showAlert("Error fetching allowed tokens", "error");
      }
    };

    if (rpc && bondContractAddress) {
      fetchAllowedDenoms();
    }
  }, [rpc, bondContractAddress]);

  const handleOfferClick = (bondId, nftId) => {
    if (!bondId || !nftId) return;
    navigate(`/bonds/resale/${bondId}_${nftId}`);
  };

  const getTokenSymbol = (denom) => {
    if (!denom) return '';
    return tokenMappings[denom]?.symbol || denom;
  };

  const getTokenImage = (symbol) => {
    if (!symbol) return '';
    const lowerSymbol = symbol.toLowerCase();
    return tokenImages[lowerSymbol] || '';
  };

  const filteredOffers = resaleOffers.filter((offer) => {
    const searchLower = searchTerm.toLowerCase();
    return searchTerm === '' || (
      (offer.bond_id?.toString() || '').includes(searchLower)
    );
  });

  // Add this utility function with other utility functions
  const getBondResaleStatus = (startTime, endTime) => {
    const now = new Date();
    const start = convertContractTimeToDate(startTime);
    const end = convertContractTimeToDate(endTime);

    if (now < start) {
      return {
        status: 'upcoming',
        timeLeft: start.getTime() - now.getTime()
      };
    } else if (now > end) {
      return {
        status: 'ended',
        timeLeft: 0
      };
    }
    return {
      status: 'active',
      timeLeft: end.getTime() - now.getTime()
    };
  };

  // Add these state variables at the top with other states
  const [selectedBondForPurchase, setSelectedBondForPurchase] = useState(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // Move calculateDiscount outside of ResaleCard but keep it inside ResaleBonds
  const calculateDiscount = useCallback((offer) => {
    if (!offer || !prices) return null;

    // Convert denoms to lowercase and handle special testnet case
    let listTokenDenom = tokenMappings[offer.token_denom]?.symbol?.toLowerCase() || offer.token_denom?.toLowerCase();
    let saleTokenDenom = tokenMappings[offer.price_denom]?.symbol?.toLowerCase() || offer.price_denom?.toLowerCase();
    
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
    const bondPriceInUSD = parseFloat(offer.price) * saleTokenPrice;
    const discount = ((bondPriceInUSD - listTokenPrice) / listTokenPrice) * 100;
    
    return discount;
  }, [prices]);

  // Update the ResaleCard component
  const ResaleCard = ({ offer }) => {
    if (!offer) return null;
    const tokenSymbol = getTokenSymbol(offer.token_denom);
    const tokenImage = offer.nft_info?.extension?.image || getTokenImage(tokenSymbol);
    const priceTokenSymbol = getTokenSymbol(offer.price_denom);
    const resaleStatus = getBondResaleStatus(offer.start_time, offer.end_time);
    const discount = calculateDiscount(offer); // Use calculateDiscount from parent scope

    // Add this to format the time remaining
    const formatTimeLeft = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      return `${minutes}m`;
    };

    const handleCardClick = () => {
      if (!offer.bond_id || !offer.nft_token_id) {
        console.error('Missing bond_id or nft_token_id:', offer);
        return;
      }
      navigate(`/bonds/resale/${offer.bond_id}_${offer.nft_token_id}`);
    };

    // Add this helper function inside ResaleCard
    const formatDateTime = (timestamp) => {
      const date = convertContractTimeToDate(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };

    const handleBuyClick = (e) => {
      e.stopPropagation(); // Prevent card click navigation
      setSelectedBondForPurchase(offer);
      setShowPurchaseModal(true);
    };

    return (
      <div 
        key={`${offer.bond_id}_${offer.nft_token_id}`}
        className={`relative backdrop-blur-sm rounded-xl p-6 mb-4 cursor-pointer 
          transition duration-300 shadow-lg hover:shadow-xl 
          border border-gray-700/50 hover:border-gray-600/50
          bg-gray-800/80 hover:bg-gray-700/80
          ${resaleStatus.status === 'upcoming' ? 'opacity-75' : ''}`}
        onClick={handleCardClick}
      >
        {resaleStatus.status === 'upcoming' && (
          <div className="absolute top-3 right-3">
            <div className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm">
              Starts in {formatTimeLeft(resaleStatus.timeLeft)}
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center">
            {tokenImage && (
              <div className="w-10 h-10 rounded-full mr-3 overflow-hidden shadow-md">
                <img src={tokenImage} alt={tokenSymbol} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">{offer.bond_name}</h3>
              <div className="text-sm text-gray-400">NFT ID: {offer.nft_token_id || 'Loading...'}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Amount</span>
            <span className="font-medium">{formatTokenAmount(offer.amount)} {tokenSymbol}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Asking Price</span>
            <span className="font-medium">{(offer.price)} {priceTokenSymbol}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Start Time</span>
            <span className={`font-medium text-right ${resaleStatus.status === 'upcoming' ? 'text-yellow-400' : ''}`}>
              {formatDateTime(offer.start_time)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">End Time</span>
            <span className="font-medium text-right">
              {formatDateTime(offer.end_time)}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-700/50">
          {resaleStatus.status === 'upcoming' ? (
            <button
              disabled
              className="w-full px-4 py-2 rounded-lg text-sm font-medium 
                bg-gray-700/50 text-gray-400 cursor-not-allowed"
            >
              Not Available Yet
            </button>
          ) : resaleStatus.status === 'ended' ? (
            <button
              disabled
              className="w-full px-4 py-2 rounded-lg text-sm font-medium 
                bg-gray-700/50 text-gray-400 cursor-not-allowed"
            >
              Offer Ended
            </button>
          ) : (
            <button
              onClick={handleBuyClick}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium
                bg-gradient-to-r from-yellow-500/80 to-yellow-600/80 
                hover:from-yellow-500 hover:to-yellow-600 
                text-black shadow-lg hover:shadow-xl
                transition-all duration-200"
            >
              Buy Now
            </button>
          )}
        </div>

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
            <DiscountTooltip bondDenom={getTokenSymbol(offer.token_denom)} />
          </div>
        )}
      </div>
    );
  };

  const handleQuickResale = async (bond, price, priceDenom) => {
    if (!window.keplr) {
      showAlert("Please install Keplr extension", "error");
      return;
    }

    try {
      // Query the bond's NFT contract address first
      const bondQuery = { 
        get_bond_offer: { 
          bond_id: parseInt(bond.bond_id) 
        } 
      };
      const bondData = await queryContract(bondQuery);
      const nftContractAddr = bondData?.bond_offer?.nft_contract_addr;

      // Use the contract address from the bond as fallback
      const contractAddr = nftContractAddr || bond.contract_address;

      if (!contractAddr) {
        throw new Error("Could not find NFT contract address for this bond");
      }

      // Calculate timestamps as before...
      const now = new Date();
      const startDate = new Date(now.getTime() + 1 * 60 * 1000);
      const maturityDate = new Date(bond.maturityDate);
      const endDate = new Date(maturityDate.getTime() - 1 * 60 * 1000);

      // ... timestamp validation and query ...
      const startOffset = Math.ceil((startDate - now) / (1000 * 60));
      const endOffset = Math.ceil((endDate - now) / (1000 * 60));

      const timestampQuery = {
        get_timestamp_offsets: {
          start_offset: startOffset,
          end_offset: endOffset,
          claim_start_offset: endOffset + 30,
          mature_offset: endOffset + 30
        }
      };

      const timestamps = await queryContract(timestampQuery);

      // Create the resale message
      const resaleMsg = {
        create_resale_offer: {
          seller: connectedWalletAddress,
          bond_id: Number(bond.bond_id),
          nft_token_id: bond.nft_id.toString(),
          price_per_bond: price,
          price_denom: priceDenom,
          start_time: timestamps.start_time,
          end_time: timestamps.end_time
        }
      };

      // Create the send_nft message with the correct structure
      const msg = {
        send_nft: {
          contract: isTestnet ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET : daoConfig.BONDS_CONTRACT_ADDRESS,
          token_id: bond.nft_id.toString(),
          msg: btoa(JSON.stringify(resaleMsg))
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "1000000" }],
        gas: "1000000"
      };

      // Execute on the correct NFT contract
      const response = await signingClient.execute(
        connectedWalletAddress,
        contractAddr,
        msg,
        fee
      );

      showAlert("Resale offer created successfully!", "success");
      
      // Refresh data without page reload
      await Promise.all([
        fetchResaleOffers(),
        fetchUserBonds()
      ]);

      // Clear the price input for this bond
      setQuickResalePrices(prev => ({
        ...prev,
        [`${bond.bond_id}_${bond.nft_id}`]: ''
      }));

    } catch (error) {
      console.error('Error creating quick resale:', error);
      showAlert(`Error creating resale: ${error.message}`, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!window.keplr) {
      showAlert("Please install Keplr extension", "error");
      return;
    }

    try {
      if (!formData.bond_id) {
        throw new Error("Please select a bond");
      }

      const [bondId, nftId] = formData.bond_id.split('|');
      
      // Find the selected bond from userBonds
      const selectedBond = userBonds.find(bond => 
        bond.bond_id.toString() === bondId && 
        bond.nft_id.toString() === nftId
      );

      if (!selectedBond) {
        console.error('Available bonds:', userBonds);
        console.error('Looking for bondId:', bondId, 'nftId:', nftId);
        throw new Error("Selected bond not found in your bonds");
      }

      // Query the bond's NFT contract address first
      const bondQuery = { 
        get_bond_offer: { 
          bond_id: parseInt(bondId) 
        } 
      };
      const bondData = await queryContract(bondQuery);
      const nftContractAddr = bondData?.bond_offer?.nft_contract_addr;

      // Use the contract address from the bond as fallback
      const contractAddr = nftContractAddr || selectedBond.contract_address;

      if (!contractAddr) {
        throw new Error("Could not find NFT contract address for this bond");
      }
      
      // ... timestamp calculations remain the same ...
      const now = new Date();
      const startDate = new Date(`${formData.start_time}`);
      const endDate = new Date(`${formData.end_time}`);

      if (endDate <= startDate) {
        throw new Error("End date must be after start date");
      }

      const startOffset = Math.ceil((startDate - now) / (1000 * 60));
      const endOffset = Math.ceil((endDate - now) / (1000 * 60));
      const claimStartOffset = endOffset + 30;
      const maturityOffset = claimStartOffset + 30;

      const timestampQuery = {
        get_timestamp_offsets: {
          start_offset: startOffset,
          end_offset: endOffset,
          claim_start_offset: claimStartOffset,
          mature_offset: maturityOffset
        }
      };

      const timestamps = await queryContract(timestampQuery);

      // Create the resale message
      const resaleMsg = {
        create_resale_offer: {
          seller: connectedWalletAddress,
          bond_id: Number(bondId),
          nft_token_id: nftId.toString(),
          price_per_bond: formData.price_per_bond,
          price_denom: formData.price_denom,
          start_time: timestamps.start_time,
          end_time: timestamps.end_time
        }
      };

      // Create the send_nft message
      const msg = {
        send_nft: {
          contract: isTestnet ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET : daoConfig.BONDS_CONTRACT_ADDRESS,
          token_id: nftId.toString(),
          msg: btoa(JSON.stringify(resaleMsg))
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "1000000" }],
        gas: "1000000"
      };

      // Execute on the correct NFT contract
      const response = await signingClient.execute(
        connectedWalletAddress,
        contractAddr,
        msg,
        fee
      );

      showAlert("Resale offer created successfully!", "success");
      setIsCreateOfferModalOpen(false);
      
      // Refresh data without page reload
      await Promise.all([
        fetchResaleOffers(),
        fetchUserBonds()
      ]);

      // Clear the price input for this bond
      setQuickResalePrices(prev => ({
        ...prev,
        [`${bondId}_${nftId}`]: ''
      }));

    } catch (error) {
      console.error('Error creating resale offer:', error);
      showAlert(`Error creating resale offer: ${error.message}`, "error");
    }
  };

  const BondSelectionDropdown = () => {
    const formatDate = (date) => {
      if (!date) return '';
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit'
      });
    };

    const formatAmount = (amount) => {
      if (!amount) return '0';
      const value = Number(amount) / Number(OPHIR_DECIMAL);
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 6
      });
    };

    return (
      <div className="mb-4">
        <label className="block text-xs font-medium mb-1 text-gray-300">Select Bond</label>
        <div className="relative group">
          <select
            className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 
              focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 
              focus:outline-none transition-all text-white text-sm"
            value={formData.bond_id}
            onChange={async (e) => {
              const [bondId, nftId] = e.target.value.split('|');
              setFormData(prevState => ({
                ...prevState,
                bond_id: e.target.value,  // Store the full value including nftId
                nft_id: nftId  // Store nftId separately
              }));

              if (bondId) {
                const bondDetails = await fetchBondDetails(bondId);
                if (bondDetails) {
                  setFormData(prevState => ({
                    ...prevState,
                    token_denom: bondDetails.token_denom || prevState.token_denom
                  }));
                }
              }
            }}
            required
          >
            <option value="">Select a Bond</option>
            {userBonds.map((bond) => {
              const isEligible = bond.canListForResale;
              const status = isEligible ? "" : 
                (bond.maturityDate && new Date() > bond.maturityDate) ? " (Matured)" :
                (bond.purchaseEndDate && new Date() <= bond.purchaseEndDate) ? " (Purchase Period Active)" :
                " (Not Eligible)";

              const uniqueKey = `${bond.bond_id}|${bond.nft_id}`;
              const displayText = `${bond.name} · ${formatAmount(bond.amount)} · ${bond.nft_id} · ${formatDate(bond.purchase_time)}${status}`;

              return (
                <option 
                  key={uniqueKey}
                  value={uniqueKey}
                  disabled={!isEligible}
                  className={!isEligible ? "text-gray-500" : ""}
                >
                  {displayText}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    );
  };

  const [quickResalePrices, setQuickResalePrices] = useState({});
  const [quickResaleDenoms, setQuickResaleDenoms] = useState({});

  const UserBondsSection = () => {
    if (!connectedWalletAddress) return null;

    return (
      <button
        onClick={() => navigate('/my-bonds/owned')}
        className="mb-8 w-[95%] mt-6 mx-auto flex items-center justify-between px-6 py-5 rounded-xl 
          bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 
          transition-all duration-200 group"
      >
        <div className="flex flex-col items-start">
          <span className="text-xl font-semibold">Your Bonds</span>
        </div>
        <div className="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center 
          group-hover:bg-gray-600/50 transition-colors">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-6 w-6 text-gray-400 group-hover:text-gray-300" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      </button>
    );
  };

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const fetchBondDetails = async (bondId) => {
    try {
      const message = {
        get_bond_offer: { 
          bond_id: parseInt(bondId) 
        }
      };
      
      const response = await queryContract(message);
      return response.bond_offer;
    } catch (error) {
      console.error('Error fetching bond details:', error);
      return null;
    }
  };

  const getNFTInfo = async (contractAddr, tokenId, forceRefresh = false) => {
    // If not forcing refresh, try to get from cache first
    if (!forceRefresh) {
      const cachedData = nftInfoCache.get(`${contractAddr}_${tokenId}`);
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
      nftInfoCache.set(`${contractAddr}_${tokenId}`, nftInfo);
      
      console.log(`📦 Fetched and cached NFT Info for token ${tokenId}:`, nftInfo);
      return nftInfo;
    } catch (error) {
      console.error(`Error fetching NFT info for token ${tokenId}:`, error);
      throw error;
    }
  };

  // Add this validation function near the top of the component
  const validateNumberInput = (value) => {
    // Allows numbers with up to 6 decimal places, no leading zeros unless decimal
    const regex = /^\d*\.?\d{0,6}$/;
    return regex.test(value) && value !== '.';
  };

  // Function to invalidate both NFT and bond cache for a specific bond
  const invalidateCache = (bondId, nftId, contractAddr) => {
    if (contractAddr && nftId) {
      nftInfoCache.delete(contractAddr, nftId);
    }
    invalidateBondCache(bondId);
  };

  // Fix the duplicate key warning in ResaleCard
  const getUniqueCardKey = (offer) => {
    return `${offer.bond_id}-${offer.nft_id}-${offer.start_time}`;
  };

  // Update the grid rendering to use the unique key
  const renderResaleCards = () => {
    return filteredOffers.map((offer) => (
      <ResaleCard key={getUniqueCardKey(offer)} offer={offer} />
    ));
  };

  const getBondStatus = (bond) => {
    const now = new Date();
    if (now < bond.purchaseEndDate) return 'Purchase Period Active';
    if (now > bond.maturityDate) return 'Matured';
    return 'Available for Resale';
  };

  // Add this utility function near the top with other utility functions
  const getTimestampOffsets = (startDate, endDate) => {
    const now = new Date();
    const startOffset = Math.ceil((startDate - now) / (1000 * 60));
    const endOffset = Math.ceil((endDate - now) / (1000 * 60));
    
    return {
      start_offset: startOffset,
      end_offset: endOffset,
      claim_start_offset: endOffset + 30,
      mature_offset: endOffset + 30
    };
  };

  // Add this state near other state declarations
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Update the PurchaseConfirmationModal component
  const PurchaseConfirmationModal = () => {
    if (!selectedBondForPurchase) return null;

    const handleConfirmPurchase = async () => {
      try {
        if (!window.keplr || !connectedWalletAddress) {
          showAlert("Please connect your wallet first", "error");
          return;
        }

        setIsPurchasing(true);
        console.log('Selected bond:', selectedBondForPurchase);

        const msg = {
          purchase_resale_offer: {
            bond_id: parseInt(selectedBondForPurchase.bond_id),
            nft_token_id: selectedBondForPurchase.nft_token_id
          }
        };

        const fee = {
          amount: [{ denom: "uwhale", amount: "1000000" }],
          gas: "1000000"
        };

        // Fix the amount calculation
        const tokenDecimals = tokenMappings[selectedBondForPurchase.price_denom]?.decimals || 6;
        const amount = selectedBondForPurchase.price_per_bond 
          ? (parseFloat(selectedBondForPurchase.price_per_bond) * Math.pow(10, tokenDecimals)).toString()
          : (parseFloat(selectedBondForPurchase.price) * Math.pow(10, tokenDecimals)).toString();

        const funds = [{
          denom: selectedBondForPurchase.price_denom,
          amount: amount.split('.')[0] // Remove any decimals after calculation
        }];

        console.log('Executing purchase with funds:', funds);
        console.log('Purchase message:', msg);
        console.log('Selected bond:', selectedBondForPurchase);

        const response = await signingClient.execute(
          connectedWalletAddress,
          bondContractAddress,
          msg,
          fee,
          "",
          funds
        );

        showAlert("Purchase successful!", "success");
        setShowPurchaseModal(false);
        fetchResaleOffers();

      } catch (error) {
        console.error('Error purchasing bond:', error);
        showAlert(`Error purchasing bond: ${error.message}`, "error");
      } finally {
        setIsPurchasing(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
        <div className="bg-gray-900/90 rounded-2xl w-full max-w-sm border border-gray-700/50 shadow-xl p-6">
          <h3 className="text-lg font-bold mb-4 text-center text-white">Confirm Purchase</h3>
          
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Bond Name</span>
              <span className="font-medium">{selectedBondForPurchase.bond_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Amount</span>
              <span className="font-medium">
                {formatTokenAmount(selectedBondForPurchase.amount)} {getTokenSymbol(selectedBondForPurchase.token_denom)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Price</span>
              <span className="font-medium">
                {selectedBondForPurchase.price} {getTokenSymbol(selectedBondForPurchase.price_denom)}
              </span>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setShowPurchaseModal(false)}
              disabled={isPurchasing}
              className="px-4 py-2 rounded-lg text-sm font-medium
                bg-gray-700 hover:bg-gray-600 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmPurchase}
              disabled={isPurchasing}
              className="px-4 py-2 rounded-lg text-sm font-medium
                bg-gradient-to-r from-yellow-500/80 to-yellow-600/80 
                hover:from-yellow-500 hover:to-yellow-600 
                text-black shadow-lg hover:shadow-xl
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center min-w-[100px]"
            >
              {isPurchasing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-black/20 border-t-black mr-2"></div>
                  Processing...
                </>
              ) : (
                'Confirm Purchase'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Move handleBondClick to parent component
  const handleBondClick = async (purchase) => {
    if (!purchase.canListForResale) return;

    try {
      // Calculate default dates
      const now = new Date();
      const startDate = new Date(now.getTime() + 1 * 60 * 1000); // 1 minute from now
      const endDate = new Date(purchase.maturityDate.getTime() - 1 * 60 * 1000); // 1 minute before maturity

      // Get timestamp offsets
      const offsets = getTimestampOffsets(startDate, endDate);
      
      // Query contract for actual timestamps
      const timestampQuery = {
        get_timestamp_offsets: offsets
      };
      
      const timestamps = await queryContract(timestampQuery);
      
      // Convert contract timestamps to local dates
      const contractStartTime = convertContractTimeToDate(timestamps.start_time);
      const contractEndTime = convertContractTimeToDate(timestamps.end_time);

      // Format dates for the form
      const formatToLocalISOString = (date) => {
        return date.toLocaleString('sv').slice(0, 16); // 'sv' locale gives YYYY-MM-DD HH:mm format
      };

      // Pre-populate form data with contract timestamps
      setFormData({
        bond_id: `${purchase.bond_id}|${purchase.nft_id}`,
        nft_id: purchase.nft_id,
        price_per_bond: '',
        price_denom: 'uwhale',
        start_time: formatToLocalISOString(contractStartTime),
        end_time: formatToLocalISOString(contractEndTime),
      });

      // Open the create offer modal
      setIsCreateOfferModalOpen(true);
    } catch (error) {
      console.error('Error preparing resale form:', error);
      showAlert('Error preparing resale form', 'error');
    }
  };

  return (
    <div 
      className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="w-[90vw] max-w-7xl mx-auto px-4">
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
                backgroundColor: alertInfo.severity === "error" ? "#ffcccc" : "#ccffcc",
              }}
              message={<span dangerouslySetInnerHTML={{ __html: alertInfo.htmlContent }} />}
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
        <div className="flex justify-between items-center w-[95%] mx-auto mt-10">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold h1-color">Bond Resale Market</h1>
            <div>
              <NetworkSwitcher />
            </div>
          </div>
          
          {connectedWalletAddress && (
            <div className="flex space-x-4 items-center">
              <button
                onClick={() => setIsCreateOfferModalOpen(true)}
                className="landing-button px-4 py-1.5 rounded-md hover:bg-yellow-500 transition duration-300 text-sm"
              >
                Create Offer
              </button>
            </div>
          )}
        </div>

        <UserBondsSection />

        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by bond ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 pl-10 rounded-md bg-gray-700 text-white border border-gray-600 
                focus:border-yellow-500 focus:outline-none transition duration-300"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isResaleOffersLoading ? (
            <div className="col-span-full text-center text-gray-400 mt-8">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400 mx-auto mb-4"></div>
              Loading Resale Offers...
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="col-span-full text-center text-gray-400 mt-8">
              No bonds are currently listed for resale
            </div>
          ) : (
            renderResaleCards()
          )}
        </div>

        {isCreateOfferModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-gray-900/90 rounded-2xl w-full max-w-sm border border-gray-700/50 shadow-xl">
              <div className="p-4">
                <h2 className="text-lg font-bold mb-3 text-center text-white">Create Resale Offer</h2>
                
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-3">
                    <BondSelectionDropdown />

                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-300">Price per Bond</label>
                      <input
                        type="text"
                        value={formData.price_per_bond}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          if (newValue === '' || validateNumberInput(newValue)) {
                            setFormData({...formData, price_per_bond: newValue});
                          }
                        }}
                        placeholder="0.000000"
                        className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 
                          focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 
                          focus:outline-none transition-all text-white"
                        required
                      />
                    </div>

                    <div className="mb-4">
                      <TokenDropdown
                        name="price_denom"
                        value={formData.price_denom}
                        onChange={(e) => setFormData({ ...formData, price_denom: e.target.value })}
                        label="Price Token"
                        allowedDenoms={['factory/migaloo17c5ped2d24ewx9964ul6z2jlhzqtz5gvvg80z6x9dpe086v9026qfznq2e/daoophir', 'uwhale']}
                        isTestnet={isTestnet}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-300">Start Time</label>
                      <input
                        type="datetime-local"
                        value={formData.start_time}
                        onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                        className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 
                          focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 
                          focus:outline-none transition-all text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-300">End Time</label>
                      <input
                        type="datetime-local"
                        value={formData.end_time}
                        onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                        className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 
                          focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 
                          focus:outline-none transition-all text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
                    <button
                      type="button"
                      onClick={() => setIsCreateOfferModalOpen(false)}
                      className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 
                        transition duration-300 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="landing-button px-4 py-2 rounded-md hover:bg-yellow-500 
                        transition duration-300 text-sm"
                    >
                      Create Offer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {showPurchaseModal && <PurchaseConfirmationModal />}
      </div>
    </div>
  );
}

export default ResaleBonds;