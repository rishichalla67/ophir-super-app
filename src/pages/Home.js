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
    <div className={`min-h-screen global-bg-new flex flex-col items-center justify-center text-white transition-all duration-300 ease-in-out ${
      isSidebarOpen ? 'md:pl-64' : ''
    }`}>
      <main className="flex flex-col items-center justify-center flex-1 px-4 sm:px-6 lg:px-8">
        <img
          src="https://raw.githubusercontent.com/cosmos/chain-registry/master/migaloo/images/ophir.png"
          alt="Ophir DAO"
          className="w-32 h-32 mb-4"
        />
        <h1 className="text-4xl font-bold mb-4">BANK of Ophir</h1>
        <p className="mx-auto w-4/5 text-center text-gray-300 mb-4 text-base sm:text-lg lg:text-xl">
          Cosmos Treasury DAO established on Migaloo. We are seeking a lost city
          of gold. We have no respect for the currency of men.
        </p>
        <a
          href="https://app.whitewhale.money/migaloo/swap?from=WHALE&to=OPHIR"
          target="_blank"
          rel="noopener noreferrer"
          className="landing-button font-medium py-2 px-4 hover:bg-yellow-500"
        >
          Buy $OPHIR
        </a>
        
        <div
          onClick={() => (window.location.href = "/analytics")}
          style={{
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "60%",
          }}
        >
          {/* <p
            className="text-yellow-400 text-lg pt-4 font-roboto"
            style={{ textAlign: "center", margin: 0 }}
          >
            Total Treasury Value:{" "}
            {totalTreasuryValue
              ? `$${totalTreasuryValue}`
              : `$${placeholderValue}`}
          </p> */}
        </div>
      </main>
    </div>
  );
};

export default Home;