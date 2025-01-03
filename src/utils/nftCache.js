const CACHE_KEY = 'nft_info_cache';

// Initialize cache from localStorage
const initializeCache = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.error('Error loading cache from localStorage:', error);
    return {};
  }
};

// Save cache to localStorage
const saveCache = (cache) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving cache to localStorage:', error);
  }
};

export const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

export const invalidateNFTCache = (contractAddr, tokenId) => {
  const cacheKey = `${contractAddr}_${tokenId}`;
  const cache = initializeCache();
  
  if (cache[cacheKey]) {
    console.log('🗑️ Invalidating NFT cache for:', cacheKey);
    delete cache[cacheKey];
    saveCache(cache);
  }
};

export const getNFTInfo = async (contractAddr, tokenId, rpc) => {
  const cacheKey = `${contractAddr}_${tokenId}`;
  const now = Date.now();
  const cache = initializeCache();
  
  // Check cache first
  if (cache[cacheKey]) {
    const cachedData = cache[cacheKey];
    if (now - cachedData.timestamp < CACHE_DURATION) {
      console.log('📦 Using cached NFT info for:', cacheKey);
      return cachedData.data;
    } else {
      // Remove expired cache entry
      delete cache[cacheKey];
    }
  }

  try {
    const { CosmWasmClient } = await import("@cosmjs/cosmwasm-stargate");
    const nftClient = await CosmWasmClient.connect(rpc);
    const nftInfo = await nftClient.queryContractSmart(
      contractAddr,
      {
        nft_info: {
          token_id: tokenId
        }
      }
    );
    
    // Cache the result
    cache[cacheKey] = {
      data: nftInfo,
      timestamp: now
    };
    saveCache(cache);
    
    console.log(`📦 Fetched and cached NFT Info for token ${tokenId}:`, nftInfo);
    return nftInfo;
  } catch (error) {
    console.error(`Error fetching NFT info for token ${tokenId}:`, error);
    throw error;
  }
};

// Add batch caching functionality
export const batchGetNFTInfo = async (contractAddr, tokenIds, rpc) => {
  const now = Date.now();
  const cache = initializeCache();
  const uncachedTokenIds = [];
  const results = {};

  // Check cache first for all tokens
  for (const tokenId of tokenIds) {
    const cacheKey = `${contractAddr}_${tokenId}`;
    if (cache[cacheKey]) {
      const cachedData = cache[cacheKey];
      if (now - cachedData.timestamp < CACHE_DURATION) {
        results[tokenId] = cachedData.data;
        continue;
      }
      delete cache[cacheKey];
    }
    uncachedTokenIds.push(tokenId);
  }

  // If there are uncached tokens, fetch them in batches
  if (uncachedTokenIds.length > 0) {
    try {
      const { CosmWasmClient } = await import("@cosmjs/cosmwasm-stargate");
      const nftClient = await CosmWasmClient.connect(rpc);
      
      // Process in batches of 10
      const batchSize = 10;
      for (let i = 0; i < uncachedTokenIds.length; i += batchSize) {
        const batch = uncachedTokenIds.slice(i, i + batchSize);
        const promises = batch.map(tokenId => 
          nftClient.queryContractSmart(contractAddr, {
            nft_info: { token_id: tokenId }
          })
        );
        
        const batchResults = await Promise.all(promises);
        
        // Cache the results
        batch.forEach((tokenId, index) => {
          const nftInfo = batchResults[index];
          const cacheKey = `${contractAddr}_${tokenId}`;
          cache[cacheKey] = {
            data: nftInfo,
            timestamp: now
          };
          results[tokenId] = nftInfo;
        });
      }
      
      saveCache(cache);
    } catch (error) {
      console.error('Error in batch NFT info fetch:', error);
      throw error;
    }
  }

  return results;
};

// Export the cache functions
export const nftInfoCache = {
  has: (contractAddr, tokenId) => {
    const cacheKey = `${contractAddr}_${tokenId}`;
    const cache = initializeCache();
    const now = Date.now();
    
    if (cache[cacheKey]) {
      const cachedData = cache[cacheKey];
      return now - cachedData.timestamp < CACHE_DURATION;
    }
    return false;
  },
  
  get: (contractAddr, tokenId) => {
    const cacheKey = `${contractAddr}_${tokenId}`;
    const cache = initializeCache();
    const now = Date.now();
    
    if (cache[cacheKey]) {
      const cachedData = cache[cacheKey];
      if (now - cachedData.timestamp < CACHE_DURATION) {
        return cachedData.data;
      }
      // Remove expired cache entry
      delete cache[cacheKey];
      saveCache(cache);
    }
    return null;
  },
  
  set: (contractAddr, tokenId, data) => {
    const cacheKey = `${contractAddr}_${tokenId}`;
    const cache = initializeCache();
    cache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    saveCache(cache);
  },
  
  delete: (contractAddr, tokenId) => {
    const cacheKey = `${contractAddr}_${tokenId}`;
    const cache = initializeCache();
    if (cache[cacheKey]) {
      delete cache[cacheKey];
      saveCache(cache);
      console.log('🗑️ Deleted cache entry for:', cacheKey);
    }
  }
}; 