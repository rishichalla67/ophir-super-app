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

  const contractAddress = isTestnet ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET : daoConfig.BONDS_CONTRACT_ADDRESS;

  const fetchResaleOffers = async () => {
    try {
      console.log('🔍 Fetching resale offers...');
      setIsLoading(true);
      
      const message = {
        list_resale_offers: {}
      };
      
      const response = await queryContract(message);
      console.log('📦 Resale offers response:', response);

      // Fetch additional details for each offer
      const offersWithDetails = await Promise.all(response.offers.map(async (offer) => {
        try {
          // Fetch bond details
          const bondDetailsMessage = {
            get_bond_offer: { bond_id: parseInt(offer.bond_id) }
          };
          const bondData = await queryContract(bondDetailsMessage);
          const bondOffer = bondData.bond_offer;

          // Fetch NFT info if we have the contract address
          let nftInfo = null;
          if (bondOffer?.nft_contract_addr) {
            nftInfo = await getNFTInfo(bondOffer.nft_contract_addr, offer.nft_id);
          }

          return {
            ...offer,
            bond_name: bondOffer?.bond_name || `Bond #${offer.bond_id}`,
            nft_info: nftInfo,
            bond_details: bondOffer
          };
        } catch (error) {
          console.error(`Error fetching details for offer ${offer.bond_id}:`, error);
          return offer;
        }
      }));

      setResaleOffers(offersWithDetails || []);
      
    } catch (error) {
      console.error('❌ Error fetching resale offers:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      setIsLoading(false);
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
      showAlert(`Error querying contract: ${error.message}`, "error");
      throw error;
    }
  };

  const fetchUserBonds = async () => {
    if (!connectedWalletAddress) return;

    try {
      console.log('🔍 Fetching bonds for address:', connectedWalletAddress);
      
      const message = { 
        get_bonds_by_user: { 
          buyer: connectedWalletAddress 
        } 
      };
      
      const response = await queryContract(message);
      
      if (response && Array.isArray(response.pairs)) {
        // Fetch bond details for each purchase to get names
        const transformedBonds = await Promise.all(response.pairs.map(async pair => {
          // Fetch bond details to get the name
          const bondDetailsMessage = {
            get_bond_offer: { 
              bond_id: parseInt(pair.bond_id) 
            }
          };
          
          try {
            const bondData = await queryContract(bondDetailsMessage);
            const bondOffer = bondData.bond_offer;
            
            // Try to get NFT info if available
            let nftInfo = null;
            if (pair.contract_addr) {
              // Check cache first
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
                  // Cache the result
                  nftInfoCache.set(pair.contract_addr, pair.nft_id, nftInfo);
                } catch (error) {
                  console.error(`Error fetching NFT info for token ${pair.nft_id}:`, error);
                }
              }
            }

            // Check if the bond can be listed for resale
            const now = new Date();
            const purchaseEndDate = convertContractTimeToDate(bondOffer.purchase_end_time);
            const maturityDate = convertContractTimeToDate(bondOffer.maturity_date);
            const canListForResale = now > purchaseEndDate && now < maturityDate;

            // Get amount from NFT info or bond offer
            const amount = nftInfo?.extension?.attributes?.find(attr => attr.trait_type === 'amount')?.value || 
                          bondOffer.total_amount;

            // Get purchase time from NFT info or use current time as fallback
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
              // Use bond name from bond offer, or NFT name, or fallback
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
            return {
              ...pair,
              purchase_time: new Date(),
              name: `Bond #${pair.bond_id}`,
              canListForResale: false,
              nft_id: pair.nft_id,
              contract_address: pair.contract_addr,
              amount: "0"
            };
          }
        }));

        console.log('✨ Transformed bonds with names:', transformedBonds);
        setUserBonds(transformedBonds);
      }
    } catch (error) {
      console.error('❌ Error fetching user bonds:', error);
      showAlert(`Error fetching your bonds: ${error.message}`, "error");
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

  const handleOfferClick = (bondId) => {
    if (!bondId) return;
    navigate(`/bonds/resale/${bondId}`);
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

  const ResaleCard = ({ offer }) => {
    if (!offer) return null;
    const tokenSymbol = getTokenSymbol(offer.token_denom);
    const tokenImage = offer.nft_info?.extension?.image || getTokenImage(tokenSymbol);

    return (
      <div 
        className="backdrop-blur-sm rounded-xl p-6 mb-4 cursor-pointer 
          transition duration-300 shadow-lg hover:shadow-xl 
          border border-gray-700/50 hover:border-gray-600/50
          bg-gray-800/80 hover:bg-gray-700/80"
        onClick={() => handleOfferClick(offer.bond_id)}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center">
            {tokenImage && (
              <div className="w-10 h-10 rounded-full mr-3 overflow-hidden shadow-md">
                <img src={tokenImage} alt={tokenSymbol} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">{offer.bond_name}</h3>
              <div className="text-sm text-gray-400">Token ID: {offer.nft_id}</div>
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
            <span className="font-medium">{formatTokenAmount(offer.price)} {getTokenSymbol(offer.price_denom)}</span>
          </div>
        </div>
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!window.keplr) {
      showAlert("Please install Keplr extension", "error");
      return;
    }

    try {
      const [bondId, nftId] = formData.bond_id.split('|');

      // Calculate minute offsets from current time
      const now = new Date();
      const startDate = new Date(`${formData.start_time}`);
      const endDate = new Date(`${formData.end_time}`);

      // Validate dates
      if (endDate <= startDate) {
        throw new Error("End date must be after start date");
      }

      // Calculate offsets in minutes (ceiling)
      const startOffset = Math.ceil((startDate - now) / (1000 * 60));
      const endOffset = Math.ceil((endDate - now) / (1000 * 60));
      
      // Ensure claim_start_offset is after end_offset
      const claimStartOffset = endOffset + 30; // 30 minutes after end
      
      // Ensure mature_offset is equal to or greater than claim_start_offset
      const maturityOffset = claimStartOffset + 30; // 30 minutes after claim start

      // Query contract for exact timestamps, including all required offsets
      const timestampQuery = {
        get_timestamp_offsets: {
          start_offset: startOffset,
          end_offset: endOffset,
          claim_start_offset: claimStartOffset,  // After end_offset
          mature_offset: maturityOffset  // After or equal to claim_start_offset
        }
      };

      const timestamps = await queryContract(timestampQuery);
      
      const msg = {
        create_resale_offer: {
          bond_id: Number(bondId),
          nft_token_id: formData.nft_id.toString(),
          price_per_bond: String(
            Math.floor(
              parseFloat(formData.price_per_bond) * 
              10 ** (tokenMappings[formData.price_denom]?.decimals || 6)
            )
          ),
          price_denom: formData.price_denom,
          start_time: timestamps.start_time.toString(),
          end_time: timestamps.end_time.toString()
        }
      };

      // Log the message before sending to verify the structure
      console.log('Message to be sent:', JSON.stringify(msg, null, 2));

      const fee = {
        amount: [{
          denom: "uwhale",
          amount: "1000000"
        }],
        gas: "1000000"
      };

      const response = await signingClient.execute(
        connectedWalletAddress,
        contractAddress,
        msg,
        fee
      );

      console.log('✅ Transaction response:', response);
      showAlert("Resale offer created successfully!", "success");
      setIsModalOpen(false);
      fetchResaleOffers();

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
            value={`${formData.bond_id}|${formData.nft_id}`}
            onChange={async (e) => {
              const [bondId, nftId] = e.target.value.split('|');
              if (bondId) {
                setFormData(prevState => ({
                  ...prevState,
                  bond_id: bondId,
                  nft_id: nftId
                }));

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
            title="Bond Name · Amount · NFT ID · Purchase Date"
          >
            <option value="" className="text-gray-400">
              Bond Name · Amount · NFT ID · Purchase Date
            </option>
            {userBonds.map((bond) => {
              const isEligible = bond.canListForResale;
              const status = isEligible ? "" : 
                (bond.maturityDate && new Date() > bond.maturityDate) ? " (Matured)" :
                (bond.purchaseEndDate && new Date() <= bond.purchaseEndDate) ? " (Purchase Period Active)" :
                " (Not Eligible)";

              const uniqueKey = `bond_${bond.bond_id}_nft_${bond.nft_id}`;
              const displayText = `${bond.name} · ${formatAmount(bond.amount)} · ${bond.nft_id} · ${formatDate(bond.purchase_time)}${status}`;

              return (
                <option 
                  key={uniqueKey}
                  value={`${bond.bond_id}|${bond.nft_id}`}
                  disabled={!isEligible}
                  className={!isEligible ? "text-gray-500" : ""}
                >
                  {displayText}
                </option>
              );
            })}
          </select>
          <div className="absolute left-0 -top-8 w-full px-2 py-1 bg-gray-900 text-xs text-gray-300 
            rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none
            border border-gray-700 whitespace-nowrap">
            Format: Bond Name · Amount · NFT ID · Purchase Date
          </div>
        </div>
        {userBonds.length > 0 && !userBonds.some(bond => bond.canListForResale) && (
          <p className="mt-2 text-sm text-red-400">
            You don't have any bonds eligible for resale. Bonds can only be listed after the purchase period ends and before maturation.
          </p>
        )}
      </div>
    );
  };

  const UserBondsSection = () => {
    if (!connectedWalletAddress || userBonds.length === 0) return null;

    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Bond Purchases</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {userBonds.map((purchase) => (
            <div 
              key={purchase.bond_id}
              className="backdrop-blur-sm rounded-xl p-6 
                border border-gray-700/50 bg-gray-800/80"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Bond #{purchase.bond_id}</h3>
                  <div className="text-sm text-gray-400">NFT ID: {purchase.nft_id}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  purchase.status === 'Unclaimed' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {purchase.status}
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
              </div>
            </div>
          ))}
        </div>
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

  return (
    <div 
      className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
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
      <div className="max-w-7xl mx-auto w-full px-4 mt-10">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold h1-color">Bond Resale Market</h1>
            <span className={`px-3 py-1 text-sm rounded-full ${
              isTestnet 
                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                : 'bg-green-500/20 text-green-400 border border-green-500/30'
            }`}>
              {isTestnet ? 'Testnet' : 'Mainnet'}
            </span>
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

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-[calc(100vh-200px)]">
            <div className="text-white mb-4">Loading Resale Offers...</div>
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOffers.length === 0 ? (
              <div className="col-span-full text-center text-gray-400 mt-8">
                No bonds are currently listed for resale
              </div>
            ) : (
              filteredOffers.map((offer) => (
                <ResaleCard key={`${offer.bond_id}-${offer.nft_id}`} offer={offer} />
              ))
            )}
          </div>
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
                      type="number"
                      step="0.000001"
                      value={formData.price_per_bond}
                      onChange={(e) => setFormData({...formData, price_per_bond: e.target.value})}
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
  );
}

export default ResaleBonds;