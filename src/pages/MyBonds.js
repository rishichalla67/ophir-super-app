import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigningCosmWasmClient, CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';
import { useCrypto } from '../context/CryptoContext';
import { useNetwork } from '../context/NetworkContext';
import { useBondCache } from '../context/BondCacheContext';
import { tokenMappings } from "../utils/tokenMappings";
import { tokenImages } from "../utils/tokenImages";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import { nftInfoCache, batchGetNFTInfo } from '../utils/nftCache';
import BigInt from "big-integer";
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import { getTimestampOffsets, convertContractTimeToDate, queryContract } from '../utils/contractUtils';
import { daoConfig } from '../utils/daoConfig';
import TokenDropdown from '../components/TokenDropdown';

const OPHIR_DECIMAL = BigInt(1000000);

const MyBonds = () => {
  const { connectedWalletAddress } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const { prices } = useCrypto();
  const navigate = useNavigate();
  const { isTestnet, rpc, contractAddress } = useNetwork();
  const { bonds, fetchAllBonds, invalidateBond } = useBondCache();

  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [userBonds, setUserBonds] = useState([]);
  const [claimingStates, setClaimingStates] = useState({});
  const [isLoadingUserBonds, setIsLoadingUserBonds] = useState(false);
  const [claimingAllStates, setClaimingAllStates] = useState({});
  const [isClaimingAll, setIsClaimingAll] = useState(false);
  const [transferringStates, setTransferringStates] = useState({});
  const [selectedBonds, setSelectedBonds] = useState(new Set());
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAddress, setTransferAddress] = useState('');
  const [showResaleModal, setShowResaleModal] = useState(false);
  const [resaleFormData, setResaleFormData] = useState({
    bond_id: '',
    nft_id: '',
    price_per_bond: '',
    price_denom: 'uwhale',
    start_time: '',
    end_time: ''
  });
  const [cosmWasmClient, setCosmWasmClient] = useState(null);

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const getSigner = async () => {
    try {
      if (!window.keplr) {
        throw new Error("Keplr wallet not found. Please install Keplr extension.");
      }

      const chainId = isTestnet ? "narwhal-2" : "migaloo-1";
      await window.keplr.enable(chainId);
      return window.keplr.getOfflineSigner(chainId);
    } catch (error) {
      console.error("Error getting signer:", error);
      showAlert(error.message, "error");
      throw error;
    }
  };

  const fetchUserBonds = useCallback(async () => {
    if (!connectedWalletAddress || !bonds.length) {
      console.log('Early return:', { connectedWalletAddress, bondsLength: bonds.length });
      return;
    }
    
    try {
      setIsLoadingUserBonds(true);
      let allUserBonds = new Map();
      
      console.log('Starting fetch with bonds:', bonds);
      const client = await CosmWasmClient.connect(rpc);
      
      // Create a map of bond ID to NFT contract address
      const bondContracts = new Map();
      bonds.forEach(bond => {
        if (bond.contract_addr) {
          bondContracts.set(bond.bond_id, bond.contract_addr);
        }
      });
      
      console.log('Bond contracts map:', Object.fromEntries(bondContracts));

      // Process each bond's NFT contract
      const contractQueries = Array.from(bondContracts.entries()).map(async ([bondId, contractAddr]) => {
        try {
          console.log(`Querying contract ${contractAddr} for bond ${bondId}`);
          const ownershipQuery = {
            tokens: {
              owner: connectedWalletAddress,
              limit: 30
            }
          };

          const ownershipResponse = await client.queryContractSmart(contractAddr, ownershipQuery);
          console.log(`Ownership response for bond ${bondId}:`, ownershipResponse);
          const ownedTokenIds = ownershipResponse.tokens || [];

          if (ownedTokenIds.length === 0) return;

          // Get NFT info for each owned token
          const nftInfos = await batchGetNFTInfo(contractAddr, ownedTokenIds, rpc);
          console.log(`NFT infos for bond ${bondId}:`, nftInfos);

          // Process each owned NFT
          const nftProcessing = ownedTokenIds.map(async (tokenId) => {
            const nftInfo = nftInfos[tokenId];
            if (!nftInfo) {
              console.log(`No NFT info for token ${tokenId}`);
              return;
            }

            const attributes = nftInfo.extension?.attributes || [];
            const bondIdAttr = attributes.find(attr => attr.trait_type === 'bond_id');
            const amountAttr = attributes.find(attr => attr.trait_type === 'amount');
            const claimedAmountAttr = attributes.find(attr => attr.trait_type === 'claimed_amount');
            
            // Skip if this NFT is not for this bond
            const nftBondId = bondIdAttr ? parseInt(bondIdAttr.value) : parseInt(bondId);
            if (nftBondId !== parseInt(bondId)) {
              console.log(`NFT ${tokenId} bond ID mismatch: ${nftBondId} !== ${bondId}`);
              return;
            }

            const matchingBond = bonds.find(b => b.bond_id === parseInt(bondId));
            if (!matchingBond) {
              console.log(`No matching bond found for ID ${bondId}`);
              return;
            }

            const uniqueKey = `${bondId}_${tokenId}`;
            allUserBonds.set(uniqueKey, {
              ...matchingBond,
              nft_token_id: tokenId,
              contract_address: contractAddr,
              name: nftInfo.extension?.name || `Bond #${bondId}`,
              amount: amountAttr?.value || matchingBond.amount || "0",
              claimed_amount: claimedAmountAttr?.value || "0",
              status: parseInt(claimedAmountAttr?.value || "0") >= parseInt(amountAttr?.value || "0") 
                ? "Claimed" 
                : "Claimable"
            });
          });

          await Promise.all(nftProcessing);
        } catch (error) {
          console.error(`Error processing bond ${bondId}:`, error);
        }
      });

      await Promise.all(contractQueries);
      const uniqueUserBonds = Array.from(allUserBonds.values());
      console.log('Final user bonds:', uniqueUserBonds);
      setUserBonds(uniqueUserBonds);

    } catch (error) {
      console.error("Error fetching user bonds:", error);
      showAlert("Error fetching your bonds", "error");
    } finally {
      setIsLoadingUserBonds(false);
    }
  }, [connectedWalletAddress, bonds, rpc, contractAddress]);

  useEffect(() => {
    const initializeBonds = async () => {
      if (!connectedWalletAddress) return;
      
      try {
        // First ensure we have all bonds
        const allBonds = await fetchAllBonds();
        if (allBonds.length > 0) {
          // Only fetch user bonds after we have all bonds
          await fetchUserBonds();
        }
      } catch (error) {
        console.error("Error initializing bonds:", error);
      }
    };

    initializeBonds();
  }, [connectedWalletAddress, fetchAllBonds, fetchUserBonds]);

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

  const getTokenSymbol = (denom) => {
    if (!denom) return '';
    return tokenMappings[denom]?.symbol || denom;
  };

  const getTokenImage = (denom) => {
    let token = tokenMappings[denom]?.symbol || denom;
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

  const handleClaim = async (bondId, nftTokenId, index) => {
    const claimKey = `${bondId}_${index}`;
    
    try {
      setClaimingStates(prev => ({ ...prev, [claimKey]: true }));

      if (!connectedWalletAddress) {
        showAlert("Please connect your wallet first", "error");
        return;
      }

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const bond = bonds.find(b => b.bond_id === parseInt(bondId));
      const contractAddr = bond?.contract_addr;

      if (!contractAddr) {
        throw new Error("Could not find NFT contract address");
      }

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

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        claimMsg,
        fee,
        "Claim Bond Rewards"
      );

      if (result.transactionHash) {
        nftInfoCache.delete(contractAddr, nftTokenId);
        invalidateBond(bondId);
        await fetchUserBonds();

        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        
        showAlert(
          `Rewards claimed successfully!`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction ${result.transactionHash}</a>`
        );
        
        setTimeout(async () => {
          await fetchAllBonds();
          await fetchUserBonds();
        }, 2000);
      }
    } catch (error) {
      console.error("Error claiming rewards:", error);
      showAlert(`Error claiming rewards: ${error.message}`, "error");
    } finally {
      setClaimingStates(prev => ({ ...prev, [claimKey]: false }));
    }
  };

  const handleClaimAll = async () => {
    try {
      setIsClaimingAll(true);

      if (!connectedWalletAddress) {
        showAlert("Please connect your wallet first", "error");
        return;
      }

      const claimableBonds = userBonds.filter(bond => {
        const isClaimed = bond.status === "Claimed" || 
          (bond.claimed_amount && parseInt(bond.claimed_amount) >= parseInt(bond.amount));
        return !isClaimed;
      });

      if (claimableBonds.length === 0) {
        showAlert("No claimable bonds found", "info");
        return;
      }

      const instructions = claimableBonds.map(bond => ({
        contractAddress: contractAddress,
        msg: {
          claim_rewards: {
            bond_id: parseInt(bond.bond_id),
            nft_token_id: bond.nft_token_id
          }
        }
      }));

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      const gasPerMsg = 750000;
      const totalGas = Math.min(3000000, gasPerMsg * instructions.length);

      const fee = {
        amount: [{ denom: "uwhale", amount: "75000" }],
        gas: totalGas.toString(),
      };

      const result = await client.executeMultiple(
        connectedWalletAddress,
        instructions,
        fee,
        "Claim All Bond Rewards"
      );

      if (result.transactionHash) {
        // Invalidate cache for all claimed bonds
        for (const bond of claimableBonds) {
          nftInfoCache.delete(bond.contract_address, bond.nft_token_id);
        }

        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        
        showAlert(
          `Successfully claimed all rewards! (${claimableBonds.length} bonds)`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction ${result.transactionHash}</a>`
        );
        
        setTimeout(async () => {
          await fetchAllBonds();
          await fetchUserBonds();
        }, 2000);
      }
    } catch (error) {
      console.error("Error claiming all rewards:", error);
      showAlert(`Error claiming rewards: ${error.message}`, "error");
    } finally {
      setIsClaimingAll(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferAddress || selectedBonds.size === 0) {
      showAlert("Please select bonds and enter a valid address", "error");
      return;
    }

    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      for (const bondKey of selectedBonds) {
        const [bondId, tokenId] = bondKey.split('_');
        const bond = userBonds.find(b => 
          b.bond_id === parseInt(bondId) && b.nft_token_id === tokenId
        );

        if (!bond || !bond.contract_address) {
          console.error(`No contract address found for bond ${bondId}`);
          continue;
        }

        setTransferringStates(prev => ({ ...prev, [bondKey]: true }));

        const msg = {
          transfer_nft: {
            recipient: transferAddress,
            token_id: tokenId
          }
        };

        const fee = {
          amount: [{ denom: "uwhale", amount: "50000" }],
          gas: "500000",
        };

        // Execute transfer against the NFT contract address
        const result = await client.execute(
          connectedWalletAddress,
          bond.contract_address, // Use the NFT contract address
          msg,
          fee,
          "Transfer Bond NFT"
        );

        console.log(`Transfer result for bond ${bondId}:`, result);
      }

      showAlert("Successfully transferred selected bonds!", "success");
      setShowTransferModal(false);
      setSelectedBonds(new Set());
      setTransferAddress('');
      
      // Refresh data
      await fetchUserBonds();
    } catch (error) {
      console.error("Error transferring bonds:", error);
      showAlert(`Error transferring bonds: ${error.message}`, "error");
    } finally {
      setTransferringStates({});
    }
  };

  const handleCreateOffer = () => {
    navigate('/bonds/create');
  };

  const toggleBondSelection = (bondKey) => {
    setSelectedBonds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bondKey)) {
        newSet.delete(bondKey);
      } else {
        newSet.add(bondKey);
      }
      return newSet;
    });
  };

  const formatBondName = (name) => {
    if (!name) return '';
    return name.split('-')[0].trim();
  };

  // Modify the click handler to check if the click was on a button
  const handleBondClick = (event, bondId) => {
    // Don't navigate if clicked on a button
    if (event.target.tagName.toLowerCase() === 'button' || 
        event.target.closest('button')) {
      return;
    }
    navigate(`/bonds/${bondId}`);
  };

  const handleResaleClick = async (bond) => {
    try {
      if (!cosmWasmClient) {
        throw new Error('Client not initialized');
      }

      // Calculate default dates
      const now = new Date();
      const startDate = new Date(now.getTime() + 1 * 60 * 1000); // 1 minute from now
      const endDate = new Date(bond.maturityDate?.getTime() - 1 * 60 * 1000 || now.getTime() + 24 * 60 * 60 * 1000);

      // Get timestamp offsets
      const offsets = getTimestampOffsets(startDate, endDate);
      
      // Query contract for actual timestamps
      const timestampQuery = {
        get_timestamp_offsets: offsets
      };
      
      const timestamps = await queryContract(
        timestampQuery, 
        contractAddress, // This is already in your component's scope
        cosmWasmClient
      );
      
      // Convert contract timestamps to local dates
      const contractStartTime = convertContractTimeToDate(timestamps.start_time);
      const contractEndTime = convertContractTimeToDate(timestamps.end_time);

      // Format dates for the form
      const formatToLocalISOString = (date) => {
        return date.toLocaleString('sv').slice(0, 16); // 'sv' locale gives YYYY-MM-DD HH:mm format
      };

      setResaleFormData({
        bond_id: `${bond.bond_id}|${bond.nft_token_id}`,
        nft_id: bond.nft_token_id,
        price_per_bond: '',
        price_denom: 'uwhale',
        start_time: formatToLocalISOString(contractStartTime),
        end_time: formatToLocalISOString(contractEndTime),
      });

      setShowResaleModal(true);
    } catch (error) {
      console.error('Error preparing resale form:', error);
      showAlert('Error preparing resale form', 'error');
    }
  };

  const handleResaleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const [bondId, nftId] = resaleFormData.bond_id.split('|');
      const bond = userBonds.find(b => b.bond_id === parseInt(bondId) && b.nft_token_id === nftId);
      
      if (!bond) {
        throw new Error('Bond not found');
      }

      const signer = await getSigner();
      const signingClient = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      // Format the price to include 6 decimal places (multiply by 1_000_000)
      const priceAmount = Math.floor(parseFloat(resaleFormData.price_per_bond) * 1_000_000).toString();

      // Create the resale message
      const resaleMsg = {
        create_resale_offer: {
          bond_id: parseInt(bondId),
          nft_id: nftId,
          price: {
            amount: priceAmount,
            denom: resaleFormData.price_denom
          },
          start_time: Math.floor(new Date(resaleFormData.start_time).getTime() / 1000).toString(),
          end_time: Math.floor(new Date(resaleFormData.end_time).getTime() / 1000).toString()
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

      const response = await signingClient.execute(
        connectedWalletAddress,
        bond.contract_address,
        msg,
        fee
      );

      showAlert("Resale offer created successfully!", "success");
      setShowResaleModal(false);
      await fetchUserBonds();

    } catch (error) {
      console.error('Error creating resale offer:', error);
      showAlert(`Error creating resale offer: ${error.message}`, "error");
    }
  };

  // Modify the existing button click handler
  const handleListClick = (e, bond) => {
    e.stopPropagation();
    handleResaleClick(bond);
  };

  const handleCopyAddress = async (contractAddr, e) => {
    e.stopPropagation(); // Prevent bond click event
    try {
      await navigator.clipboard.writeText(contractAddr);
      showAlert("Contract address copied to clipboard!", "success");
    } catch (error) {
      console.error("Failed to copy address:", error);
      showAlert("Failed to copy address", "error");
    }
  };

  // Modify the transfer button click handler
  const handleTransferClick = (e, bondId, nftTokenId) => {
    e.stopPropagation(); // Prevent bond click event
    setSelectedBonds(new Set([`${bondId}_${nftTokenId}`]));
    setShowTransferModal(true);
  };

  if (!connectedWalletAddress) {
    return (
      <div className={`global-bg-new text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
        style={{ paddingTop: "12dvh" }}>
        <div className="max-w-7xl mx-auto w-full px-4 mt-10">
          <div className="flex flex-col items-center justify-center h-[60vh]">
            <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
            <p className="text-gray-400">Please connect your wallet to view your bonds</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`global-bg-new text-white min-h-screen w-full transition-all duration-300 ease-in-out ${
      isSidebarOpen ? 'md:pl-64' : ''
    }`}>
      <div className="pt-32 md:pt-24 w-[92%] md:w-[95%] md:max-w-10xl mx-auto">
        {/* Header with actions */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl md:text-3xl font-bold h1-color">My Bonds</h1>
          <div className="flex gap-2 md:gap-4">
            <button
              onClick={handleClaimAll}
              className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded-lg transition-colors"
            >
              Claim All
            </button>
            {/* <button
              onClick={() => setShowTransferModal(true)}
              disabled={selectedBonds.size === 0}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              Transfer Selected
            </button> */}
            <button
              onClick={handleCreateOffer}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
            >
              Create Bond
            </button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <div className="backdrop-blur-md bg-black/20 rounded-xl border border-gray-800/50 shadow-2xl">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="p-4 text-gray-400 font-medium">Bond Name</th>
                  <th className="p-4 text-gray-400 font-medium">Bond ID</th>
                  <th className="p-4 text-gray-400 font-medium">Token ID</th>
                  <th className="p-4 text-gray-400 font-medium">Amount</th>
                  <th className="p-4 text-gray-400 font-medium">Progress</th>
                  <th className="p-4 text-gray-400 font-medium">Status</th>
                  <th className="p-4 text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {userBonds.map((bond) => {
                  const isClaimed = bond.status === "Claimed" || 
                    (bond.claimed_amount && parseInt(bond.claimed_amount) >= parseInt(bond.amount));

                  return (
                    <tr 
                      key={`${bond.bond_id}_${bond.nft_token_id}`} 
                      className="border-b border-gray-700/50 transition-all duration-200 hover:bg-white/5 cursor-pointer"
                      onClick={(e) => handleBondClick(e, bond.bond_id)}
                    >
                      <td className="p-4">
                        <div className="font-medium text-white/90">
                          {formatBondName(bond.name) || `Bond #${bond.bond_id}`}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <div className="px-3 py-1 bg-gray-800/50 rounded-lg">
                            {bond.bond_id}
                          </div>
                          <button
                            onClick={(e) => handleCopyAddress(bond.contract_address, e)}
                            className="p-1.5 hover:bg-gray-700/50 rounded-lg transition-colors group"
                            title="Copy NFT Contract Address"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="px-3 py-1 bg-gray-800/50 rounded-lg inline-block">
                          {bond.nft_token_id}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-white/90">{formatAmount(bond.amount)}</span>
                          {bond?.token_denom && (
                            <img
                              src={getTokenImage(bond.token_denom)}
                              alt={getTokenSymbol(bond.token_denom)}
                              className="w-6 h-6 rounded-full ring-2 ring-gray-700/50"
                            />
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-4">
                          <div className="w-14 h-14 relative">
                            <CircularProgressbar
                              value={(parseInt(bond.claimed_amount || 0) / parseInt(bond.amount)) * 100}
                              text={`${((parseInt(bond.claimed_amount || 0) / parseInt(bond.amount)) * 100).toFixed(0)}%`}
                              styles={buildStyles({
                                textSize: '20px',
                                pathColor: '#F59E0B',
                                textColor: '#FFFFFF',
                                trailColor: '#1F2937',
                                pathTransitionDuration: 0.5,
                              })}
                            />
                          </div>
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-400">Claimed:</span>
                              <span className="text-yellow-300 font-medium">{formatAmount(bond.claimed_amount || 0)}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-gray-400">Total:</span>
                              <span className="text-yellow-300 font-medium">{formatAmount(parseInt(bond.amount))}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-block ${
                          isClaimed 
                            ? 'bg-gray-700/30 text-gray-400 border border-gray-600/30' 
                            : 'bg-green-500/10 text-green-400 border border-green-500/30'
                        }`}>
                          {isClaimed ? 'Claimed' : 'Claimable'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          {!isClaimed && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClaim(bond.bond_id, bond.nft_token_id);
                                }}
                                className="px-4 py-1.5 bg-green-500 hover:bg-green-400 text-black text-sm font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-green-500/20"
                              >
                                Claim
                              </button>
                              <button
                                onClick={(e) => handleListClick(e, bond)}
                                className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-yellow-500/20"
                              >
                                List
                              </button>
                            </>
                          )}
                          <button
                            onClick={(e) => handleTransferClick(e, bond.bond_id, bond.nft_token_id)}
                            className="px-4 py-1.5 bg-blue-500 hover:bg-blue-400 text-black text-sm font-medium rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20"
                          >
                            Transfer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {userBonds.map((bond) => {
            const isClaimed = bond.status === "Claimed" || 
              (bond.claimed_amount && parseInt(bond.claimed_amount) >= parseInt(bond.amount));

            return (
              <div 
                key={`${bond.bond_id}_${bond.nft_token_id}`} 
                className="bond-buy backdrop-blur-sm rounded-lg p-4 shadow-xl border border-gray-700 cursor-pointer"
                onClick={(e) => handleBondClick(e, bond.bond_id)}
              >
                {/* Bond Name */}
                <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg mb-4">
                  <p className="text-gray-400 text-xs mb-0.5">Bond Name:</p>
                  <p className="text-sm md:text-xl font-bold text-center">
                    {formatBondName(bond.name) || `Bond #${bond.bond_id}`}
                  </p>
                </div>

                {/* Bond Info Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
                    <p className="text-gray-400 text-xs mb-0.5">Bond ID:</p>
                    <div className="flex items-center justify-center space-x-2">
                      <p className="text-sm md:text-xl font-bold">{bond.bond_id}</p>
                      <button
                        onClick={(e) => handleCopyAddress(bond.contract_address, e)}
                        className="p-1.5 hover:bg-gray-700/50 rounded-lg transition-colors group"
                        title="Copy NFT Contract Address"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
                    <p className="text-gray-400 text-xs mb-0.5">Token ID:</p>
                    <p className="text-sm md:text-xl font-bold text-center">{bond.nft_token_id}</p>
                  </div>

                  <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
                    <p className="text-gray-400 text-xs mb-0.5">Amount:</p>
                    <div className="flex items-center justify-center">
                      <p className="text-sm md:text-xl font-bold">{formatAmount(bond.amount)}</p>
                      {bond?.token_denom && (
                        <img
                          src={getTokenImage(bond.token_denom)}
                          alt={getTokenSymbol(bond.token_denom)}
                          className="w-6 h-6 ml-2 rounded-full"
                        />
                      )}
                    </div>
                  </div>

                  <div className="p-2 md:p-4 bond-buy-text-container bg-gray-900/50 rounded-lg">
                    <p className="text-gray-400 text-xs mb-0.5">Status:</p>
                    <p className="text-sm md:text-xl font-bold text-center">
                      {isClaimed ? 'Claimed' : 'Claimable'}
                    </p>
                  </div>
                </div>

                {/* Progress Circle */}
                {bond.claimed_amount && (
                  <div className="mt-4 flex items-center p-3 bond-buy-text-container bg-gray-900/50 rounded-lg mb-4">
                    <div className="w-16 h-16 md:w-24 md:h-24 mr-4">
                      <CircularProgressbar
                        value={(parseInt(bond.claimed_amount) / parseInt(bond.amount)) * 100}
                        text={`${((parseInt(bond.claimed_amount) / parseInt(bond.amount)) * 100).toFixed(0)}%`}
                        styles={buildStyles({
                          textSize: '16px',
                          pathColor: '#F59E0B',
                          textColor: '#FFFFFF',
                          trailColor: '#1F2937',
                        })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs md:text-sm">
                        Claimed: <span className="text-yellow-300 font-bold">
                          {formatAmount(bond.claimed_amount)}
                        </span>
                      </p>
                      <p className="text-xs md:text-sm">
                        Total: <span className="text-yellow-300 font-bold">
                          {formatAmount(parseInt(bond.amount))}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {!isClaimed ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClaim(bond.bond_id, bond.nft_token_id);
                        }}
                        className="px-3 py-2 bg-green-500 hover:bg-green-400 text-black text-sm font-bold rounded-lg transition-colors"
                      >
                        Claim
                      </button>
                      <button
                        onClick={(e) => handleListClick(e, bond)}
                        className="px-3 py-2 bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold rounded-lg transition-colors"
                      >
                        List
                      </button>
                      <button
                        onClick={(e) => handleTransferClick(e, bond.bond_id, bond.nft_token_id)}
                        className="px-3 py-2 bg-blue-500 hover:bg-blue-400 text-black text-sm font-bold rounded-lg transition-colors"
                      >
                        Transfer
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => handleTransferClick(e, bond.bond_id, bond.nft_token_id)}
                      className="col-span-3 px-3 py-2 bg-blue-500 hover:bg-blue-400 text-black text-sm font-bold rounded-lg transition-colors"
                    >
                      Transfer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Transfer Modal */}
        {showTransferModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">Transfer Bond</h2>
              
              {/* Bond Details */}
              {Array.from(selectedBonds).map(bondKey => {
                const [bondId, tokenId] = bondKey.split('_');
                const bond = userBonds.find(b => 
                  b.bond_id === parseInt(bondId) && b.nft_token_id === tokenId
                );
                
                return bond && (
                  <div key={bondKey} className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Bond Name:</span>
                        <span className="font-medium">{formatBondName(bond.name) || `Bond #${bond.bond_id}`}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Bond ID:</span>
                        <span className="font-medium">{bond.bond_id}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Token ID:</span>
                        <span className="font-medium">{bond.nft_token_id}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Amount:</span>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{formatAmount(bond.amount)}</span>
                          {bond?.token_denom && (
                            <img
                              src={getTokenImage(bond.token_denom)}
                              alt={getTokenSymbol(bond.token_denom)}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Status:</span>
                        <span className={`px-2 py-0.5 rounded text-sm ${
                          bond.status === "Claimed" ? 'bg-gray-700 text-gray-300' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {bond.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="space-y-2 mb-6">
                <label className="block text-sm font-medium text-gray-400">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={transferAddress}
                  onChange={(e) => setTransferAddress(e.target.value)}
                  placeholder="Enter recipient address"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg 
                    focus:outline-none focus:border-yellow-400 text-white placeholder-gray-500"
                />
              </div>

              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => {
                    setShowTransferModal(false);
                    setSelectedBonds(new Set());
                    setTransferAddress('');
                  }}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTransfer}
                  disabled={!transferAddress}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
                    transferAddress 
                      ? 'bg-blue-500 hover:bg-blue-400 text-black' 
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Confirm Transfer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Resale Modal */}
        {showResaleModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-gray-900/90 rounded-2xl w-full max-w-sm border border-gray-700/50 shadow-xl">
              <div className="p-4">
                <h2 className="text-lg font-bold mb-3 text-center text-white">Create Resale Offer</h2>
                
                <form onSubmit={handleResaleSubmit} className="space-y-3">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-300">Price per Bond</label>
                      <input
                        type="text"
                        value={resaleFormData.price_per_bond}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          // Only allow numbers and decimals
                          if (newValue === '' || /^\d*\.?\d*$/.test(newValue)) {
                            setResaleFormData({...resaleFormData, price_per_bond: newValue});
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
                        value={resaleFormData.price_denom}
                        onChange={(e) => setResaleFormData({ ...resaleFormData, price_denom: e.target.value })}
                        label="Price Token"
                        allowedDenoms={['factory/migaloo17c5ped2d24ewx9964ul6z2jlhzqtz5gvvg80z6x9dpe086v9026qfznq2e/daoophir', 'uwhale']}
                        isTestnet={isTestnet}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-300">Start Time</label>
                        <input
                          type="datetime-local"
                          value={resaleFormData.start_time}
                          onChange={(e) => setResaleFormData({...resaleFormData, start_time: e.target.value})}
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
                          value={resaleFormData.end_time}
                          onChange={(e) => setResaleFormData({...resaleFormData, end_time: e.target.value})}
                          className="w-full p-2 rounded-lg bg-gray-800/50 border border-gray-700 
                            focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 
                            focus:outline-none transition-all text-white"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-700">
                    <button
                      type="button"
                      onClick={() => setShowResaleModal(false)}
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
};

export default MyBonds; 