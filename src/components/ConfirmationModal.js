import React, { useState } from 'react';
import { tokenMappings } from '../utils/tokenMappings';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, formData, isLoading, customBondName, fullBondDenomName }) => {
  const [isNFTExpanded, setIsNFTExpanded] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-[#1a1b23] rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-center text-white">Confirm Bond Creation</h2>
        
        <div className="space-y-3 text-gray-300">
          <div className="flex justify-between">
            <span>Bond Start</span>
            <span>{new Date(`${formData.start_time}T${formData.start_time_hour}`).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Bond End</span>
            <span>{new Date(`${formData.end_time}T${formData.end_time_hour}`).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Maturity</span>
            <span>{new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`).toLocaleString()}</span>
          </div>
          
          {!formData.immediate_claim && (
            <>
              <div className="flex justify-between">
                <span>Claim Start</span>
                <span>
                  {formData.claim_start_date && formData.claim_start_hour
                    ? new Date(`${formData.claim_start_date}T${formData.claim_start_hour}`).toLocaleString()
                    : new Date(`${formData.end_time}T${formData.end_time_hour}`).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Claim End</span>
                <span>
                  {formData.claim_end_date && formData.claim_end_hour
                    ? new Date(`${formData.claim_end_date}T${formData.claim_end_hour}`).toLocaleString()
                    : new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`).toLocaleString()}
                </span>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <span>Token</span>
            <span>{tokenMappings[formData.token_denom]?.symbol || formData.token_denom}</span>
          </div>
          <div className="flex justify-between">
            <span>Quantity</span>
            <span>{formData.total_supply}</span>
          </div>
          <div className="flex justify-between">
            <span>Purchasing</span>
            <span>{tokenMappings[formData.purchasing_denom]?.symbol || formData.purchasing_denom}</span>
          </div>
          <div className="flex justify-between">
            <span>Price</span>
            <span>{formData.price}</span>
          </div>
          <div className="flex justify-between">
            <span>Bond Name</span>
            <span>{customBondName || fullBondDenomName}</span>
          </div>
          <div className="flex justify-between">
            <span>Description</span>
            <span className="text-right max-w-[60%] break-words">{formData.description || "No description provided"}</span>
          </div>
          <div className="flex justify-between">
            <span>Immediate Claim</span>
            <span>{formData.immediate_claim ? "Yes" : "No"}</span>
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
