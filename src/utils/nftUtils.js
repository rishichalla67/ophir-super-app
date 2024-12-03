const fetchUserNFTHoldings = async (walletAddress) => {
  try {
    const response = await fetch(`https://indexer.daodao.zone/narwhal-2/account/${walletAddress}/nft/collections`);
    if (!response.ok) {
      throw new Error('Failed to fetch NFT holdings');
    }
    
    const collections = await response.json();
    
    // Transform into a more easily searchable format
    const holdings = collections.reduce((acc, collection) => {
      acc[collection.collectionAddress] = new Set(collection.tokens);
      return acc;
    }, {});
    
    return holdings;
  } catch (error) {
    console.error('Error fetching NFT holdings:', error);
    return {};
  }
};

export { fetchUserNFTHoldings }; 