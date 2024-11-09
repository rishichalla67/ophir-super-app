import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [userBonds, setUserBonds] = useState([]);
  const [claimingBondId, setClaimingBondId] = useState(null);

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
      showAlert(`Error querying contract: ${error.message}`, "error");
      throw error;
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const message = { get_all_bond_offers: {} };
      const data = await queryContract(message);
      
      if (data && Array.isArray(data.bond_offers)) {
        const transformedBonds = data.bond_offers.map(bond => ({
          ...bond,
          start_time: convertContractTimeToDate(bond.purchase_start_time),
          end_time: convertContractTimeToDate(bond.purchase_end_time),
          maturity_date: convertContractTimeToDate(bond.claim_end_time),
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

  const fetchUserBonds = async () => {
    if (!connectedWalletAddress) return;

    try {
      console.log('🔍 Fetching bonds for address:', connectedWalletAddress);
      
      const message = { 
        get_bonds_by_user: { 
          buyer: connectedWalletAddress 
        } 
      };
      
      console.log('📤 Query message:', message);
      console.log('📍 Contract address:', contractAddress);
      console.log('🔗 RPC endpoint:', rpc);
      
      const data = await queryContract(message);
      console.log('📦 Query response:', data);
      
      if (data && Array.isArray(data.bond_purchases)) {
        const transformedBonds = data.bond_purchases.map(purchase => ({
          ...purchase,
          purchase_time: convertContractTimeToDate(purchase.purchase_time),
          amount: purchase.amount,
          claimed_amount: purchase.claimed_amount,
          bond_id: purchase.bond_id,
        //   nft_token_id: purchase.nft_token_id
        }));
        console.log('✨ Transformed bonds:', transformedBonds);
        setUserBonds(transformedBonds);
      } else {
        console.warn('⚠️ Unexpected data structure:', data);
        setUserBonds([]);
      }
    } catch (error) {
      console.error('❌ Error fetching user bonds:', {
        error,
        message: error.message,
        contractAddress,
        rpc,
        walletAddress: connectedWalletAddress
      });
      
      let errorMessage = "Failed to fetch your bonds";
      if (error.message.includes("not found")) {
        errorMessage = "Contract not found. Please check the network settings.";
      } else if (error.message.includes("denomination")) {
        errorMessage = "Invalid denomination in the contract response.";
      } else if (error.message.includes("parsing")) {
        errorMessage = "Error parsing contract response.";
      }
      
      showAlert(errorMessage, "error");
      setUserBonds([]);
    }
  };

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

  const getTokenImage = (symbol) => {
    if (!symbol) return '';
    const lowerSymbol = symbol.toLowerCase();
    return tokenImages[lowerSymbol] || '';
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
      const statusOrder = { 'UPCOMING': 0, 'ACTIVE': 1, 'COMPLETED': 2 };
      const statusA = getBondStatus(a);
      const statusB = getBondStatus(b);
      
      if (statusOrder[statusA] !== statusOrder[statusB]) {
        return statusOrder[statusA] - statusOrder[statusB];
      }
      
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

  const debouncedSetSearchTerm = useCallback(
    debounce((value) => setDebouncedSearchTerm(value), 300),
    []
  );

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    debouncedSetSearchTerm(e.target.value);
  };

  const filteredBonds = useMemo(() => {
    return sortedBonds.filter((bond) =>
      (bond.bond_denom_name?.toLowerCase() || '').includes(debouncedSearchTerm.toLowerCase()) ||
      (bond.bond_id?.toLowerCase() || '').includes(debouncedSearchTerm.toLowerCase())
    );
  }, [sortedBonds, debouncedSearchTerm]);

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
    
    return (
      <div 
        className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 mb-4 cursor-pointer 
          hover:bg-gray-700/80 transition duration-300 shadow-lg hover:shadow-xl 
          border border-gray-700/50 hover:border-gray-600/50"
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
            status === 'Active' ? 'bg-green-500/20 text-green-400' :
            status === 'Sold Out' ? 'bg-red-500/20 text-red-400' :
            status === 'Upcoming' ? 'bg-blue-500/20 text-blue-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {status}
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
            <span className="text-gray-400">Price</span>
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

          <div className="flex justify-between items-center">
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

  const renderBondTable = () => {
    if (!Array.isArray(filteredBonds) || filteredBonds.length === 0) {
      return <div>No bonds available</div>;
    }

    return (
      <table className="w-full">
        <thead>
          <tr className="text-gray-400 border-b border-gray-800">
            <th className="text-left py-2 w-1/4 cursor-pointer" onClick={() => requestSort('bond_denom_name')}>
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
                Price {renderSortIcon('price')}
              </span>
            </th>
            <th className="text-center py-2 w-1/4 cursor-pointer" onClick={() => requestSort('maturity_date')}>
              <span className="flex items-center justify-center">
                {sortConfig.key === 'start_time' ? 'Start Date' : 'Maturity Date'} {renderSortIcon('maturity_date')}
              </span>
            </th>
            <th className="w-12"></th>
          </tr>
        </thead>
        <tbody>
          {filteredBonds.map((bond, index) => {
            if (!bond) return null;
            
            const bondSymbol = getTokenSymbol(bond.token_denom);
            const purchasingSymbol = getTokenSymbol(bond.purchase_denom);
            const bondImage = getTokenImage(bondSymbol);
            const purchasingImage = getTokenImage(purchasingSymbol);

            return (
              <tr 
                key={index} 
                className="border-b border-gray-800 cursor-pointer hover:bg-gray-700 transition duration-300"
                onClick={() => handleBondClick(bond.bond_id)}
              >
                <td className="py-4">
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
                <td className="py-4 text-center">{getBondStatus(bond)}</td>
                <td className="py-4 text-center">
                  <div>
                    {formatAmount(bond.total_amount)}
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
                  {getBondStatus(bond) === 'Upcoming' 
                    ? formatDate(bond.start_time)
                    : formatDate(bond.maturity_date)
                  }
                </td>
                <td className="py-4 text-center">
                  <button className="text-gray-400 hover:text-white transition duration-300">→</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  const handleClaim = async (bondId) => {
    try {
      setClaimingBondId(bondId);

      if (!connectedWalletAddress) {
        showAlert("Please connect your wallet first", "error");
        return;
      }

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      
      const claimMsg = {
        claim_rewards: {
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
      setClaimingBondId(null);
    }
  };

  const isClaimable = (bond, userBond) => {
    if (!bond || !userBond || !userBond.amount || !userBond.claimed_amount) {
      return false;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const claimStartTime = Math.floor(parseInt(bond.claim_start_time) / 1_000_000_000);
    const claimEndTime = Math.floor(parseInt(bond.claim_end_time) / 1_000_000_000);
    
    const hasUnclaimedAmount = parseInt(userBond.amount) > parseInt(userBond.claimed_amount);
    
    return now >= claimStartTime && now <= claimEndTime && hasUnclaimedAmount;
  };

  const UserBondsSection = () => {
    if (!connectedWalletAddress || userBonds.length === 0) return null;

    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Your Bond Purchases</h2>
        
        {/* Desktop view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left py-2">Bond ID</th>
                <th className="text-center py-2">Amount</th>
                <th className="text-center py-2">Purchase Date</th>
                {/* <th className="text-center py-2">NFT Token ID</th> */}
                <th className="text-center py-2">Status</th>
                <th className="text-right py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {userBonds.map((purchase, index) => {
                const canClaim = purchase.claimed_amount === "0";
                const purchaseDate = purchase.purchase_time instanceof Date 
                  ? purchase.purchase_time 
                  : new Date(Number(purchase.purchase_time) / 1_000_000);

                return (
                  <tr key={index} className="border-b border-gray-800">
                    <td className="py-4">Bond #{purchase.bond_id}</td>
                    <td className="py-4 text-center">{formatAmount(purchase.amount)}</td>
                    <td className="py-4 text-center">{formatDate(purchaseDate)}</td>
                    {/* <td className="py-4 text-center">
                      {purchase.nft_token_id !== "0" ? purchase.nft_token_id : "-"}
                    </td> */}
                    <td className="py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-sm ${
                        canClaim ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {canClaim ? 'Unclaimed' : 'Claimed'}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <button
                        onClick={() => handleClaim(purchase.bond_id)}
                        disabled={!isClaimable(bonds.find(b => b.bond_id === purchase.bond_id), purchase) || claimingBondId === purchase.bond_id}
                        className={`px-4 py-1.5 rounded-md text-sm transition duration-300 ${
                          isClaimable(bonds.find(b => b.bond_id === purchase.bond_id), purchase)
                            ? 'landing-button hover:bg-yellow-500' 
                            : 'bg-gray-600 cursor-not-allowed'
                        }`}
                      >
                        {claimingBondId === purchase.bond_id ? (
                          <div className="flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                            Claiming...
                          </div>
                        ) : isClaimable(bonds.find(b => b.bond_id === purchase.bond_id), purchase) ? 'Claim' : 'Claimed'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile view */}
        <div className="md:hidden space-y-4">
          {userBonds.map((purchase, index) => {
            const canClaim = purchase.claimed_amount === "0";
            const purchaseDate = purchase.purchase_time instanceof Date 
              ? purchase.purchase_time 
              : new Date(Number(purchase.purchase_time) / 1_000_000);
            
            return (
              <div 
                key={index}
                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-gray-400">Bond #{purchase.bond_id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    canClaim ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {canClaim ? 'Unclaimed' : 'Claimed'}
                  </span>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amount:</span>
                    <span>{formatAmount(purchase.amount)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Purchase Date:</span>
                    <span>{formatDate(purchaseDate)}</span>
                  </div>
                  
                  {/* {purchase.nft_token_id !== "0" && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">NFT ID:</span>
                      <span>{purchase.nft_token_id}</span>
                    </div>
                  )} */}
                </div>

                {isClaimable(bonds.find(b => b.bond_id === purchase.bond_id), purchase) && (
                  <button
                    onClick={() => handleClaim(purchase.bond_id)}
                    disabled={claimingBondId === purchase.bond_id}
                    className="w-full mt-3 landing-button px-4 py-1.5 rounded-md 
                      hover:bg-yellow-500 transition duration-300 text-sm disabled:opacity-50"
                  >
                    {claimingBondId === purchase.bond_id ? (
                      <div className="flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Claiming...
                      </div>
                    ) : 'Claim'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-5">
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
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search bonds..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full p-2 rounded-md bg-gray-700 text-white"
              />
            </div>

            <div className="hidden md:block">
              {renderBondTable()}
            </div>

            <div className="md:hidden">
              {filteredBonds.map((bond, index) => (
                <BondCard key={index} bond={bond} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Bonds;