import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';
import { Link } from 'react-router-dom';
import { formatTokenAmount, parseTokenAmount } from '../utils/helpers';
import { tokenSymbols, tokenMappings } from '../utils/tokenMappings';
import { tokenImages } from '../utils/tokenImages';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';

function ResaleBonds() {
  const [resaleOffers, setResaleOffers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { client } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    bond_id: '',
    nft_token_id: '',
    price_per_bond: '',
    price_denom: 'ujuno',
    start_time: DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"),
    end_time: DateTime.now().plus({ days: 7 }).toFormat("yyyy-MM-dd'T'HH:mm"),
  });

  const fetchResaleOffers = async () => {
    try {
      console.log('Fetching resale offers...');
      console.log('Client status:', !!client);
      
      setIsLoading(true);
      
      if (!client) {
        console.log('Client not initialized');
        setIsLoading(false);
        return;
      }

      console.log('Contract address:', process.env.REACT_APP_BOND_CONTRACT_ADDRESS);
      
      const response = await client.queryContractSmart(process.env.REACT_APP_BOND_CONTRACT_ADDRESS, {
        "list_resale_offers": {}
      });
      
      console.log('Resale offers response:', response);
      setResaleOffers(response.offers || []);
    } catch (error) {
      console.error('Error fetching resale offers:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('ResaleBonds useEffect triggered');
    
    if (client) {
      fetchResaleOffers();
    } else {
      console.log('No client available yet');
      setIsLoading(false);
    }
  }, [client]);

  const handleOfferClick = (bondId) => {
    if (!bondId) return;
    navigate(`/bonds/resale/${bondId}`);
  };

  const getTokenSymbol = (denom) => {
    if (!denom) return '';
    return tokenMappings[denom]?.symbol || denom;
  };

  const getTokenImage = (symbol) => {
    if (!symbol) return '';
    const lowerSymbol = symbol.toLowerCase();
    return tokenImages[lowerSymbol] || '';
  };

  const filteredOffers = resaleOffers.filter((offer) => {
    const searchLower = searchTerm.toLowerCase();
    return searchTerm === '' || (
      (offer.bond_id?.toString() || '').includes(searchLower)
    );
  });

  const ResaleCard = ({ offer }) => {
    if (!offer) return null;
    const tokenSymbol = getTokenSymbol(offer.token_denom);
    const tokenImage = getTokenImage(tokenSymbol);

    return (
      <div 
        className="backdrop-blur-sm rounded-xl p-6 mb-4 cursor-pointer 
          transition duration-300 shadow-lg hover:shadow-xl 
          border border-gray-700/50 hover:border-gray-600/50
          bg-gray-800/80 hover:bg-gray-700/80"
        onClick={() => handleOfferClick(offer.bond_id)}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center">
            {tokenImage && (
              <div className="w-10 h-10 rounded-full mr-3 overflow-hidden shadow-md">
                <img src={tokenImage} alt={tokenSymbol} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">Bond #{offer.bond_id}</h3>
              <div className="text-sm text-gray-400">Token ID: {offer.nft_token_id}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Amount</span>
            <span className="font-medium">{formatTokenAmount(offer.amount)} {tokenSymbol}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Asking Price</span>
            <span className="font-medium">{formatTokenAmount(offer.price)} {getTokenSymbol(offer.price_denom)}</span>
          </div>
        </div>
      </div>
    );
  };

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    try {
      const msg = {
        create_resale_offer: {
          bond_id: parseInt(formData.bond_id),
          nft_token_id: formData.nft_token_id,
          price_per_bond: parseTokenAmount(formData.price_per_bond),
          price_denom: formData.price_denom,
          start_time: Math.floor(DateTime.fromISO(formData.start_time).toSeconds()),
          end_time: Math.floor(DateTime.fromISO(formData.end_time).toSeconds()),
        }
      };

      const response = await client.execute(
        process.env.REACT_APP_BOND_CONTRACT_ADDRESS,
        msg,
        "auto"
      );

      if (response) {
        setIsModalOpen(false);
        // Refresh the offers list
        fetchResaleOffers();
      }
    } catch (error) {
      console.error('Error creating resale offer:', error);
    }
  };

  return (
    <div 
      className={`global-bg text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-5">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold h1-color">Bond Resale Market</h1>
          <div className="flex space-x-4 items-center">
            <button
              onClick={() => setIsModalOpen(true)}
              className="landing-button px-4 py-1.5 rounded-md hover:bg-yellow-500 transition duration-300 text-sm"
            >
              Create Offer
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by bond ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 pl-10 rounded-md bg-gray-700 text-white border border-gray-600 
                focus:border-yellow-500 focus:outline-none transition duration-300"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-[calc(100vh-200px)]">
            <div className="text-white mb-4">Loading Resale Offers...</div>
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-yellow-400"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOffers.length === 0 ? (
              <div className="col-span-full text-center text-gray-400 mt-8">
                No bonds are currently listed for resale
              </div>
            ) : (
              filteredOffers.map((offer) => (
                <ResaleCard key={`${offer.bond_id}-${offer.nft_token_id}`} offer={offer} />
              ))
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-gray-900/90 rounded-2xl w-full max-w-sm border border-gray-700/50 shadow-xl h-[80vh] flex flex-col">
            <div className="p-6 flex flex-col h-full">
              <h2 className="text-2xl font-bold mb-4 text-center text-white">Create Resale Offer</h2>
              
              <form onSubmit={handleCreateOffer} className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-300">Bond ID</label>
                    <input
                      type="number"
                      value={formData.bond_id}
                      onChange={(e) => setFormData({...formData, bond_id: e.target.value})}
                      className="w-full p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-300">NFT Token ID</label>
                    <input
                      type="text"
                      value={formData.nft_token_id}
                      onChange={(e) => setFormData({...formData, nft_token_id: e.target.value})}
                      className="w-full p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-300">Price per Bond</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.price_per_bond}
                      onChange={(e) => setFormData({...formData, price_per_bond: e.target.value})}
                      className="w-full p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-300">Price Denom</label>
                    <select
                      value={formData.price_denom}
                      onChange={(e) => setFormData({...formData, price_denom: e.target.value})}
                      className="w-full p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                    >
                      {Object.entries(tokenMappings).map(([denom, details]) => (
                        <option key={denom} value={denom}>
                          {details.symbol}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-300">Start Time</label>
                    <input
                      type="datetime-local"
                      value={formData.start_time}
                      onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                      className="w-full p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-300">End Time</label>
                    <input
                      type="datetime-local"
                      value={formData.end_time}
                      onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                      className="w-full p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 focus:outline-none transition-all text-white"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-gray-700">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition duration-300 text-gray-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 transition duration-300 text-black font-medium"
                  >
                    Create Offer
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResaleBonds;