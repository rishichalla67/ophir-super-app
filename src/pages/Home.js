import React from 'react';
import '../App.css';
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext'; // Add this import

const Home = () => {
  const featuredItems = [
    { title: 'Ophir DAO', image: 'https://raw.githubusercontent.com/cosmos/chain-registry/master/migaloo/images/ophir.png', tag: 'DAO', link: 'https://ophirdao.com' },
    { title: 'Ophir OTC market', image: '/ophir-otc.png', tag: 'OTC' },
    { title: 'Ophir NFT collection', image: '/ophir-nft.png', tag: 'NFT' },
  ];

  const services = [
    { title: 'Ophir redemption', image: '/ophir-redemption.png', tag: 'DeFi' },
    { title: 'Ophir bond market', image: '/ophir-bond.png', tag: 'DeFi' },
    { title: 'Ophir lending market', image: '/ophir-lending.png', tag: 'DeFi' },
  ];
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar(); // Add this line

  const handleCardClick = (link) => {
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className={`min-h-screen global-bg text-white p-8 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:pl-72' : ''}`} 
      style={{ paddingTop: "12dvh" }}
    >
      <h1 className="text-4xl font-bold mb-4">Bank of <span className="text-ophir-gold">OPHIR</span></h1>
      <p className="text-xl mb-8">Your gateway to financial freedom</p>

      <h2 className="text-2xl font-bold mb-4">Featured</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {featuredItems.map((item) => (
          <div 
            key={item.title} 
            className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => handleCardClick(item.link)}
          >
            <img src={item.image} alt={item.title} className="w-full h-48 object-cover" />
            <div className="p-4">
              <h3 className="text-xl font-bold">{item.title}</h3>
              <span className="inline-block bg-ophir-gold text-black px-2 py-1 rounded-full text-sm mt-2">
                {item.tag}
              </span>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-4">Ophir services</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {services.map((service) => (
          <div key={service.title} className="bg-gray-800 rounded-lg overflow-hidden">
            <img src={service.image} alt={service.title} className="w-full h-48 object-cover" />
            <div className="p-4">
              <h3 className="text-xl font-bold">{service.title}</h3>
              <span className="inline-block bg-ophir-gold text-black px-2 py-1 rounded-full text-sm mt-2">
                {service.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;