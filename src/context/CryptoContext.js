import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { chainInfo } from '../utils/chainInfo';
import { 
  USDC_DENOM, LAB_DENOM, SHARK_DENOM, RSTK_DENOM, ROAR_DENOM,
  AMPROAR_ERIS_CONSTANT, AMPBTC_ERIS_CONSTANT, MOAR_ERIS_CONSTANT,
  AMPOSMO_ERIS_CONSTANT, BOSMO_CONSTANT, AMPWHALET_ERIS_CONSTANT,
  BWHALET_CONSTANT, tokenMappings
} from '../utils/tokenMappings';
import { getAllBalances } from '../utils/getBalances';

const CryptoContext = createContext();

export function CryptoProvider({ children }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [balances, setBalances] = useState({});
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [balancesError, setBalancesError] = useState(null);

  // Move your fetchCoinPrices function here
  const fetchCoinPrices = async () => {
    try {
      setLoading(true);
      
      // Check cache first
      const cachedData = localStorage.getItem('cryptoPrices');
      const cachedTimestamp = localStorage.getItem('cryptoPricesTimestamp');
      
      if (cachedData && cachedTimestamp) {
        const now = Date.now();
        const cacheAge = now - parseInt(cachedTimestamp);
        
        if (cacheAge < 5 * 60 * 1000) {
          setPrices(JSON.parse(cachedData));
          setLoading(false);
          setError(null);
          return;
        }
      }

      // Fetch all prices from Parallax Analytics
      const response = await axios.get('https://parallax-analytics.onrender.com/ophir/prices');
      const prices = response.data;

      // Convert all keys to lowercase and create a new object
      const lowerCasePrices = Object.keys(prices).reduce((acc, key) => {
        acc[key.toLowerCase()] = prices[key];
        return acc;
      }, {});

      // Rename wbtc to wbtcaxl (maintaining lowercase)
      lowerCasePrices.wbtcaxl = lowerCasePrices.wbtc;
      delete lowerCasePrices.wbtc;

      // Cache the results
      localStorage.setItem('cryptoPrices', JSON.stringify(lowerCasePrices));
      localStorage.setItem('cryptoPricesTimestamp', Date.now().toString());
      
      setPrices(lowerCasePrices);
      setError(null);
    } catch (error) {
      setError(error.message);
      console.error('Error fetching prices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async () => {
    try {
      setBalancesLoading(true);

      // Check cache first
      const cachedData = localStorage.getItem('cryptoBalances');
      const cachedTimestamp = localStorage.getItem('cryptoBalancesTimestamp');
      
      if (cachedData && cachedTimestamp) {
        const now = Date.now();
        const cacheAge = now - parseInt(cachedTimestamp);
        
        if (cacheAge < 5 * 60 * 1000) {
          setBalances(JSON.parse(cachedData));
          setBalancesLoading(false);
          setBalancesError(null);
          return;
        }
      }

      const allBalances = await getAllBalances();
      
      // Cache the results
      localStorage.setItem('cryptoBalances', JSON.stringify(allBalances));
      localStorage.setItem('cryptoBalancesTimestamp', Date.now().toString());
      
      console.log(allBalances);
      
      setBalances(allBalances);
      setBalancesError(null);
    } catch (error) {
      setBalancesError(error.message);
      console.error('Error fetching balances:', error);
    } finally {
      setBalancesLoading(false);
    }
  };

  // Function to get chain configuration
  const getChainConfig = (chainId) => {
    return chainInfo[chainId] || null;
  };

  // Add immediate data fetching using IIFE
  useEffect(() => {
    (async () => {
      // Start both fetches immediately and concurrently
      Promise.all([
        fetchCoinPrices(),
        fetchBalances()
      ]).catch(error => {
        console.error('Initial data fetch failed:', error);
      });

      // Set up intervals after initial fetch
      const priceInterval = setInterval(fetchCoinPrices, 60000);
      const balanceInterval = setInterval(fetchBalances, 300000);

      return () => {
        clearInterval(priceInterval);
        clearInterval(balanceInterval);
      };
    })();
  }, []); // Single useEffect for both fetches

  const value = {
    prices,
    loading,
    error,
    chainInfo,
    getChainConfig,
    refreshPrices: fetchCoinPrices,
    balances,
    balancesLoading,
    balancesError,
    refreshBalances: fetchBalances,
  };

  return (
    <CryptoContext.Provider value={value}>
      {children}
    </CryptoContext.Provider>
  );
}

// Custom hook for using the crypto context
export function useCrypto() {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
} 