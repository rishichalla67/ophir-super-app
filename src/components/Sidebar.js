import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaChevronDown, FaChevronUp, FaHome, FaChartBar, FaExchangeAlt, FaHandHoldingUsd, FaStore, FaHandshake, FaInfoCircle, FaChartLine, FaHistory, FaSearch, FaUserShield, FaCrown } from 'react-icons/fa'; // Make sure to install react-icons
import { useSidebar } from '../context/SidebarContext';
import { useWallet } from '../context/WalletContext';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { daoConfig } from "../utils/daoConfig";

const Sidebar = () => {
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const navigate = useNavigate();
  const { connectedWalletAddress } = useWallet();
  const [isIssuer, setIsIssuer] = useState(false);

  const checkIfIssuer = async () => {
    if (!connectedWalletAddress) return;

    try {
      const rpc = "https://migaloo-rpc.polkachu.com";
      const contractAddress = daoConfig.BONDS_CONTRACT_ADDRESS;
      
      const client = await CosmWasmClient.connect(rpc);
      
      console.log("Checking issuer status for address:", connectedWalletAddress);
      console.log("Contract address:", contractAddress);
      
      const response = await client.queryContractSmart(
        contractAddress,
        { get_all_bond_offers: {} }
      );
      
      console.log("Bond offers response:", response);
      
      const isWalletIssuer = response.bond_offers.some(
        offer => offer.bond_offer.issuer.toLowerCase() === connectedWalletAddress.toLowerCase()
      );
      
      console.log("Is wallet issuer:", isWalletIssuer);
      setIsIssuer(isWalletIssuer);
    } catch (error) {
      console.error("Error checking issuer status:", error);
      setIsIssuer(false);
    }
  };

  useEffect(() => {
    if (!connectedWalletAddress) {
      setIsIssuer(false);
      return;
    }
    checkIfIssuer();
  }, [connectedWalletAddress]);

  const menuItems = [    
    {
      name: 'DASHBOARDS',
      icon: <FaChartBar className="mr-2" size={16} />,
      subItems: [
        { 
          name: 'Analytics', 
          path: '/dashboard/treasury',
          icon: <FaChartLine className="mr-2" size={14} />
        },
        { 
          name: 'Redemptions', 
          path: '/dashboard/redemptions',
          icon: <FaHistory className="mr-2" size={14} />
        },
      ],
    },
    { name: 'REDEEM', path: '/redeem', icon: <FaExchangeAlt className="mr-2" size={16} /> },
    {
      name: 'BONDS',
      icon: <FaHandHoldingUsd className="mr-2" size={16} />,
      subItems: [
        { 
          name: 'Browse', 
          path: '/bonds',
          icon: <FaSearch className="mr-2" size={14} />
        },
        ...(isIssuer ? [{
          name: 'Issuer', 
          path: '/bonds/issuer',
          icon: <FaCrown className="mr-2" size={14} />
        }] : []),
      ],
    },
    { 
      name: 'GOVERN', 
      path: '/govern', 
      icon: <FaUserShield className="mr-2" size={16} /> 
    },
  ];

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleItemClick = (path) => {
    if (path === '/about') {
      window.open('https://x.com/Ophir_DAO', '_blank');
      return;
    }
    
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    navigate(path);
  };

  const toggleDropdown = (e, name) => {
    e.stopPropagation();
    setOpenDropdowns(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  useEffect(() => {
    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <button
        className="sidebar-open-button text-white"
        onClick={toggleSidebar}
      >
        {isSidebarOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
      </button>
      <div className={`sidebar-bg top-20 w-48 sm:w-48 md:w-64 fixed left-0 transition-transform duration-300 ease-in-out transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} z-10 flex flex-col`}>
        <nav className="flex-grow">
          <ul className="flex flex-col">
            {menuItems.map((item) => (
              <li 
                key={item.name} 
                className={`pb-2 pt-4 sm:pb-4 sm:pt-4 w-full sidebar-item ${
                  item.name === 'DASHBOARDS' ? 'mt-12' : ''
                }`}
              >
                {item.subItems ? (
                  <div className="pr-4">
                    <button
                      onClick={(e) => toggleDropdown(e, item.name)}
                      className="button-sidebar text-sm sm:text-base hover:text-ophir-gold flex items-center justify-start w-full"
                    >
                      <span className="flex items-center">
                        {item.icon}
                        {item.name}
                      </span>
                      {openDropdowns[item.name] ? 
                        <FaChevronUp className="ml-1 item-right sm:ml-2" size={14} /> : 
                        <FaChevronDown className="ml-1 item-right sm:ml-2" size={14} />
                      }
                    </button>
                    {openDropdowns[item.name] && (
                      <ul className="mt-1 sm:mt-2">
                        {item.subItems.map((subItem) => (
                          <li key={subItem.name} className="mb-1 sm:mb-2">
                            <button
                              onClick={() => handleItemClick(subItem.path)}
                              className="button-sidebar pt-4 sm:text-xs hover:text-ophir-gold transition-colors duration-200 flex items-center justify-start w-full pl-6"
                            >
                              <span className="flex items-center">
                                {React.cloneElement(subItem.icon, { 
                                  size: 10,
                                  className: "mr-2 transition-colors duration-200"
                                })}
                                {subItem.name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="pr-4">
                    <button
                      onClick={() => handleItemClick(item.path)}
                      className="button-sidebar text-sm sm:text-base hover:text-ophir-gold flex items-center justify-start w-full"
                    >
                      <span className="flex items-center">
                        {item.icon}
                        {item.name}
                      </span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto mb-20 sm:mb-28 pr-4">
          <button
            onClick={() => handleItemClick('/about')}
            className="button-sidebar pb-2 text-sm sm:text-base hover:text-ophir-gold flex items-center justify-start w-full"
          >
            <span className="flex items-center">
              <FaInfoCircle className="mr-2" size={16} />
              ABOUT US
            </span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;