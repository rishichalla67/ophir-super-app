import React, { useState, useEffect } from 'react';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { daoConfig } from "../utils/daoConfig";
import { useWallet } from '../context/WalletContext';
import { FaSpinner } from 'react-icons/fa';
import { useSidebar } from '../context/SidebarContext';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

const Issuers = () => {
  const { isSidebarOpen } = useSidebar();
  const [isLoading, setIsLoading] = useState(true);
  const [bonds, setBonds] = useState([]);
  const { connectedWalletAddress } = useWallet();

  useEffect(() => {
    fetchBonds();
  }, [connectedWalletAddress]);

  const fetchBonds = async () => {
    try {
      const rpc = "https://migaloo-testnet-rpc.polkachu.com:443";
      const client = await CosmWasmClient.connect(rpc);
      const response = await client.queryContractSmart(
        daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET,
        { get_all_bond_offers: {} }
      );

      // Filter bonds for the current issuer
      const issuerBonds = response.bond_offers.filter(
        offer => offer.bond_offer.issuer === connectedWalletAddress
      );
      setBonds(issuerBonds);
    } catch (error) {
      console.error("Error fetching bonds:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate stats from bonds data
  const calculateStats = () => {
    if (!bonds.length) return {
      totalBonds: 0,
      activeBonds: 0,
      totalValue: 0,
      remainingValue: 0,
      soldValue: 0,
      averagePrice: 0
    };

    const now = new Date();
    
    return {
      totalBonds: bonds.length,
      activeBonds: bonds.filter(bond => {
        const startTime = new Date(parseInt(bond.bond_offer.purchase_start_time) / 1_000_000);
        const endTime = new Date(parseInt(bond.bond_offer.purchase_end_time) / 1_000_000);
        return now >= startTime && now <= endTime && !bond.bond_offer.closed;
      }).length,
      totalValue: bonds.reduce((acc, bond) => acc + parseInt(bond.bond_offer.total_amount), 0),
      remainingValue: bonds.reduce((acc, bond) => acc + parseInt(bond.bond_offer.remaining_supply), 0),
      soldValue: bonds.reduce((acc, bond) => 
        acc + (parseInt(bond.bond_offer.total_amount) - parseInt(bond.bond_offer.remaining_supply)), 0),
      averagePrice: bonds.reduce((acc, bond) => acc + parseFloat(bond.bond_offer.price), 0) / bonds.length
    };
  };

  const stats = calculateStats();

  const calculateSoldPercentage = (remainingSupply, totalAmount) => {
    if (!remainingSupply || !totalAmount) return 0;
    const sold = parseInt(totalAmount) - parseInt(remainingSupply);
    return Math.round((sold / parseInt(totalAmount)) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="animate-spin text-ophir-gold h-8 w-8" />
      </div>
    );
  }

  if (!connectedWalletAddress) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-white">
          Please connect your wallet to view your issued bonds.
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`global-bg-new text-white min-h-screen flex flex-col items-center w-full transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "12dvh" }}
    >
      <div className="max-w-7xl mx-auto w-full px-4 mt-10">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">Your Issued Bonds</h1>
        
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-8">
          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Total Bonds</h3>
            <p className="text-white text-lg md:text-2xl font-bold">{stats.totalBonds}</p>
            <p className="text-gray-400 text-xs md:text-sm">{stats.activeBonds} Active</p>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Total Value</h3>
            <p className="text-white text-lg md:text-2xl font-bold">
              {(stats.totalValue / 1_000_000).toLocaleString()} OPHIR
            </p>
            <p className="text-gray-400 text-xs md:text-sm">Total bonds issued</p>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Sold Value</h3>
            <p className="text-white text-lg md:text-2xl font-bold">
              {(stats.soldValue / 1_000_000).toLocaleString()} OPHIR
            </p>
            <p className="text-gray-400 text-xs md:text-sm">
              {((stats.soldValue / stats.totalValue) * 100).toFixed(1)}% of total supply
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3 md:p-6 border border-gray-700">
            <h3 className="text-ophir-gold text-sm md:text-lg mb-1 md:mb-2">Average Price</h3>
            <p className="text-white text-lg md:text-2xl font-bold">
              {stats.averagePrice.toFixed(3)} WHALE
            </p>
            <p className="text-gray-400 text-xs md:text-sm">Per OPHIR token</p>
          </div>
        </div>

        {/* Bonds Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-white text-xs mb-10 md:text-base">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">ID</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Name</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Amount</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Price</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Progress</th>
                <th className="px-1 py-2 md:px-4 md:py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {bonds.map((bond) => {
                const now = new Date();
                const startTime = new Date(parseInt(bond.bond_offer.purchase_start_time) / 1_000_000);
                const endTime = new Date(parseInt(bond.bond_offer.purchase_end_time) / 1_000_000);
                const isSoldOut = parseInt(bond.bond_offer.remaining_supply) === 0;
                
                let status = 'Inactive';
                if (now >= startTime && now <= endTime && !bond.bond_offer.closed) {
                  status = 'Active';
                } else if (now < startTime) {
                  status = 'Upcoming';
                } else if (isSoldOut) {
                  status = 'Sold Out';
                }

                const soldPercentage = calculateSoldPercentage(
                  bond.bond_offer.remaining_supply,
                  bond.bond_offer.total_amount
                );

                return (
                  <tr key={bond.bond_offer.bond_id} className="border-b border-gray-700">
                    <td className="px-1 py-2 md:px-4 md:py-3">{bond.bond_offer.bond_id}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <div className="max-w-[80px] md:max-w-none truncate">
                        {bond.bond_offer.bond_name}
                      </div>
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <span className="whitespace-nowrap">
                        {(parseInt(bond.bond_offer.total_amount) / 1_000_000).toLocaleString()} OPHIR
                      </span>
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <span className="whitespace-nowrap">
                        {parseFloat(bond.bond_offer.price).toFixed(3)} WHALE
                      </span>
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <div className="flex items-center gap-1 md:gap-2">
                        {/* Progress circle - smaller on mobile, larger on desktop */}
                        <div className="w-6 h-6 md:w-8 md:h-8">
                          <CircularProgressbar
                            value={soldPercentage}
                            text={`${soldPercentage}%`}
                            styles={buildStyles({
                              // Smaller text on mobile
                              textSize: '32px',
                              pathColor: '#ffa500',
                              textColor: '#fff',
                              trailColor: '#d6d6d6',
                              // Adjust text size based on screen size
                              text: {
                                fontSize: '32px',
                                dominantBaseline: 'middle',
                                textAnchor: 'middle',
                              }
                            })}
                          />
                        </div>
                        {/* Text version for all screens */}
                        <div className="text-[10px] md:text-sm">
                          <span className="text-gray-400 block text-[8px] md:text-xs">
                            {((parseInt(bond.bond_offer.total_amount) - parseInt(bond.bond_offer.remaining_supply)) / 1_000_000).toLocaleString()}/
                            {(parseInt(bond.bond_offer.total_amount) / 1_000_000).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3">
                      <span className={`px-1 py-0.5 md:px-2 md:py-1 rounded-full text-[10px] md:text-xs ${
                        status === 'Active' ? 'bg-green-500/20 text-green-400' :
                        status === 'Upcoming' ? 'bg-blue-500/20 text-blue-400' :
                        status === 'Sold Out' ? 'bg-red-500/20 text-red-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {bonds.length === 0 && (
          <div className="text-center text-white mt-8">
            You haven't issued any bonds yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default Issuers; 