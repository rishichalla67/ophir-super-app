import React, { useState, useEffect } from 'react';
import { tokenMappings } from '../utils/tokenMappings';
import { ChevronDownIcon, ChevronUpIcon, ClockIcon } from '@heroicons/react/24/solid';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, formData, setFormData, isLoading, customBondName, fullBondDenomName, bondType, feeSplit, showAdvancedSettings, contractConfig, ...props }) => {
  const [isNFTExpanded, setIsNFTExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Add debug logging when component renders
  useEffect(() => {
    console.log('ConfirmationModal props:', {
      showAdvancedSettings,
      feeSplit,
      contractConfig,
      formData: {
        total_supply: formData.total_supply,
        price: formData.price,
        purchasing_denom: formData.purchasing_denom
      }
    });
  }, [showAdvancedSettings, feeSplit, contractConfig, formData]);

  if (!isOpen) return null;

  const isDatePast = (dateString) => {
    const date = new Date(dateString);
    return date <= currentTime;
  };

  const formatDateForInput = (date) => {
    return {
      date: date.toLocaleDateString('en-CA'),
      time: date.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5)
    };
  };

  const addTwoMinutes = (dateString) => {
    const date = new Date(dateString);
    date.setMinutes(date.getMinutes() + 2);
    return formatDateForInput(date);
  };

  const updateDateTime = (field, newDateTime) => {
    setFormData(prev => ({
      ...prev,
      [`${field}_time`]: newDateTime.date,
      [`${field}_time_hour`]: newDateTime.time
    }));
  };

  const calculateExpectedAmount = (totalSupply, price, purchasingDenom) => {
    if (!totalSupply || !price || !purchasingDenom) return null;
    
    const decimals = tokenMappings[purchasingDenom]?.decimals || 6;
    const rawAmount = parseFloat(totalSupply) * parseFloat(price);
    const totalFeeAmount = rawAmount * (parseFloat(contractConfig?.fee_rate || "0.03")); // Use contract fee rate or default to 3%
    
    // Calculate maker and taker fees based on feeSplit
    const takerFeeAmount = totalFeeAmount * (feeSplit / 100);
    const makerFeeAmount = totalFeeAmount * ((100 - feeSplit) / 100);
    const netAmount = rawAmount - totalFeeAmount;
    
    // Calculate percentages of total deposit
    const makerFeePercent = (makerFeeAmount / rawAmount) * 100;
    const takerFeePercent = (takerFeeAmount / rawAmount) * 100;
    const totalFeePercent = (totalFeeAmount / rawAmount) * 100;
    
    return {
      gross: rawAmount.toFixed(decimals),
      makerFee: makerFeeAmount.toFixed(decimals),
      takerFee: takerFeeAmount.toFixed(decimals),
      totalFee: totalFeeAmount.toFixed(decimals),
      net: netAmount.toFixed(decimals),
      makerFeePercent: makerFeePercent.toFixed(2),
      takerFeePercent: takerFeePercent.toFixed(2),
      totalFeePercent: totalFeePercent.toFixed(2)
    };
  };

  // Calculate fee rates if using custom split
  const getFeeRates = () => {
    if (showAdvancedSettings && feeSplit !== 30 && contractConfig?.fee_rate) {
      const totalFeeRate = parseFloat(contractConfig.fee_rate);
      if (!isNaN(totalFeeRate) && totalFeeRate > 0) {
        const makerRate = ((100 - feeSplit) / 100) * totalFeeRate;
        const takerRate = (feeSplit / 100) * totalFeeRate;
        return {
          maker_fee_rate: makerRate.toString(),
          taker_fee_rate: takerRate.toString()
        };
      }
    }
    return null;
  };

  const feeRates = getFeeRates();

  // Add fee rates to the confirmation details if they exist
  const getConfirmationDetails = () => {
    const details = {
      // ... existing details ...
    };

    if (feeRates) {
      details.maker_fee_rate = feeRates.maker_fee_rate;
      details.taker_fee_rate = feeRates.taker_fee_rate;
    }

    return details;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a1b23] rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-center text-white">Confirm Bond Creation</h2>
        
        <div className="space-y-3 text-gray-300">
          <div className="flex justify-between items-center">
            <span>Bond Start</span>
            <div className="flex items-center gap-2">
              <span>{new Date(`${formData.start_time}T${formData.start_time_hour}`).toLocaleString()}</span>
              {isDatePast(`${formData.start_time}T${formData.start_time_hour}`) && (
                <button
                  onClick={() => updateDateTime('start', addTwoMinutes(new Date()))}
                  className="p-1 rounded-full hover:bg-gray-700 transition-colors"
                  title="Add 2 minutes to current time"
                >
                  <ClockIcon className="h-4 w-4 text-yellow-500" />
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span>Bond End</span>
            <div className="flex items-center gap-2">
              <span>{new Date(`${formData.end_time}T${formData.end_time_hour}`).toLocaleString()}</span>
              {isDatePast(`${formData.end_time}T${formData.end_time_hour}`) && (
                <button
                  onClick={() => updateDateTime('end', addTwoMinutes(new Date()))}
                  className="p-1 rounded-full hover:bg-gray-700 transition-colors"
                  title="Add 2 minutes to current time"
                >
                  <ClockIcon className="h-4 w-4 text-yellow-500" />
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span>Claim Start</span>
            <div className="flex items-center gap-2">
              <span>
                {bondType === 'cliff' 
                  ? new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`).toLocaleString()
                  : (formData.claim_start_date && formData.claim_start_hour
                    ? new Date(`${formData.claim_start_date}T${formData.claim_start_hour}`).toLocaleString()
                    : new Date(`${formData.end_time}T${formData.end_time_hour}`).toLocaleString())}
              </span>
              {bondType !== 'cliff' && formData.claim_start_date && formData.claim_start_hour && 
                isDatePast(`${formData.claim_start_date}T${formData.claim_start_hour}`) && (
                <button
                  onClick={() => updateDateTime('claim_start', addTwoMinutes(new Date()))}
                  className="p-1 rounded-full hover:bg-gray-700 transition-colors"
                  title="Add 2 minutes to current time"
                >
                  <ClockIcon className="h-4 w-4 text-yellow-500" />
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span>Maturity</span>
            <div className="flex items-center gap-2">
              <span>{new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`).toLocaleString()}</span>
              {isDatePast(`${formData.maturity_date}T${formData.maturity_date_hour}`) && (
                <button
                  onClick={() => updateDateTime('maturity', addTwoMinutes(new Date()))}
                  className="p-1 rounded-full hover:bg-gray-700 transition-colors"
                  title="Add 2 minutes to current time"
                >
                  <ClockIcon className="h-4 w-4 text-yellow-500" />
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <span>Backing Token</span>
            <span>{tokenMappings[formData.token_denom]?.symbol || formData.token_denom}</span>
          </div>
          <div className="flex justify-between">
            <span>Quantity</span>
            <span>{formData.total_supply}</span>
          </div>
          <div className="flex justify-between">
            <span>Purchasing Token</span>
            <span>{tokenMappings[formData.purchasing_denom]?.symbol || formData.purchasing_denom}</span>
          </div>
          <div className="flex justify-between">
            <span>Price</span>
            <div className="flex items-center gap-2">
              <span>{formData.price}</span>
              {formData.markup !== undefined && (
                <span className={`text-sm ${formData.markup < 0 ? 'text-green-400' : formData.markup > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  ({formData.markup > 0 ? '+' : ''}{formData.markup}% {formData.markup < 0 ? 'Discount' : formData.markup > 0 ? 'Premium' : ''})
                </span>
              )}
            </div>
          </div>

          {/* Add Expected Amount Section */}
          {formData.total_supply && formData.price && formData.purchasing_denom && (
            <>
              <div className="flex justify-between text-red-400">
                <span>Maker Fee ({calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).makerFeePercent}%)</span>
                <span>
                  {calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).makerFee} {tokenMappings[formData.purchasing_denom]?.symbol}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Taker Fee ({calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).takerFeePercent}%)</span>
                <span>
                  {calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).takerFee} {tokenMappings[formData.purchasing_denom]?.symbol}
                </span>
              </div>
              {/* <div className="flex justify-between text-red-400">
                <span>Total Fee ({calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).totalFeePercent}%)</span>
                <span>
                  {calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).totalFee} {tokenMappings[formData.purchasing_denom]?.symbol}
                </span>
              </div> */}
              <div className="flex justify-between text-green-400">
                <span>Max Net Amount</span>
                <span>
                  {calculateExpectedAmount(formData.total_supply, formData.price, formData.purchasing_denom).net} {tokenMappings[formData.purchasing_denom]?.symbol}
                </span>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <span>Bond Name</span>
            <span>{customBondName || fullBondDenomName}</span>
          </div>
          <div className="flex justify-between">
            <span>Description</span>
            <span className="text-right max-w-[60%] break-words">{formData.description || "No description provided"}</span>
          </div>
          <div className="flex justify-between">
            <span>Bond Type</span>
            <span>{bondType === 'cliff' ? 'Cliff - Claim at maturity' : 'Vested - Custom claim start time'}</span>
          </div>

          {/* NFT Metadata Section */}
          <div className="border-t border-gray-700 pt-3">
            <button
              onClick={() => setIsNFTExpanded(!isNFTExpanded)}
              className="w-full flex justify-between items-center text-white hover:text-gray-300 transition-colors"
            >
              <span className="font-medium">NFT Metadata</span>
              {isNFTExpanded ? (
                <ChevronUpIcon className="h-5 w-5" />
              ) : (
                <ChevronDownIcon className="h-5 w-5" />
              )}
            </button>
            
            {isNFTExpanded && (
              <div className="mt-3 space-y-3">
                <div className="flex justify-between">
                  <span>NFT Name</span>
                  <span>{formData.nft_metadata.name || `${fullBondDenomName} Bond NFT`}</span>
                </div>
                <div className="flex justify-between">
                  <span>NFT Symbol</span>
                  <span>{formData.nft_metadata.symbol || fullBondDenomName}</span>
                </div>
                {formData.nft_metadata.token_uri && (
                  <div className="flex justify-between">
                    <span>Token URI</span>
                    <span className="text-right max-w-[60%] break-words">{formData.nft_metadata.token_uri}</span>
                  </div>
                )}
                {formData.nft_metadata.image && <div className="flex justify-between">
                  <span>Image URL</span>
                  <span className="text-right max-w-[60%] break-words">{formData.nft_metadata.image}</span>
                </div>}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white transition-colors disabled:bg-blue-800 disabled:cursor-not-allowed"
          >
            {isLoading ? "Confirming..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
