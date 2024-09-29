import React, { createContext, useContext, useState } from 'react';

const WalletContext = createContext();

export const WalletProvider = ({ children }) => {
  const [connectedWalletAddress, setConnectedWalletAddress] = useState(null);
  const [isLedgerConnected, setIsLedgerConnected] = useState(false);

  // Add any other wallet-related state or functions here

  return (
    <WalletContext.Provider value={{ 
      connectedWalletAddress, 
      setConnectedWalletAddress,
      isLedgerConnected,
      setIsLedgerConnected
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};