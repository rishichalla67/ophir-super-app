import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa'; // Make sure to install react-icons
import { useSidebar } from '../context/SidebarContext';

const Sidebar = () => {
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const [openDropdowns, setOpenDropdowns] = useState({});
  const navigate = useNavigate();

  const menuItems = [
    { name: 'HOME', path: '/' },
    {
      name: 'DASHBOARD',
      subItems: [
        { name: 'Analytics', path: '/dashboard/treasury' },
        { name: 'Redemptions', path: '/dashboard/redemptions' },
      ],
    },
    { name: 'REDEEM', path: '/redeem' },

    {
      name: 'BONDS',
      subItems: [
        { name: 'Home', path: '/bonds' },
        { name: 'Resale', path: '/bonds/resale' },
      ],
    },
    // { name: 'BONDS', path: '/bonds' },
    // { name: 'OTC MARKET', path: '/otc-market' },
    // { name: 'LENDING', path: '/lending' },
    // { name: 'BOND RESALE', path: '/bonds/resale'},
  ];

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleItemClick = (path) => {
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
      <div className={`sidebar-bg top-20 w-44 sm:w-48 md:w-64 fixed left-0 transition-transform duration-300 ease-in-out transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} z-10 flex flex-col`}>
        <nav className="flex-grow">
          <ul className="flex flex-col">
            {menuItems.map((item) => (
              <li key={item.name} className="pb-2 pt-2 sm:pb-4 sm:pt-4 w-full sidebar-item text-right pr-4">
                {item.subItems ? (
                  <div>
                    <button
                      onClick={(e) => toggleDropdown(e, item.name)}
                      className="button-sidebar text-sm sm:text-base hover:text-ophir-gold flex items-center justify-end w-full"
                    >
                      {item.name}
                      {openDropdowns[item.name] ? <FaChevronUp className="ml-1 sm:ml-2" size={14} /> : <FaChevronDown className="ml-1 sm:ml-2" size={14} />}
                    </button>
                    {openDropdowns[item.name] && (
                      <ul className="mt-1 sm:mt-2">
                        {item.subItems.map((subItem) => (
                          <li key={subItem.name} className="mb-1 sm:mb-2 text-right">
                            <button
                              onClick={() => handleItemClick(subItem.path)}
                              className="button-sidebar text-sm sm:text-base hover:text-ophir-gold"
                            >
                              {subItem.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleItemClick(item.path)}
                    className="button-sidebar text-sm sm:text-base hover:text-ophir-gold w-full text-right"
                  >
                    {item.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto mb-20 sm:mb-28 text-right pr-4">
          <button
            onClick={() => handleItemClick('/about')}
            className="button-sidebar text-sm sm:text-base hover:text-ophir-gold"
          >
            ABOUT US
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;