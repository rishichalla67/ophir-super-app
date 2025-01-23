import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';
import { useNetwork } from '../context/NetworkContext';
import { SigningCosmWasmClient, CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { formatTokenAmount } from '../utils/helpers';
import { tokenSymbols, tokenMappings } from '../utils/tokenMappings';
import { tokenImages } from '../utils/tokenImages';
import { daoConfig } from '../utils/daoConfig';
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import NetworkSwitcher from '../components/NetworkSwitcher';
import { getNFTInfo, nftInfoCache } from '../utils/nftCache';

function BuyResaleBonds() {
  const { bondIdNftId } = useParams();
  const [bondId, nftId] = bondIdNftId.split('_');
  const navigate = useNavigate();
  const { isTestnet, rpc, chainId } = useNetwork();
  const { connectedWalletAddress } = useWallet();
  const { isSidebarOpen } = useSidebar();
  
  const [isLoading, setIsLoading] = useState(true);
  const [offer, setOffer] = useState(null);
  const [alertInfo, setAlertInfo] = useState({ open: false, message: "", severity: "info" });
  const [signingClient, setSigningClient] = useState(null);
  const [bondOffersCache] = useState(new Map());

  const bondContractAddress = isTestnet ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET : daoConfig.BONDS_CONTRACT_ADDRESS;

  const showAlert = (message, severity = "info") => {
    setAlertInfo({ open: true, message, severity });
  };

  const getBondOfferFromCache = (bondId) => {
    const cached = bondOffersCache.get(bondId);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 minutes cache
      return cached.data;
    }
    return null;
  };

  const setBondOfferInCache = (bondId, data) => {
    bondOffersCache.set(bondId, {
      data,
      timestamp: Date.now()
    });
  };

  const queryContract = async (message) => {
    try {
      const client = await CosmWasmClient.connect(rpc);
      return await client.queryContractSmart(bondContractAddress, message);
    } catch (error) {
      console.error('Contract query failed:', error);
      throw error;
    }
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

  const fetchResaleOffer = async () => {
    try {
      setIsLoading(true);
      console.log('Fetching resale offer for:', { bondId, nftId });
      
      const message = {
        get_resale_offer: {
          bond_id: parseInt(bondId),
          nft_token_id: nftId
        }
      };
      
      const response = await queryContract(message);
      console.log('Raw resale offer response:', response);
      
      // Fetch bond offer details using cache
      const bondOffer = await fetchBondOffer(bondId);
      console.log('Bond offer details:', bondOffer);

      // Fetch NFT info if contract address exists
      let nftInfo = null;
      if (bondOffer?.nft_contract_addr) {
        try {
          const contractResults = await getNFTInfo(
            bondOffer.nft_contract_addr,
            nftId,
            rpc
          );
          nftInfo = contractResults;
        } catch (error) {
          console.error('Error fetching NFT info:', error);
        }
      }

      // Get amount from NFT info or bond offer
      const amount = nftInfo?.extension?.attributes?.find(attr => attr.trait_type === 'amount')?.value || 
                    bondOffer?.total_amount || "0";

      const processedOffer = {
        ...response.offer,
        bond_details: bondOffer,
        bond_name: bondOffer?.bond_name || `Bond #${bondId}`,
        price_per_bond: response.offer?.price_per_bond || "0",
        price_denom: response.offer?.price_denom || "uwhale",
        amount: amount, // Use the extracted amount
        token_denom: bondOffer?.token_denom,
        nft_info: nftInfo
      };

      console.log('Final processed offer:', processedOffer);
      setOffer(processedOffer);

    } catch (error) {
      console.error('Error fetching resale offer:', error);
      showAlert('Error fetching offer details', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResaleOffer();
  }, [bondId, nftId]);

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
  }, [connectedWalletAddress, chainId, rpc]);

  const handlePurchase = async () => {
    if (!connectedWalletAddress) {
      showAlert('Please connect your wallet first', 'warning');
      return;
    }

    try {
      const msg = {
        purchase_resale_offer: {
          bond_id: parseInt(bondId),
          nft_token_id: nftId
        }
      };

      if (!offer.price_per_bond) {
        throw new Error('Price not available');
      }

      const fee = {
        amount: [{ denom: "uwhale", amount: "1000000" }],
        gas: "1000000"
      };

      const tokenDecimals = tokenMappings[offer.price_denom]?.decimals || 6;
      
      const amount = (parseFloat(offer.price_per_bond) * Math.pow(10, tokenDecimals)).toString();

      const funds = [{
        denom: offer.price_denom,
        amount: amount
      }];

      console.log('Executing purchase with funds:', funds);

      const response = await signingClient.execute(
        connectedWalletAddress,
        bondContractAddress,
        msg,
        fee,
        "",
        funds
      );

      showAlert('Purchase successful!', 'success');
      setTimeout(() => navigate('/bonds/resale'), 2000);
    } catch (error) {
      console.error('Error purchasing bond:', error);
      showAlert(`Error: ${error.message}`, 'error');
    }
  };

  const getTokenSymbol = (denom) => {
    if (!denom) return '';
    return tokenMappings[denom]?.symbol || denom;
  };

  const isOfferEnded = () => {
    if (!offer?.end_time) return true;
    const endTime = new Date(parseInt(offer.end_time) / 1_000_000);
    return endTime < new Date();
  };

  if (isLoading) {
    return (
      <div className="global-bg min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="global-bg min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Offer not found</div>
      </div>
    );
  }

  return (
    <div className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}>
      <div className="w-[90vw] max-w-3xl mx-auto px-4">
        <Snackbar
          open={alertInfo.open}
          autoHideDuration={6000}
          onClose={() => setAlertInfo({ ...alertInfo, open: false })}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert
            onClose={() => setAlertInfo({ ...alertInfo, open: false })}
            severity={alertInfo.severity}
            sx={{ width: "100%" }}
          >
            {alertInfo.message}
          </Alert>
        </Snackbar>

        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold h1-color">Purchase Resale Bond</h1>
          <NetworkSwitcher />
        </div>

        <div className="backdrop-blur-sm rounded-xl p-6 border border-gray-700/50 bg-gray-800/80">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {offer?.bond_name || `Bond #${bondId}`}
              </h2>
              <span className="text-sm text-gray-400">NFT ID: {nftId}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-gray-400">Amount</span>
                <div className="font-medium">
                  {formatTokenAmount(offer?.amount || "0")} {getTokenSymbol(offer?.token_denom)}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-gray-400">Price</span>
                <div className="font-medium">
                  {offer?.price_per_bond || "0"} {getTokenSymbol(offer?.price_denom)}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-gray-400">Seller</span>
                <div className="font-medium text-sm break-all">
                  {offer?.seller || "-"}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-gray-400">End Time</span>
                <div className="font-medium">
                  {offer?.end_time ? new Date(parseInt(offer.end_time) / 1_000_000).toLocaleDateString() : '-'}
                </div>
              </div>

              {offer?.nft_info && (
                <div className="col-span-2 space-y-2">
                  <span className="text-gray-400">NFT Details</span>
                  <div className="text-sm space-y-1">
                    {offer.nft_info.extension?.attributes?.map((attr, index) => (
                      <div key={index} className="flex justify-between">
                        <span className="text-gray-400">{attr.trait_type}:</span>
                        <span>{attr.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handlePurchase}
              disabled={!connectedWalletAddress || isOfferEnded()}
              className={`w-full py-3 rounded-lg text-center transition duration-300 ${
                connectedWalletAddress && !isOfferEnded()
                  ? 'landing-button hover:bg-yellow-500'
                  : 'bg-gray-700 cursor-not-allowed'
              }`}
            >
              {!connectedWalletAddress 
                ? 'Connect Wallet to Purchase' 
                : isOfferEnded()
                  ? 'Offer Has Ended'
                  : 'Purchase Bond'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyResaleBonds; 