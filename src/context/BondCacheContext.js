import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { useNetwork } from './NetworkContext';

const BondCacheContext = createContext();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export function BondCacheProvider({ children }) {
  const { rpc, contractAddress } = useNetwork();
  const [bondCache, setBondCache] = useState(new Map());
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [isFetching, setIsFetching] = useState(false);

  const convertContractTimeToDate = (contractTime) => {
    try {
      const timeString = contractTime?.toString() || '0';
      return timeString.length <= 13 
        ? new Date(parseInt(timeString))
        : new Date(parseInt(timeString) / 1_000_000);
    } catch (error) {
      console.error('Error converting contract time:', error, contractTime);
      return new Date();
    }
  };

  const transformBondOffer = useCallback((offer) => ({
    ...offer.bond_offer,
    contract_addr: offer.contract_addr,
    start_time: convertContractTimeToDate(offer.bond_offer.purchase_start_time),
    end_time: convertContractTimeToDate(offer.bond_offer.purchase_end_time),
    maturity_date: convertContractTimeToDate(offer.bond_offer.maturity_date)
  }), []);

  const fetchAllBonds = useCallback(async (force = false) => {
    const now = Date.now();
    if (
      !force && 
      lastFetchTime && 
      (now - lastFetchTime) < CACHE_DURATION && 
      bondCache.size > 0
    ) {
      return Array.from(bondCache.values());
    }

    if (isFetching) {
      return Array.from(bondCache.values());
    }

    try {
      setIsFetching(true);
      const client = await CosmWasmClient.connect(rpc);
      let allBonds = [];
      let hasMore = true;

      while (hasMore) {
        // Get the last bond's ID for pagination
        const lastBondId = allBonds.length > 0 
          ? allBonds[allBonds.length - 1].bond_id.toString()
          : undefined;

        const message = {
          get_all_bond_offers: {
            limit: 30,
            ...(lastBondId && { start_after: lastBondId })
          }
        };

        const data = await client.queryContractSmart(contractAddress, message);
        
        if (!data?.bond_offers || data.bond_offers.length === 0) {
          hasMore = false;
          break;
        }

        const transformedBonds = data.bond_offers.map(offer => 
          transformBondOffer(offer)
        );

        allBonds = [...allBonds, ...transformedBonds];
        
        // If we got less than the limit, we're done
        hasMore = data.bond_offers.length === 30;
      }

      const newBondCache = new Map();
      allBonds.forEach(bond => {
        newBondCache.set(bond.bond_id, bond);
      });

      setBondCache(newBondCache);
      setLastFetchTime(now);
      return allBonds;
    } catch (error) {
      console.error('Error fetching all bonds:', error);
      return Array.from(bondCache.values());
    } finally {
      setIsFetching(false);
    }
  }, [rpc, contractAddress, lastFetchTime, bondCache, isFetching, transformBondOffer]);

  const getBond = useCallback(async (bondId) => {
    const cachedBond = bondCache.get(bondId);
    const now = Date.now();

    if (
      cachedBond && 
      lastFetchTime && 
      (now - lastFetchTime) < CACHE_DURATION
    ) {
      return cachedBond;
    }

    try {
      const client = await CosmWasmClient.connect(rpc);
      const message = { get_bond_offer: { bond_id: parseInt(bondId) } };
      const data = await client.queryContractSmart(contractAddress, message);

      if (!data?.bond_offer) return null;

      const transformedBond = transformBondOffer({
        bond_offer: data.bond_offer,
        contract_addr: data.contract_addr
      });

      setBondCache(prev => new Map(prev).set(bondId, transformedBond));
      return transformedBond;
    } catch (error) {
      console.error(`Error fetching bond ${bondId}:`, error);
      return cachedBond || null;
    }
  }, [rpc, contractAddress, bondCache, lastFetchTime, transformBondOffer]);

  const invalidateBond = useCallback((bondId) => {
    setBondCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(bondId);
      return newCache;
    });
  }, []);

  const invalidateAllBonds = useCallback(() => {
    setBondCache(new Map());
    setLastFetchTime(null);
  }, []);

  // Auto-refresh cache when it expires
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastFetchTime && (Date.now() - lastFetchTime) >= CACHE_DURATION) {
        fetchAllBonds(true).catch(console.error);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [lastFetchTime, fetchAllBonds]);

  const value = {
    bonds: Array.from(bondCache.values()),
    fetchAllBonds,
    getBond,
    invalidateBond,
    invalidateAllBonds,
    isFetching
  };

  return (
    <BondCacheContext.Provider value={value}>
      {children}
    </BondCacheContext.Provider>
  );
}

export function useBondCache() {
  const context = useContext(BondCacheContext);
  if (!context) {
    throw new Error('useBondCache must be used within a BondCacheProvider');
  }
  return context;
} 