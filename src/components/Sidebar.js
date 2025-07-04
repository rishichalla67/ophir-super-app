import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaChevronDown, FaChevronUp, FaHome, FaChartBar, FaExchangeAlt, FaHandHoldingUsd, FaStore, FaHandshake, FaInfoCircle, FaChartLine, FaHistory, FaSearch, FaUserShield, FaCrown, FaTelegram, FaTwitter, FaGithub, FaBook, FaTools, FaServer, FaShieldAlt } from 'react-icons/fa'; // Make sure to install react-icons
import { useSidebar } from '../context/SidebarContext';
import { useWallet } from '../context/WalletContext';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { daoConfig } from "../utils/daoConfig";
import { useIssuer } from '../context/IssuerContext';

const Sidebar = () => {
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const navigate = useNavigate();
  const { connectedWalletAddress } = useWallet();
  const { isIssuer, setIsIssuer } = useIssuer();

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
      icon: <FaHandshake className="mr-2" size={16} />,
      subItems: [
        { 
          name: 'My Bonds', 
          path: '/my-bonds',
          icon: <FaHandHoldingUsd className="mr-2" size={14} />
        },
        { 
          name: 'Browse', 
          path: '/bonds',
          icon: <FaSearch className="mr-2" size={14} />
        },
        { 
          name: 'Resale', 
          path: '/bonds/resale',
          icon: <FaStore className="mr-2" size={14} />
        },
        // ...(isIssuer ? [{
        //   name: 'Issuer', 
        //   path: '/bonds/issuer',
        //   icon: <FaCrown className="mr-2" size={14} />
        // }] : []),
      ],
    },
    { 
      name: 'GOVERN', 
      path: '/govern', 
      icon: <FaUserShield className="mr-2" size={16} /> 
    },
    // { 
    //   name: 'SEEKERS', 
    //   path: '/seekers', 
    //   icon: <FaHandHoldingUsd className="mr-2" size={16} /> 
    // },
    { 
      name: 'DEV TOOLS', 
      path: '/wasmdev', 
      icon: <FaTools className="mr-2" size={16} /> 
    },
    {
      name: 'VALIDATOR',
      icon: <FaHandshake className="mr-2" size={16} />,
      subItems: [
        { 
          name: 'OphirDao Terra RPC', 
          url: 'https://terra-rpc.ophirdao.com',
          icon: <FaServer className="mr-2" size={14} />
        },
        { 
          name: 'OphirDao Terra Validator', 
          url: 'https://www.mintscan.io/terra/validators/terravaloper1swfpsl9ctturq2dgmngmtdyhdtsjny4z0j9fjv',
          icon: <FaShieldAlt className="mr-2" size={14} />
        }
      ],
    },
  ];

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleItemClick = (item) => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }

    if (item.url) {
      window.open(item.url, '_blank');
    } else if (item.path) {
      navigate(item.path);
    }
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

  const socialLinks = [
    {
      name: 'Twitter',
      icon: <FaTwitter size={16} />,
      url: 'https://x.com/Ophir_DAO'
    },
    {
      name: 'Telegram',
      icon: <FaTelegram size={16} />,
      url: 'https://t.me/+B-hjVJYpD-RjZWJh'
    },
    // {
    //   name: 'GitHub',
    //   icon: <FaGithub size={16} />,
    //   url: 'https://github.com/Freytes/OphirBonds'
    // },
    {
      name: 'Docs',
      icon: <FaBook size={16} />,
      url: 'https://ophir-dao.gitbook.io/ophirdao/'
    }
  ];

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
                              onClick={() => handleItemClick(subItem)}
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
                      onClick={() => handleItemClick(item)}
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
        <div className="mt-auto mb-28 sm:mb-24 pr-4 flex justify-center space-x-4">
          {socialLinks.map((link) => (
              <button
                key={link.name}
                onClick={() => window.open(link.url, '_blank')}
                className="button-sidebar hover:text-ophir-gold"
                title={link.name}
              >
                {link.icon}
              </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default Sidebar;