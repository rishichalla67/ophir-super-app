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

const CHAIN_ID = "narwhal-2";

function ResaleBonds() {

  const migalooRPC = "https://migaloo-rpc.polkachu.com/";
  const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";
  const OPHIR_DECIMAL = BigInt(1000000);

  const [resaleOffers, setResaleOffers] = useState([]);
  const [isTestnet, setIsTestnet] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const [rpc, setRPC] = useState(migalooTestnetRPC);
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    bond_id: '',
    nft_token_id: '',
    price_per_bond: '',
    price_denom: 'ujuno',
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
      setResaleOffers(response.offers || []);
      
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
      
      if (response && Array.isArray(response.bond_purchases)) {
        const transformedBonds = response.bond_purchases.map(purchase => ({
          ...purchase,
          purchase_time: new Date(Number(purchase.purchase_time) / 1_000_000),
          amount: purchase.amount,
          claimed_amount: purchase.claimed_amount,
          bond_id: purchase.bond_id,
          nft_token_id: purchase.nft_token_id
        }));
        console.log('✨ Transformed bonds:', transformedBonds);
        setUserBonds(transformedBonds);
      }
    } catch (error) {
      console.error('❌ Error fetching user bonds:', error);
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
          await window.keplr.enable(CHAIN_ID);
          const offlineSigner = await window.keplr.getOfflineSigner(CHAIN_ID);
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
    const tokenImage = getTokenImage(tokenSymbol);

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
              <h3 className="text-lg font-semibold">Bond #{offer.bond_id}</h3>
              <div className="text-sm text-gray-400">Token ID: {offer.nft_token_id}</div>
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

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    
    if (!window.keplr) {
      showAlert("Please install Keplr extension", "error");
      return;
    }

    try {
      console.log('🚀 Creating resale offer...');
      
      if (window.keplr?.experimentalSuggestChain) {
        await window.keplr?.experimentalSuggestChain({
          chainId: CHAIN_ID,
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
          currencies: [
            { coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 },
          ],
          feeCurrencies: [
            { coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 },
          ],
          stakeCurrency: {
            coinDenom: "whale",
            coinMinimalDenom: "uwhale",
            coinDecimals: 6,
          },
          gasPriceStep: { low: 0.2, average: 0.45, high: 0.75 },
        });
      }

      await window.keplr?.enable(CHAIN_ID);
      const offlineSigner = window.keplr?.getOfflineSigner(CHAIN_ID);
      const signingClient = await SigningCosmWasmClient.connectWithSigner(rpc, offlineSigner);

      const msg = {
        create_resale_offer: {
          bond_id: String(parseInt(formData.bond_id)),
          nft_token_id: String(formData.nft_token_id),
          price_per_bond: String(
            Math.round(
              parseFloat(formData.price_per_bond) * 
              10 ** (tokenMappings[formData.price_denom]?.decimals || 6)
            )
          ),
          price_denom: formData.price_denom,
          start_time: String(Math.floor(
            DateTime.fromISO(formData.start_time).toSeconds() * 1_000_000
          )),
          end_time: String(Math.floor(
            DateTime.fromISO(formData.end_time).toSeconds() * 1_000_000
          ))
        }
      };

      console.log('📝 Transaction message:', msg);
      console.log('📍 Contract address:', contractAddress);

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
      console.error('❌ Error creating resale offer:', error);
      showAlert(`Error creating resale offer: ${error.message}`, "error");
    }
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
                  <div className="text-sm text-gray-400">NFT ID: {purchase.nft_token_id}</div>
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
      console.log('🔍 Fetching bond details for ID:', bondId);
      
      const message = {
        get_bond_offer: { bond_id: parseInt(bondId) }
      };
      
      const response = await queryContract(message);
      console.log('📦 Bond details response:', response);
      
      return response.bond_offer;
    } catch (error) {
      console.error('❌ Error fetching bond details:', error);
      showAlert(`Error fetching bond details: ${error.message}`, "error");
      return null;
    }
  };

  const CreateOfferModal = () => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-gray-900/90 rounded-2xl w-full max-w-sm border border-gray-700/50 shadow-xl">
        <div className="p-4">
          <h2 className="text-lg font-bold mb-3 text-center text-white">Create Resale Offer</h2>
          
          <form onSubmit={handleCreateOffer} className="space-y-3">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">Select Bond</label>
                <select
                  className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                  value={`${formData.bond_id}|${formData.nft_token_id}`}
                  onChange={async (e) => {
                    const [bondId, nftId] = e.target.value.split('|');
                    if (bondId) {
                      // Set form data first to maintain selection
                      setFormData(prevState => ({
                        ...prevState,
                        bond_id: bondId,
                        nft_token_id: nftId
                      }));

                      // Then fetch bond details
                      const bondDetails = await fetchBondDetails(bondId);
                      console.log('✨ Retrieved bond details:', bondDetails);
                      
                      // Update additional details without changing the selection
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
                  <option value="">Select a bond</option>
                  {userBonds.map((bond) => (
                    <option 
                      key={`${bond.bond_id}-${bond.nft_token_id}`} 
                      value={`${bond.bond_id}|${bond.nft_token_id}`}
                    >
                      Bond #{bond.bond_id} - NFT #{bond.nft_token_id}
                    </option>
                  ))}
                </select>
              </div>

              <input type="hidden" value={formData.bond_id} />
              <input type="hidden" value={formData.nft_token_id} />

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">Price per Bond</label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.price_per_bond}
                  onChange={(e) => setFormData({...formData, price_per_bond: e.target.value})}
                  className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">Price Denom</label>
                <select
                  value={formData.price_denom}
                  onChange={(e) => setFormData({...formData, price_denom: e.target.value})}
                  className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                >
                  <option value="">Select denomination</option>
                  {uniqueDenoms.map((denom) => (
                    <option key={denom} value={denom}>
                      {tokenMappings[denom]?.symbol || denom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">Start Time</label>
                <input
                  type="datetime-local"
                  value={formData.start_time}
                  onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                  className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-gray-300">End Time</label>
                <input
                  type="datetime-local"
                  value={formData.end_time}
                  onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                  className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 transition duration-300 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="landing-button px-4 py-2 rounded-md hover:bg-yellow-500 transition duration-300 text-sm"
              >
                Create Offer
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

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
          <h1 className="text-3xl font-bold h1-color">Bond Resale Market</h1>
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
                <ResaleCard key={`${offer.bond_id}-${offer.nft_token_id}`} offer={offer} />
              ))
            )}
          </div>
        )}
      </div>

      {isModalOpen && <CreateOfferModal />}
    </div>
  );
}

export default ResaleBonds;