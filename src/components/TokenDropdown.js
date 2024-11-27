import React, { useState, useRef, useEffect } from 'react';
import { tokenImages } from '../utils/tokenImages';
import { tokenMappings } from '../utils/tokenMappings';

const TokenDropdown = ({ name, value, onChange, label, allowedDenoms = [], isTestnet = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Filter tokens based on isTestnet flag
  const tokens = allowedDenoms
    .filter(denom => {
      const token = tokenMappings[denom];
      // Allow whale tokens (uwhale) in both testnet and mainnet
      if (denom === 'uwhale') return true;
      
      return isTestnet 
        ? token?.chain === 'migaloo-testnet'
        : token?.chain !== 'migaloo-testnet';
    })
    .map((denom) => ({
      denom,
      symbol: tokenMappings[denom]?.symbol || denom,
      image: tokenImages[tokenMappings[denom]?.symbol] || '',
    }));

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

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <button
        type="button"
        className="bond-create-text-container w-full px-3 py-2 rounded-md flex items-center justify-between text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedToken ? (
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
              <span className="hidden md:inline text-sm text-gray-400 capitalize truncate max-w-[120px]">
                {tokenMappings[token.denom]?.chain || 'unknown'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TokenDropdown;
