import React, { createContext, useContext, useState, useEffect } from 'react';
import { daoConfig } from '../utils/daoConfig';

const NetworkContext = createContext();

export const NetworkProvider = ({ children }) => {
  const [isTestnet, setIsTestnet] = useState(() => {
    const saved = localStorage.getItem('isTestnet');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('isTestnet', JSON.stringify(isTestnet));
  }, [isTestnet]);

  const toggleNetwork = () => {
    setIsTestnet(prev => !prev);
    setTimeout(() => {
      window.location.reload();
    }, 25);
  };

  const value = {
    isTestnet,
    setIsTestnet,
    toggleNetwork,
    rpc: isTestnet 
      ? "https://migaloo-testnet-rpc.polkachu.com:443"
      : "https://migaloo-rpc.polkachu.com/",
    chainId: isTestnet ? "narwhal-2" : "migaloo-1",
    contractAddress: isTestnet 
      ? daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET // replace with your testnet address
      : daoConfig.BONDS_CONTRACT_ADDRESS // replace with your mainnet address
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
}; 