import React, { useState, useEffect } from 'react';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { daoConfig } from "../utils/daoConfig";
import { useWallet } from '../context/WalletContext';
import { FaSpinner } from 'react-icons/fa';
import { useSidebar } from '../context/SidebarContext';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { tokenMappings } from '../utils/tokenMappings';
import { tokenImages } from '../utils/tokenImages';
import { Dialog } from '@headlessui/react';
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { useCrypto } from '../context/CryptoContext';
import { useNavigate } from 'react-router-dom';

const Issuers = () => {
  const { isSidebarOpen } = useSidebar();
  const [isLoading, setIsLoading] = useState(true);
  const [bonds, setBonds] = useState([]);
  const { connectedWalletAddress } = useWallet();
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [selectedBond, setSelectedBond] = useState(null);
  const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });
  const { prices } = useCrypto();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBonds();
  }, [connectedWalletAddress]);

  const fetchBonds = async () => {
    try {
      const rpc = "https://migaloo-rpc.polkachu.com/";
      const client = await CosmWasmClient.connect(rpc);
      const response = await client.queryContractSmart(
        daoConfig.BONDS_CONTRACT_ADDRESS,
        { get_all_bond_offers: {} }
      );

      // Filter bonds for the current issuer
      const issuerBonds = response.bond_offers.filter(
        offer => offer.bond_offer.issuer === connectedWalletAddress
      );
      setBonds(issuerBonds);
    } catch (error) {
      console.error("Error fetching bonds:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate stats from bonds data
  const calculateStats = () => {
    if (!bonds.length) return {
      totalBonds: 0,
      activeBonds: 0,
      totalValueUSD: 0,
      remainingValueUSD: 0,
      soldValueUSD: 0,
      averagePriceUSD: 0,
      totalsByPurchaseDenom: {},
      averagePriceByPurchaseDenom: {}
    };

    const now = new Date();
    let totalValueUSD = 0;
    let remainingValueUSD = 0;
    let soldValueUSD = 0;
    let totalsByPurchaseDenom = {};
    let countByPurchaseDenom = {};

    // Calculate USD values and totals by purchase denom
    bonds.forEach(bond => {
      let tokenDenom = tokenMappings[bond.bond_offer.token_denom]?.symbol?.toLowerCase();
      // Map daoOphir to ophir for price lookup
      if (tokenDenom?.includes('daoophir')) {
        tokenDenom = 'ophir';
      }
      
      const tokenPrice = prices[tokenDenom] || 0;
      console.log('Token:', tokenDenom, 'Price:', tokenPrice); // Debug log
      
      const totalAmount = parseInt(bond.bond_offer.total_amount) / Math.pow(10, 6);
      const remainingSupply = parseInt(bond.bond_offer.remaining_supply) / Math.pow(10, 6);
      const soldAmount = totalAmount - remainingSupply;

      const totalValue = totalAmount * tokenPrice;
      const remainingValue = remainingSupply * tokenPrice;
      const soldValue = soldAmount * tokenPrice;

      totalValueUSD += totalValue;
      remainingValueUSD += remainingValue;
      soldValueUSD += soldValue;

      // Calculate totals by purchase denom
      const purchaseDenom = bond.bond_offer.purchase_denom;
      const price = parseFloat(bond.bond_offer.price);
      const totalInPurchaseDenom = soldAmount * price;

      if (!totalsByPurchaseDenom[purchaseDenom]) {
        totalsByPurchaseDenom[purchaseDenom] = 0;
        countByPurchaseDenom[purchaseDenom] = 0;
      }
      totalsByPurchaseDenom[purchaseDenom] += totalInPurchaseDenom;
      countByPurchaseDenom[purchaseDenom]++;

      // Debug logs
      console.log('Bond:', bond.bond_offer.bond_id, {
        tokenDenom,
        tokenPrice,
        totalAmount,
        totalValue,
        remainingValue,
        soldValue
      });
    });
    
    // Calculate average price by purchase denom
    const averagePriceByPurchaseDenom = {};
    Object.keys(totalsByPurchaseDenom).forEach(denom => {
      averagePriceByPurchaseDenom[denom] = totalsByPurchaseDenom[denom] / countByPurchaseDenom[denom];
    });

    return {
      totalBonds: bonds.length,
      activeBonds: bonds.filter(bond => {
        const startTime = new Date(parseInt(bond.bond_offer.purchase_start_time) / 1_000_000);
        const endTime = new Date(parseInt(bond.bond_offer.purchase_end_time) / 1_000_000);
        return now >= startTime && now <= endTime && !bond.bond_offer.closed;
      }).length,
      totalValueUSD,
      remainingValueUSD,
      soldValueUSD,
      averagePriceUSD: bonds.length > 0 ? totalValueUSD / bonds.length : 0,
      totalsByPurchaseDenom,
      averagePriceByPurchaseDenom
    };
  };

  const stats = calculateStats();

  const calculateSoldPercentage = (remainingSupply, totalAmount) => {
    if (!remainingSupply || !totalAmount) return 0;
    const sold = parseInt(totalAmount) - parseInt(remainingSupply);
    return Math.round((sold / parseInt(totalAmount)) * 100);
  };

  const formatTokenAmount = (amount, denom) => {
    if (!amount) return '0';
    const decimals = tokenMappings[denom]?.decimals || 6;
    return (parseInt(amount) / Math.pow(10, decimals)).toLocaleString();
  };

  const getSigner = async () => {
    if (window.keplr?.experimentalSuggestChain) {
      await window.keplr?.experimentalSuggestChain({
        chainId: "migaloo-1",
        chainName: "Migaloo",
        rpc: "https://migaloo-rpc.polkachu.com/",
        rest: "https://migaloo-api.polkachu.com",
        bip44: { coinType: 118 },
        bech32Config: {
          bech32PrefixAccAddr: "migaloo",
          bech32PrefixAccPub: "migaloopub",
          bech32PrefixValAddr: "migaloovaloper",
          bech32PrefixValPub: "migaloovaloperpub",
          bech32PrefixConsAddr: "migaloovalcons",
          bech32PrefixConsPub: "migaloovalconspub",
        },
        currencies: [{ coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 }],
        feeCurrencies: [{ coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 }],
        stakeCurrency: { coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 },
        gasPriceStep: { low: 0.2, average: 0.45, high: 0.75 },
      });
    }
  
    await window.keplr?.enable("migaloo-1");
    const offlineSigner = window.keplr?.getOfflineSigner("migaloo-1");
    return offlineSigner;
  };

  const handleWithdraw = async (bond) => {
    setSelectedBond(bond);
    setShowWithdrawModal(true);
  };

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const handleWithdrawConfirm = async () => {
    setIsWithdrawLoading(true);
    try {
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(
        "https://migaloo-rpc.polkachu.com/",
        signer
      );
      
      const withdrawMsg = {
        withdraw: {
          bond_id: parseInt(selectedBond.bond_offer.bond_id)
        }
      };

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      const result = await client.execute(
        connectedWalletAddress,
        daoConfig.BONDS_CONTRACT_ADDRESS,
        withdrawMsg,
        fee,
        `Withdraw Bond: ${selectedBond.bond_offer.bond_id}`
      );

      // Refresh bonds data
      await fetchBonds();
      setShowWithdrawModal(false);

      // Show success message with transaction link
      if (result.transactionHash) {
        const txnUrl = `https://inbloc.org/migaloo/transactions/${result.transactionHash}`;
        showAlert(
          "Successfully withdrew bond tokens!",
          "success",
          `<a href="${txnUrl}" target="_blank" class="text-yellow-300 hover:text-yellow-400">View Transaction</a>`
        );
      }
    } catch (error) {
      console.error("Error withdrawing:", error);
      showAlert(`Error withdrawing: ${error.message}`, "error");
    } finally {
      setIsWithdrawLoading(false);
    }
  };

  const renderStatusCell = (bond) => {
    const now = new Date();
    const startTime = new Date(parseInt(bond.bond_offer.purchase_start_time) / 1_000_000);
    const endTime = new Date(parseInt(bond.bond_offer.purchase_end_time) / 1_000_000);
    const hasRemainingSupply = parseInt(bond.bond_offer.remaining_supply) > 0;
    
    let status = 'Ended';
    if (now >= startTime && now <= endTime && !bond.bond_offer.closed) {
      status = 'Active';
    } else if (now < startTime) {
      status = 'Upcoming';
    } else if (parseInt(bond.bond_offer.remaining_supply) === 0) {
      status = 'Sold Out';
    } else if (bond.bond_offer.closed) {
      status = 'Withdrawn';
    }

    const canWithdraw = now > endTime && hasRemainingSupply && !bond.bond_offer.closed;

    return (
      <div className="flex items-center gap-2">
        {canWithdraw ? (
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent row click when clicking button
              handleWithdraw(bond);
            }}
            className="px-2 py-1 bg-yellow-500 hover:bg-yellow-400 text-black rounded-md text-xs transition-colors"
          >
            Withdraw
          </button>
        ) : (
          <span className={`px-1 py-0.5 md:px-2 md:py-1 rounded-full text-[10px] md:text-xs ${
            status === 'Active' ? 'bg-green-500/20 text-green-400' :
            status === 'Upcoming' ? 'bg-blue-500/20 text-blue-400' :
            status === 'Sold Out' ? 'bg-red-500/20 text-red-400' :
            status === 'Withdrawn' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {status}
          </span>
        )}
      </div>
    );
  };

  const handleBondClick = (bondId) => {
    navigate(`/bonds/${bondId}`);
  };

  const calculateBondFinancials = (bond) => {
    const price = parseFloat(bond.bond_offer.price);
    const totalAmount = parseInt(bond.bond_offer.total_amount);
    const remainingSupply = parseInt(bond.bond_offer.remaining_supply);
    const soldAmount = (totalAmount - remainingSupply) / Math.pow(10, 6);
    
    const fundsReceived = soldAmount * price;
    const feePercentage = parseFloat(bond.bond_offer.fee_percentage) / 100;
    const feesPaid = fundsReceived * feePercentage;
    
    return { fundsReceived, feesPaid };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="animate-spin text-ophir-gold h-8 w-8" />
      </div>
    );
  }

  if (!connectedWalletAddress) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-white">
          Please connect your wallet to view your issued bonds. 
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`global-bg-new text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-10">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">Your Issued Bonds</h1>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-8">
          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Total Bonds</h3>
            <p className="text-white text-lg md:text-2xl font-bold">{stats.totalBonds}</p>
            <p className="text-gray-400 text-xs md:text-sm">{stats.activeBonds} Active</p>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Total Value</h3>
            <p className="text-white text-lg md:text-2xl font-bold">
              ${stats.totalValueUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            {Object.entries(stats.totalsByPurchaseDenom).map(([denom, total]) => (
              <p key={denom} className="text-gray-400 text-xs md:text-sm flex items-center gap-1">
                {total.toFixed(2)}
                <img 
                  src={tokenImages[tokenMappings[denom]?.symbol?.toLowerCase()]} 
                  alt=""
                  className="w-3 h-3 md:w-4 md:h-4"
                />
              </p>
            ))}
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Sold Value</h3>
            <p className="text-white text-lg md:text-2xl font-bold">
              ${stats.soldValueUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-gray-400 text-xs md:text-sm">
              {((stats.soldValueUSD / stats.totalValueUSD) * 100).toFixed(1)}% of total supply
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Average Value</h3>
            <p className="text-white text-lg md:text-2xl font-bold">
              ${stats.averagePriceUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-gray-400 text-xs md:text-sm">Per bond</p>
          </div>
        </div>

        {/* Bonds Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-white text-xs mb-10 md:text-base">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">ID</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Name</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Amount</th>
                <th className="hidden sm:table-cell px-1 py-2 md:px-4 md:py-3 text-left">Price</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Progress</th>
                <th className="hidden sm:table-cell px-1 py-2 md:px-4 md:py-3 text-left">Funds Received</th>
                <th className="hidden md:table-cell px-1 py-2 md:px-4 md:py-3 text-left">Fees Paid</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {bonds.map((bond) => {
                const now = new Date();
                const startTime = new Date(parseInt(bond.bond_offer.purchase_start_time) / 1_000_000);
                const endTime = new Date(parseInt(bond.bond_offer.purchase_end_time) / 1_000_000);
                const isSoldOut = parseInt(bond.bond_offer.remaining_supply) === 0;
                
                let status = 'Inactive';
                if (now >= startTime && now <= endTime && !bond.bond_offer.closed) {
                  status = 'Active';
                } else if (now < startTime) {
                  status = 'Upcoming';
                } else if (isSoldOut) {
                  status = 'Sold Out';
                }

                const soldPercentage = calculateSoldPercentage(
                  bond.bond_offer.remaining_supply,
                  bond.bond_offer.total_amount
                );

                return (
                  <tr 
                    key={bond.bond_offer.bond_id} 
                    className="border-b border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => handleBondClick(bond.bond_offer.bond_id)}
                  >
                    <td className="px-1 py-2 md:px-4 md:py-3">{bond.bond_offer.bond_id}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <div className="max-w-[80px] md:max-w-none truncate">
                        {bond.bond_offer.bond_name}
                      </div>
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <span className="whitespace-nowrap flex items-center gap-1">
                        {formatTokenAmount(bond.bond_offer.total_amount, bond.bond_offer.token_denom)}
                        <img 
                          src={tokenImages[tokenMappings[bond.bond_offer.token_denom]?.symbol?.toLowerCase()]} 
                          alt=""
                          className="w-4 h-4 md:w-5 md:h-5 inline-block"
                        />
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-1 py-2 md:px-4 md:py-3">
                      <span className="whitespace-nowrap flex items-center gap-1">
                        {parseFloat(bond.bond_offer.price).toFixed(3)}
                        <img 
                          src={tokenImages[tokenMappings[bond.bond_offer.purchase_denom]?.symbol?.toLowerCase()]} 
                          alt=""
                          className="w-4 h-4 md:w-5 md:h-5 inline-block"
                        />
                      </span>
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <div className="flex items-center gap-1 md:gap-2">
                        <div className="w-6 h-6 md:w-8 md:h-8">
                          <CircularProgressbar
                            value={soldPercentage}
                            text={`${soldPercentage}%`}
                            styles={buildStyles({
                              textSize: '32px',
                              pathColor: '#ffa500',
                              textColor: '#fff',
                              trailColor: '#d6d6d6',
                            })}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-1 py-2 md:px-4 md:py-3">
                      {(() => {
                        const { fundsReceived } = calculateBondFinancials(bond);
                        return (
                          <span className="whitespace-nowrap flex items-center gap-1">
                            {fundsReceived.toFixed(3)}
                            <img 
                              src={tokenImages[tokenMappings[bond.bond_offer.purchase_denom]?.symbol?.toLowerCase()]} 
                              alt=""
                              className="w-4 h-4 md:w-5 md:h-5 inline-block"
                            />
                          </span>
                        );
                      })()}
                    </td>
                    <td className="hidden md:table-cell px-1 py-2 md:px-4 md:py-3">
                      {(() => {
                        const { feesPaid } = calculateBondFinancials(bond);
                        return (
                          <span className="whitespace-nowrap flex items-center gap-1">
                            {feesPaid.toFixed(3)}
                            <img 
                              src={tokenImages[tokenMappings[bond.bond_offer.purchase_denom]?.symbol?.toLowerCase()]} 
                              alt=""
                              className="w-4 h-4 md:w-5 md:h-5 inline-block"
                            />
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      {renderStatusCell(bond)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {bonds.length === 0 && (
          <div className="text-center text-white mt-8">
            You haven't issued any bonds yet.
          </div>
        )}
      </div>

      {/* Add Withdraw Modal */}
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
            
            {selectedBond && (
              <div className="space-y-4">
                <div className="bg-gray-900/50 p-3 rounded-lg">
                  <p className="text-gray-400 text-sm">You will withdraw:</p>
                  <p className="text-lg font-bold">
                    {formatTokenAmount(selectedBond.bond_offer.remaining_supply, selectedBond.bond_offer.token_denom)}{' '}
                    {tokenMappings[selectedBond.bond_offer.token_denom]?.symbol?.toUpperCase() || 'OPHIR'}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowWithdrawModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdrawConfirm}
                disabled={isWithdrawLoading}
                className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {isWithdrawLoading ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Withdrawing...
                  </div>
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
  );
};

export default Issuers; 