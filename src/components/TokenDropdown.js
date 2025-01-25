import React, { useState, useRef, useEffect } from 'react';
import { tokenImages } from '../utils/tokenImages';
import { tokenMappings } from '../utils/tokenMappings';

const TokenDropdown = ({ name, value, onChange, label, allowedDenoms = [], isTestnet = true, apyData }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Helper function to get APY data for a denom
  const getApyDataForDenom = (denom) => {
    if (!apyData || !denom) return null;

    // Find matching APY denom
    const matchingApyDenom = Object.keys(apyData).find(apyDenom => {
      const normalizedApyDenom = apyDenom.toLowerCase();
      const normalizedDenom = denom.toLowerCase();
      return normalizedApyDenom === normalizedDenom || 
             normalizedApyDenom.includes(normalizedDenom) || 
             normalizedDenom.includes(normalizedApyDenom);
    });

    return matchingApyDenom ? apyData[matchingApyDenom] : null;
  };

  // Filter tokens based on isTestnet flag and sort alphabetically by symbol
  const tokens = allowedDenoms
    .filter(denom => {
      const token = tokenMappings[denom];
      // Allow whale tokens (uwhale) in both testnet and mainnet
      if (denom === 'uwhale') return true;
      
      return isTestnet 
        ? token?.chain === 'migaloo-testnet'
        : token?.chain !== 'migaloo-testnet';
    })
    .map((denom) => {
      const yieldData = getApyDataForDenom(denom);
      return {
        denom,
        symbol: tokenMappings[denom]?.symbol || denom,
        image: tokenImages[tokenMappings[denom]?.symbol] || '',
        yieldData
      };
    })
    .sort((a, b) => {
      // Sort yield-bearing tokens first
      if (a.yieldData && !b.yieldData) return -1;
      if (!a.yieldData && b.yieldData) return 1;
      
      // Then sort by APY if both have yield
      if (a.yieldData && b.yieldData) {
        const aAPY = parseFloat(a.yieldData.APY);
        const bAPY = parseFloat(b.yieldData.APY);
        return bAPY - aAPY; // Higher APY first
      }
      
      // Finally sort by symbol
      return a.symbol.localeCompare(b.symbol);
    });

  // Find the selected token based on the current value
  const selectedToken = tokens.find((token) => token.denom === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getTokenSymbol = (denom) => {
    return tokenMappings[denom]?.symbol || denom;
  };

  const getTokenImage = (denom) => {
    let token = tokenMappings[denom]?.symbol || denom;
    if (token?.toLowerCase().includes('daoophir')) {
      token = 'ophir';
    }
    return tokenImages[token];
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <button
        type="button"
        className="bond-create-text-container w-full px-3 py-2 rounded-md flex items-center justify-between text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedToken ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center">
              {selectedToken.image ? (
                <img
                  src={selectedToken.image}
                  alt={selectedToken.symbol}
                  className="w-5 h-5 mr-2"
                />
              ) : (
                <div className="w-5 h-5 mr-2 bg-gray-400 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white">
                    {selectedToken.symbol.charAt(0)}
                  </span>
                </div>
              )}
              <span>{selectedToken.symbol}</span>
            </div>
            {selectedToken.yieldData && (
              <span className="text-sm text-green-400 ml-2">
                {(parseFloat(selectedToken.yieldData.APY) * 100).toFixed(2)}% APY
              </span>
            )}
          </div>
        ) : (
          <span>Select</span>
        )}
        <svg
          className={`w-4 h-4 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && (
        <ul className="absolute z-50 mt-1 bond-create-text-container w-full rounded-md shadow-lg max-h-60 overflow-auto">
          {tokens.map((token) => (
            <li
              key={token.denom}
              className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#3a3b44]"
              onClick={() => {
                onChange({ target: { name, value: token.denom } });
                setIsOpen(false);
              }}
            >
              <div className="flex items-center">
                {token.image ? (
                  <img
                    src={token.image}
                    alt={token.symbol}
                    className="w-5 h-5 mr-2"
                  />
                ) : (
                  <div className="w-5 h-5 mr-2 bg-gray-400 rounded-full flex items-center justify-center">
                    <span className="text-xs text-white">
                      {token.symbol.charAt(0)}
                    </span>
                  </div>
                )}
                <span>{token.symbol}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="hidden md:inline text-sm text-gray-400 capitalize truncate max-w-[120px]">
                  {tokenMappings[token.denom]?.chain || 'unknown'}
                </span>
                {token.yieldData && (
                  <span className="text-sm text-green-400">
                    {(parseFloat(token.yieldData.APY) * 100).toFixed(2)}% APY
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TokenDropdown;
