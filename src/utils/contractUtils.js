// Convert contract timestamps to local dates
export const convertContractTimeToDate = (contractTime) => {
  try {
    const timeString = contractTime?.toString() || '0';
    
    // Check if the time is already in milliseconds (less than 13 digits)
    if (timeString.length <= 13) {
      return new Date(parseInt(timeString));
    }
    
    // Otherwise, convert from nanoseconds to milliseconds
    return new Date(parseInt(timeString) / 1_000_000);
  } catch (error) {
    console.error('Error converting contract time:', error, contractTime);
    return new Date();
  }
};

// Get timestamp offsets for contract queries
export const getTimestampOffsets = (startDate, endDate) => {
  const now = new Date();
  const startOffset = Math.ceil((startDate - now) / (1000 * 60));
  const endOffset = Math.ceil((endDate - now) / (1000 * 60));
  
  return {
    start_offset: startOffset,
    end_offset: endOffset,
    claim_start_offset: endOffset + 30,
    mature_offset: endOffset + 30
  };
};

// Query contract with message
export const queryContract = async (message, contractAddress, client) => {
  try {
    const response = await client.queryContractSmart(
      contractAddress,
      message
    );
    return response;
  } catch (error) {
    console.error('Contract query failed:', error);
    throw error;
  }
}; 