import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa'; // Make sure to install react-icons
import { useSidebar } from '../context/SidebarContext';

const Sidebar = () => {
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
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
    { name: 'BONDS', path: '/bonds' },
    // { name: 'OTC MARKET', path: '/otc-market' },
    // { name: 'LENDING', path: '/lending' },
    { name: 'Bond Resale', path: '/bonds/resale'},
  ];

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleItemClick = (path) => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    navigate(path);
  };

  const toggleDashboard = (e) => {
    e.stopPropagation();
    setIsDashboardOpen(!isDashboardOpen);
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
        {isSidebarOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
      </button>
      <div className={`sidebar-bg sidebar top-20 sm:w-48 md:w-64 fixed left-0 transition-transform duration-300 ease-in-out transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} z-10 flex flex-col`}>
        <nav className="flex-grow">
          <ul className="flex flex-col items-end">
            {menuItems.map((item) => (
              <li key={item.name} className="pb-4 pt-4 w-full sidebar-item">
                {item.subItems ? (
                  <div>
                    <button
                      onClick={toggleDashboard}
                      className="button-sidebar hover:text-ophir-gold flex items-center justify-center w-full"
                    >
                      {isDashboardOpen ? <FaChevronUp className="mr-2" /> : <FaChevronDown className="mr-2" />}
                      {item.name}
                    </button>
                    {isDashboardOpen && (
                      <ul className="mt-2">
                        {item.subItems.map((subItem) => (
                          <li key={subItem.name} className="mb-2">
                            <button
                              onClick={() => handleItemClick(subItem.path)}
                              className="button-sidebar hover:text-ophir-gold"
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
                    className="button-sidebar hover:text-ophir-gold"
                  >
                    {item.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto mb-28">
          <button
            onClick={() => handleItemClick('/about')}
            className="button-sidebar hover:text-ophir-gold"
          >
            ABOUT US
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;