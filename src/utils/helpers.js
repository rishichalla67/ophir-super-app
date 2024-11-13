/**
 * Formats a token amount by dividing by the appropriate decimal places
 * @param {string|number} amount - The amount to format
 * @param {number} decimals - Number of decimal places (default: 6)
 * @returns {string} Formatted amount
 */
export const formatTokenAmount = (amount, decimals = 6) => {
  if (!amount) return '0';
  
  const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const formattedAmount = (parsedAmount / Math.pow(10, decimals)).toLocaleString(
    'en-US',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }
  );
  
  return formattedAmount;
};

/**
 * Formats a date string or timestamp to a readable format
 * @param {string|number} date - Date string or timestamp
 * @returns {string} Formatted date
 */
export const formatDate = (date) => {
  if (!date) return '';
  
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Truncates an address or long string
 * @param {string} str - String to truncate
 * @param {number} startChars - Number of characters to show at start
 * @param {number} endChars - Number of characters to show at end
 * @returns {string} Truncated string
 */
export const truncateString = (str, startChars = 6, endChars = 4) => {
  if (!str) return '';
  if (str.length <= startChars + endChars) return str;
  
  return `${str.slice(0, startChars)}...${str.slice(-endChars)}`;
};

/**
 * Formats a number to a compact representation
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export const formatCompactNumber = (num) => {
  if (!num) return '0';
  
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num);
};

/**
 * Parses a token amount from a human readable format to a contract format
 * @param {string} amount - The amount to parse
 * @returns {string} Parsed amount in contract format
 */
export const parseTokenAmount = (amount) => {
  // Convert human readable number to contract format (multiply by 10^6 for 6 decimal places)
  return (parseFloat(amount) * 1000000).toString();
}; 