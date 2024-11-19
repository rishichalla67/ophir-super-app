import { useCrypto } from '../context/CryptoContext';
import { tokenMappings } from '../utils/tokenMappings';
import { useWallet } from '../context/WalletContext';
import { SigningStargateClient } from "@cosmjs/stargate";
import { useState, useEffect } from 'react';
import { tokenImages } from '../utils/tokenImages';
import { daoConfig } from '../utils/daoConfig';
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { useSidebar } from '../context/SidebarContext';

function TreasuryAnalytics() {
  const { prices, loading, error, balances, balancesLoading, balancesError } = useCrypto();
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const [walletBalances, setWalletBalances] = useState({});
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [potentialRedemption, setPotentialRedemption] = useState({});
  const [isPotentialRedemptionLoading, setIsPotentialRedemptionLoading] = useState(false);
  const { isSidebarOpen } = useSidebar();

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

  const queryPotentialRedemption = async (balance) => {
    if (!balance || balance <= 0) return;
    
    setIsPotentialRedemptionLoading(true);
    try {
      const message = {
        get_redemptions: {
          amount: (Number(balance) * 1000000).toString(),
        },
      };

      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(
        "https://migaloo-rpc.polkachu.com",
        signer
      );

      const queryResponse = await client.queryContractSmart(
        daoConfig["CONTRACT_ADDRESS"],
        message
      );

      if (queryResponse && queryResponse.redemptions) {
        const redemptionValues = queryResponse.redemptions.reduce((acc, redemption) => {
          const tokenInfo = tokenMappings[redemption.denom] || {
            symbol: redemption.denom,
            decimals: 6,
          };
          const adjustedAmount = Number(redemption.amount) / Math.pow(10, tokenInfo.decimals);
          acc[tokenInfo.symbol] = adjustedAmount;
          return acc;
        }, {});
        setPotentialRedemption(redemptionValues);
      }
    } catch (error) {
      console.error("Error querying potential redemption:", error);
    } finally {
      setIsPotentialRedemptionLoading(false);
    }
  };

  const checkWalletBalances = async () => {
    if (!connectedWalletAddress) {
      console.log("No wallet connected, skipping balance check");
      return;
    }
    
    setWalletLoading(true);
    console.log("Checking wallet balances for address:", connectedWalletAddress);
    
    try {
      const signer = await getSigner();
      console.log("Got signer successfully");

      const client = await SigningStargateClient.connectWithSigner(
        "https://migaloo-rpc.polkachu.com",
        signer
      );
      console.log("Connected to Stargate client");

      const balances = await client.getAllBalances(connectedWalletAddress);
      console.log("Raw balances received:", balances);

      const formattedBalances = balances.reduce((acc, balance) => {
        const tokenInfo = tokenMappings[balance.denom] || {
          symbol: balance.denom,
          decimals: 6,
        };
        const amount = parseFloat(balance.amount) / Math.pow(10, tokenInfo.decimals);
        acc[balance.denom] = amount;
        return acc;
      }, {});
      
      console.log("Formatted balances:", formattedBalances);
      setWalletBalances(formattedBalances);

      const ophirDenom = daoConfig["OPHIR_DENOM"];
      const ophirBalance = formattedBalances[ophirDenom] || 0;
      console.log("OPHIR balance found:", ophirBalance, "for denom:", ophirDenom);

      if (ophirBalance > 0) {
        console.log("Querying potential redemption for OPHIR balance:", ophirBalance);
        await queryPotentialRedemption(ophirBalance);
      } else {
        console.log("No OPHIR balance found, skipping redemption query");
      }

    } catch (error) {
      console.error("Error in checkWalletBalances:", error);
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
              
              const amount = symbol === 'btc' 
                ? parseFloat(coin.humanAmount || 0)
                : parseFloat(coin.amount) / Math.pow(10, tokenInfo.decimals);
              
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
    
    return Object.values(combinedAssets)
      .sort((a, b) => {
        const getPrice = (symbol) => {
          const lookupSymbols = {
            'wbtc': ['wbtc', 'btc'],
            // Add other token mappings if needed
          };
          
          const alternatives = lookupSymbols[symbol.toLowerCase()] || [symbol.toLowerCase()];
          for (const sym of alternatives) {
            if (prices[sym] !== undefined) {
              return prices[sym];
            }
          }
          return 0;
        };

        const valueA = a.totalAmount * getPrice(a.symbol);
        const valueB = b.totalAmount * getPrice(b.symbol);
        return valueB - valueA;
      });
  };

  const AssetDetailsModal = ({ asset, onClose }) => {
    if (!asset) return null;
    
    const totalValue = asset.totalAmount * (prices[asset.symbol.toLowerCase()] || 0);
    const imageUrl = tokenImages[asset.symbol];

    const formatLargeNumber = (num) => {
      // For very large numbers (billions+), use K/M/B notation
      if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
      }
      if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
      }
      if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
      }
      // For smaller numbers, use locale string with appropriate decimals
      return num.toLocaleString(undefined, {
        maximumFractionDigits: num > 1000 ? 2 : 6,
        minimumFractionDigits: 2
      });
    };

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 z-50">
        <div className="bg-gray-800 rounded-lg w-[95%] sm:w-[80%] max-h-[90vh] sm:h-[80vh] flex flex-col">
          {/* Header - Made more compact */}
          <div className="p-3 sm:p-6 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              {Array.isArray(imageUrl) ? (
                <div className="flex -space-x-2">
                  {imageUrl.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={asset.symbol}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-gray-800"
                    />
                  ))}
                </div>
              ) : (
                <img
                  src={imageUrl || 'https://d1nhio0ox7pgb.cloudfront.net/_img/g_collection_png/standard/32x32/symbol_questionmark.png'}
                  alt={asset.symbol}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full"
                />
              )}
              <h3 className="text-lg sm:text-2xl font-bold text-white capitalize">
                {asset.symbol}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary Cards - Made into a more compact grid */}
          <div className="grid grid-cols-3 gap-2 p-2 sm:p-6">
            <div className="bg-gray-700/50 rounded-lg p-2 sm:p-4">
              <div className="text-gray-400 text-xs sm:text-sm">Balance</div>
              <div className="text-white text-sm sm:text-lg font-semibold">
                {formatLargeNumber(Number(asset.totalAmount))}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2 sm:p-4">
              <div className="text-gray-400 text-xs sm:text-sm">Value</div>
              <div className="text-white text-sm sm:text-lg font-semibold truncate">
                ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-2 sm:p-4">
              <div className="text-gray-400 text-xs sm:text-sm">Price</div>
              <div className="text-white text-sm sm:text-lg font-semibold truncate">
                ${(prices[asset.symbol] || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </div>
            </div>
          </div>

          {/* Locations Table - Simplified for mobile */}
          <div className="flex-1 overflow-auto p-2 sm:p-6">
            <div className="text-sm sm:text-lg font-semibold text-white mb-2 sm:mb-4">Asset Locations</div>
            <div className="space-y-2">
              {asset.locations.map((location, index) => (
                <div
                  key={index}
                  className="bg-gray-700/50 rounded-lg p-2 sm:p-4 flex justify-between items-center"
                >
                  <div className="flex flex-col">
                    <span className="text-white text-sm sm:text-base font-medium">{location.chain}</span>
                    <span className="text-gray-400 text-xs sm:text-sm">{location.walletType}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white text-sm sm:text-base">
                      {location.amount.toFixed(4)}
                    </div>
                    <div className="text-gray-400 text-xs">
                      ${(location.amount * (prices[asset.symbol] || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
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
    const getAssetPrice = (symbol) => {
      const lookupSymbols = {
        'wbtc': ['wbtc', 'btc'],
        // Add other token mappings if needed
      };

      const alternatives = lookupSymbols[symbol.toLowerCase()] || [symbol.toLowerCase()];
      for (const sym of alternatives) {
        if (prices[sym] !== undefined) {
          return prices[sym];
        }
      }
      return 0;
    };

    const value = asset.totalAmount * getAssetPrice(asset.symbol);

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
          {asset.symbol.toLowerCase() === 'btc' 
            ? Number(asset.totalAmount).toFixed(8)
            : asset.totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6
              })
          }
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
        <td className="py-3 px-2 sm:px-6 text-right text-white text-sm sm:text-base">
          {isPotentialRedemptionLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mx-auto"/>
          ) : potentialRedemption[asset.symbol] ? (
            <div className="flex flex-col items-end">
              <span>{potentialRedemption[asset.symbol].toFixed(6)}</span>
              <span className="text-xs text-gray-400">
                ${(potentialRedemption[asset.symbol] * (prices[asset.symbol.toLowerCase()] || 0)).toFixed(2)}
              </span>
            </div>
          ) : (
            '-'
          )}
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
              {asset.symbol.toLowerCase() === 'btc'
                ? Number(asset.totalAmount).toFixed(8)
                : asset.totalAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6
                  })
              }
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
          {!isPotentialRedemptionLoading && potentialRedemption[asset.symbol] && (
            <div>
              <div className="text-gray-400 text-sm">Potential Redemption</div>
              <div className="flex flex-col">
                <span className="text-white">{potentialRedemption[asset.symbol].toFixed(6)}</span>
                <span className="text-xs text-gray-400">
                  ${(potentialRedemption[asset.symbol] * (prices[asset.symbol.toLowerCase()] || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          )}
          {isPotentialRedemptionLoading && (
            <div>
              <div className="text-gray-400 text-sm">Potential Redemption</div>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mx-auto"/>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`global-bg-new text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Treasury Analytics</h1>
          {connectedWalletAddress && !walletLoading && (
            <div className="text-sm text-gray-400">
              Your OPHIR Balance: {walletBalances[daoConfig["OPHIR_DENOM"]]?.toLocaleString() || '0'}
              {walletLoading && (
                <div className="inline-block ml-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-gray-400"/>
                </div>
              )}
            </div>
          )}
        </div>
        
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
                <th className="py-3 px-6 text-right font-semibold text-base">POTENTIAL REDEMPTION</th>
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

