export const nftInfoCache = new Map();
export const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes in milliseconds

export const getNFTInfo = async (contractAddr, tokenId, rpc) => {
  const cacheKey = `${contractAddr}_${tokenId}`;
  const now = Date.now();
  
  // Check cache first
  if (nftInfoCache.has(cacheKey)) {
    const cachedData = nftInfoCache.get(cacheKey);
    if (now - cachedData.timestamp < CACHE_DURATION) {
      console.log('📦 Using cached NFT info for:', cacheKey);
      return cachedData.data;
    } else {
      // Remove expired cache entry
      nftInfoCache.delete(cacheKey);
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
    nftInfoCache.set(cacheKey, {
      data: nftInfo,
      timestamp: now
    });
    
    console.log(`📦 Fetched and cached NFT Info for token ${tokenId}:`, nftInfo);
    return nftInfo;
  } catch (error) {
    console.error(`Error fetching NFT info for token ${tokenId}:`, error);
    throw error;
  }
}; 