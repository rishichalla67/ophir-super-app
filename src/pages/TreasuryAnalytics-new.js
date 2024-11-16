import { useCrypto } from '../context/CryptoContext';
import { tokenMappings } from '../utils/tokenMappings';
import { useWallet } from '../context/WalletContext';
import { SigningStargateClient } from "@cosmjs/stargate";
import { useState, useEffect } from 'react';
import { tokenImages } from '../utils/tokenImages';

function TreasuryAnalytics() {
  const { prices, loading, error, balances, balancesLoading, balancesError } = useCrypto();
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const [walletBalances, setWalletBalances] = useState({});
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  const getSigner = async () => {
    if (window.keplr?.experimentalSuggestChain) {
      await window.keplr?.experimentalSuggestChain({
        chainId: "narwhal-2",
        chainName: "Migaloo Testnet",
        rpc: "https://migaloo-testnet-rpc.polkachu.com:443",
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

    await window.keplr?.enable("narwhal-2");
    const offlineSigner = window.keplr?.getOfflineSigner("narwhal-2");
    return offlineSigner;
  };

  const checkWalletBalances = async () => {
    if (!connectedWalletAddress) return;
    
    setWalletLoading(true);
    try {
      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(
        "https://migaloo-testnet-rpc.polkachu.com:443",
        signer
      );
      const balances = await client.getAllBalances(connectedWalletAddress);

      const formattedBalances = balances.reduce((acc, balance) => {
        const tokenInfo = tokenMappings[balance.denom] || {
          symbol: balance.denom,
          decimals: 6,
        };
        const amount = parseFloat(balance.amount) / Math.pow(10, tokenInfo.decimals);
        acc[balance.denom] = amount;
        return acc;
      }, {});

      setWalletBalances(formattedBalances);
    } catch (error) {
      console.error("Error checking wallet balances:", error);
      setWalletError(error.message);
    } finally {
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    if (connectedWalletAddress) {
      checkWalletBalances();
    }
  }, [connectedWalletAddress]);

  const combineAssets = () => {
    if (!balances) return [];
    
    const combinedAssets = {};
    
    Object.entries(balances).forEach(([chain, chainData]) => {
      if (chainData.wallets) {
        Object.entries(chainData.wallets).forEach(([walletType, walletData]) => {
          const assetsArray = Array.isArray(walletData) ? walletData : [walletData];
          
          assetsArray.forEach(coin => {
            if (coin && coin.denom) {
              const tokenInfo = tokenMappings[coin.denom] || { symbol: coin.denom, decimals: 6 };
              const symbol = tokenInfo.symbol.toLowerCase();
              
              if (!combinedAssets[symbol]) {
                combinedAssets[symbol] = {
                  symbol,
                  totalAmount: 0,
                  locations: [],
                  denom: coin.denom,
                  decimals: tokenInfo.decimals
                };
              }
              
              const amount = parseFloat(coin.amount) / Math.pow(10, tokenInfo.decimals);
              combinedAssets[symbol].totalAmount += amount;
              combinedAssets[symbol].locations.push({
                chain,
                walletType,
                amount,
                location: `${chain} ${walletType}`
              });
            }
          });
        });
      }
    });
    
    return Object.values(combinedAssets);
  };

  const AssetDetailsModal = ({ asset, onClose }) => {
    if (!asset) return null;
    
    const totalValue = asset.totalAmount * (prices[asset.symbol.toLowerCase()] || 0);
    const imageUrl = tokenImages[asset.symbol];

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="bg-gray-800 rounded-lg w-[90%] sm:w-[80%] h-[80vh] flex flex-col">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {Array.isArray(imageUrl) ? (
                <div className="flex -space-x-2">
                  {imageUrl.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={asset.symbol}
                      className="w-10 h-10 rounded-full border-2 border-gray-800"
                    />
                  ))}
                </div>
              ) : (
                <img
                  src={imageUrl || 'https://d1nhio0ox7pgb.cloudfront.net/_img/g_collection_png/standard/32x32/symbol_questionmark.png'}
                  alt={asset.symbol}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <h3 className="text-xl sm:text-2xl font-bold text-white capitalize">
                {asset.symbol} Details
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 sm:p-6">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Total Balance</div>
              <div className="text-white text-lg font-semibold">
                {asset.totalAmount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6
                })}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Total Value</div>
              <div className="text-white text-lg font-semibold">
                ${totalValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Current Price</div>
              <div className="text-white text-lg font-semibold">
                ${(prices[asset.symbol] || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6
                })}
              </div>
            </div>
          </div>

          {/* Locations Table */}
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="text-lg font-semibold text-white mb-4">Asset Locations</div>
            <div className="space-y-3">
              {asset.locations.map((location, index) => (
                <div
                  key={index}
                  className="bg-gray-700/50 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="flex flex-col">
                    <span className="text-white font-medium">{location.chain}</span>
                    <span className="text-gray-400 text-sm">{location.walletType}</span>
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <span className="text-white">
                      {location.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6
                      })} {asset.symbol}
                    </span>
                    <span className="text-gray-400 text-sm">
                      ${(location.amount * (prices[asset.symbol] || 0)).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAssetRow = (asset) => {
    const imageUrl = tokenImages[asset.symbol];
    const value = asset.totalAmount * (prices[asset.symbol.toLowerCase()] || 0);

    return (
      <tr
        key={asset.symbol}
        className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer"
        onClick={() => setSelectedAsset(asset)}
      >
        <td className="py-3 px-2 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            {Array.isArray(imageUrl) ? (
              <div className="flex -space-x-2">
                {imageUrl.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={asset.symbol}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-gray-800"
                  />
                ))}
              </div>
            ) : (
              <img
                src={imageUrl || 'https://d1nhio0ox7pgb.cloudfront.net/_img/g_collection_png/standard/32x32/symbol_questionmark.png'}
                alt={asset.symbol}
                className="w-6 h-6 sm:w-8 sm:h-8 rounded-full"
              />
            )}
            <span className="text-white capitalize text-sm sm:text-base">{asset.symbol}</span>
          </div>
        </td>
        <td className="py-3 px-2 sm:px-6 text-right text-white text-sm sm:text-base">
          {asset.totalAmount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
          })}
        </td>
        <td className="py-3 px-2 sm:px-6 text-right text-white text-sm sm:text-base">
          ${value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}
        </td>
        <td className="hidden sm:table-cell py-3 px-2 sm:px-6 text-right text-gray-300">
          {/* Add rewards column if needed */}
        </td>
      </tr>
    );
  };

  const renderMobileCard = (asset) => {
    const imageUrl = tokenImages[asset.symbol];
    const value = asset.totalAmount * (prices[asset.symbol.toLowerCase()] || 0);

    return (
      <div 
        key={asset.symbol}
        className="bg-gray-800/50 rounded-lg p-4 mb-3 cursor-pointer"
        onClick={() => setSelectedAsset(asset)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 max-w-full">
            {Array.isArray(imageUrl) ? (
              <div className="flex -space-x-2 flex-shrink-0">
                {imageUrl.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={asset.symbol}
                    className="w-8 h-8 rounded-full border-2 border-gray-800"
                  />
                ))}
              </div>
            ) : (
              <img
                src={imageUrl || 'https://d1nhio0ox7pgb.cloudfront.net/_img/g_collection_png/standard/32x32/symbol_questionmark.png'}
                alt={asset.symbol}
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
            )}
            <span className="text-white capitalize text-lg font-medium truncate">
              {asset.symbol}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-gray-400 text-sm">Balance</div>
            <div className="text-white">
              {asset.totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
              })}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Value</div>
            <div className="text-white">
              ${value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4 mt-20">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6">Treasury Analytics</h1>
        
        {/* Mobile View */}
        <div className="sm:hidden">
          {combineAssets().map(renderMobileCard)}
        </div>

        {/* Desktop View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left bg-yellow-500">
                <th className="py-3 px-6 font-semibold text-base">ASSET</th>
                <th className="py-3 px-6 text-right font-semibold text-base">BALANCE</th>
                <th className="py-3 px-6 text-right font-semibold text-base">VALUE</th>
                <th className="py-3 px-6 text-right font-semibold text-base">REWARDS</th>
              </tr>
            </thead>
            <tbody>
              {combineAssets().map(renderAssetRow)}
            </tbody>
          </table>
        </div>

        {selectedAsset && (
          <AssetDetailsModal
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
        )}
      </div>
    </div>
  );
}

export default TreasuryAnalytics;
