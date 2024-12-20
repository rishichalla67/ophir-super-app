import React, { useState, useEffect } from 'react';
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

function ResaleBonds() {

  const { isTestnet, rpc, chainId } = useNetwork();
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
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
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
      console.log('🔍 Fetching bonds for address:', connectedWalletAddress);
      
      const message = { 
        get_bonds_by_user: { 
          buyer: connectedWalletAddress 
        } 
      };
      
      const response = await queryContract(message);
      
      if (response && Array.isArray(response.pairs)) {
        // Create a Map to deduplicate bonds using a composite key
        const uniqueBonds = new Map();
        
        // Group bonds by contract address for efficient ownership checking
        const bondsByContract = response.pairs.reduce((acc, pair) => {
          // Create a unique key for each bond
          const bondKey = `${pair.bond_id}_${pair.nft_id}`;
          
          // Only add if we haven't seen this combination before
          if (!uniqueBonds.has(bondKey)) {
            uniqueBonds.set(bondKey, pair);
            
            if (!acc[pair.contract_addr]) {
              acc[pair.contract_addr] = [];
            }
            acc[pair.contract_addr].push(pair);
          }
          return acc;
        }, {});

        // Rest of the ownership checking and transformation logic...
        const ownedNFTsByContract = {};
        for (const contractAddr of Object.keys(bondsByContract)) {
          try {
            const client = await CosmWasmClient.connect(rpc);
            const ownedTokensResponse = await client.queryContractSmart(
              contractAddr,
              {
                tokens: {
                  owner: connectedWalletAddress
                }
              }
            );
            ownedNFTsByContract[contractAddr] = new Set(ownedTokensResponse.tokens);
          } catch (error) {
            console.error(`Error fetching owned NFTs for contract ${contractAddr}:`, error);
            ownedNFTsByContract[contractAddr] = new Set();
          }
        }

        // Transform only the unique bonds
        const transformedBonds = await Promise.all(
          Array.from(uniqueBonds.values())
            .filter(pair => {
              const ownedTokens = ownedNFTsByContract[pair.contract_addr];
              return ownedTokens && ownedTokens.has(pair.nft_id.toString());
            })
            .map(async pair => {
              // Rest of the transformation logic remains the same
              const bondDetailsMessage = {
                get_bond_offer: { 
                  bond_id: parseInt(pair.bond_id) 
                }
              };
              
              try {
                const bondData = await queryContract(bondDetailsMessage);
                const bondOffer = bondData.bond_offer;
                
                // NFT info fetching with cache
                let nftInfo = null;
                if (pair.contract_addr) {
                  const cachedInfo = nftInfoCache.get(pair.contract_addr, pair.nft_id);
                  if (cachedInfo) {
                    nftInfo = cachedInfo;
                  } else {
                    try {
                      const client = await CosmWasmClient.connect(rpc);
                      nftInfo = await client.queryContractSmart(
                        pair.contract_addr,
                        {
                          nft_info: {
                            token_id: pair.nft_id
                          }
                        }
                      );
                      nftInfoCache.set(pair.contract_addr, pair.nft_id, nftInfo);
                    } catch (error) {
                      console.error(`Error fetching NFT info for token ${pair.nft_id}:`, error);
                    }
                  }
                }

                const now = new Date();
                const purchaseEndDate = convertContractTimeToDate(bondOffer.purchase_end_time);
                const maturityDate = convertContractTimeToDate(bondOffer.maturity_date);
                const canListForResale = now > purchaseEndDate && now < maturityDate;

                const amount = nftInfo?.extension?.attributes?.find(attr => attr.trait_type === 'amount')?.value || 
                              bondOffer.total_amount;

                let purchaseTime;
                const purchaseTimeAttr = nftInfo?.extension?.attributes?.find(attr => attr.trait_type === 'purchase_time');
                if (purchaseTimeAttr?.value) {
                  purchaseTime = new Date(parseInt(purchaseTimeAttr.value) * 1000);
                } else {
                  purchaseTime = new Date();
                }

                return {
                  ...pair,
                  purchase_time: purchaseTime,
                  amount: amount,
                  claimed_amount: nftInfo?.extension?.attributes?.find(attr => attr.trait_type === 'claimed_amount')?.value || "0",
                  bond_id: parseInt(pair.bond_id),
                  nft_id: pair.nft_id,
                  contract_address: pair.contract_addr,
                  name: bondOffer?.bond_name || 
                        nftInfo?.extension?.name || 
                        `Bond #${pair.bond_id}`,
                  canListForResale,
                  purchaseEndDate,
                  maturityDate,
                  bondOffer,
                  nftInfo
                };
              } catch (error) {
                console.error(`Error fetching details for bond ${pair.bond_id}:`, error);
                return null;
              }
            })
        );

        // Filter out null results and set state
        const validBonds = transformedBonds.filter(bond => bond !== null);
        console.log('✨ Transformed bonds with names:', validBonds);
        setUserBonds(validBonds);
      }
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

  // Update the ResaleCard component
  const ResaleCard = ({ offer }) => {
    if (!offer) return null;
    const tokenSymbol = getTokenSymbol(offer.token_denom);
    const tokenImage = offer.nft_info?.extension?.image || getTokenImage(tokenSymbol);
    const priceTokenSymbol = getTokenSymbol(offer.price_denom);

    const resaleStatus = getBondResaleStatus(offer.start_time, offer.end_time);
    
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

    return (
      <div 
        key={`${offer.bond_id}_${offer.nft_token_id}`}
        className={`backdrop-blur-sm rounded-xl p-6 mb-4 cursor-pointer 
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
      setIsModalOpen(false);
      
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
    if (!connectedWalletAddress || (!isUserBondsLoading && userBonds.length === 0)) return null;

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

        // Open the modal
        setIsModalOpen(true);
      } catch (error) {
        console.error('Error preparing resale form:', error);
        showAlert('Error preparing resale form', 'error');
      }
    };

    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Bond Purchases</h2>
        {isUserBondsLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-400"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {userBonds.map((purchase) => {
              const status = getBondStatus(purchase);

              return (
                <div 
                  key={purchase.bond_id}
                  onClick={() => handleBondClick(purchase)}
                  className={`backdrop-blur-sm rounded-xl p-4 sm:p-6 
                    border border-gray-700/50 bg-gray-800/80
                    ${purchase.canListForResale ? 
                      'cursor-pointer hover:bg-gray-700/80 hover:border-gray-600/50 transition-all duration-200' : 
                      'opacity-75'
                    }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{purchase.name}</h3>
                      <div className="text-sm text-gray-400">NFT ID: {purchase.nft_id}</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      status === 'Available for Resale' 
                        ? 'bg-green-500/20 text-green-400' 
                        : status === 'Matured'
                        ? 'bg-gray-500/20 text-gray-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {status}
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Amount</span>
                      <span className="font-medium">{formatTokenAmount(purchase.amount)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Purchase Date</span>
                      <span className="font-medium">
                        {purchase.purchase_time.toLocaleDateString()}
                      </span>
                    </div>

                    {purchase.canListForResale && (
                      <div className="mt-3 pt-3 border-t border-gray-700/50">
                        <div className="text-sm text-center text-gray-400">
                          Click to create resale offer
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
        <div className="flex justify-between items-center w-full max-w-7xl mx-auto px-4 mt-10">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl mb-4 font-bold h1-color">Bond Resale Market</h1>
            <div className="mb-4">
              <NetworkSwitcher />
            </div>
              {/* <span className={`px-3 py-1 text-sm rounded-full ${
                isTestnet 
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                : 'bg-green-500/20 text-green-400 border border-green-500/30'
            }`}>
              {isTestnet ? 'Testnet' : 'Mainnet'}
            </span> */}
          </div>
          
          {connectedWalletAddress && (
            <div className="flex space-x-4 items-center">
              <button
                onClick={() => setIsModalOpen(true)}
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

        {isModalOpen && (
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
                      onClick={() => setIsModalOpen(false)}
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
      </div>
    </div>
  );
}

export default ResaleBonds;