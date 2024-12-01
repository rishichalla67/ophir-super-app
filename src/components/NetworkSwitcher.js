import React from 'react';
import { useNetwork } from '../context/NetworkContext';

const NetworkSwitcher = () => {
  const { isTestnet, toggleNetwork } = useNetwork();

  return (
    <button
      onClick={toggleNetwork}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300
        ${isTestnet 
          ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
        }`}
    >
      {isTestnet ? 'Testnet' : 'Mainnet'}
    </button>
  );
};

export default NetworkSwitcher; 