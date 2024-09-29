import React from 'react';
import { Link } from 'react-router-dom';
import WalletConnect from './WalletConnect';
import { useWallet } from '../context/WalletContext';

const Navbar = () => {
    const { setConnectedWalletAddress, setIsLedgerConnected } = useWallet();

    const handleConnectedWalletAddress = (address) => {
        setConnectedWalletAddress(address);
    };
    const handleLedgerConnectionBool = (bool) => {
        setIsLedgerConnected(bool);
    };

    return (
        <nav className="bg-[#424242] fixed top-0 right-0 left-0 h-16 flex items-center justify-between px-4 z-20">
            <Link to="/" className="flex items-center">
                <img src="https://raw.githubusercontent.com/cosmos/chain-registry/master/migaloo/images/ophir.png" alt="Ophir Logo" className="w-8 h-8 mr-2" />
                <span className="text-white text-xl font-bold">Ophir</span>
            </Link>
            <WalletConnect
                handleConnectedWalletAddress={handleConnectedWalletAddress}
                handleLedgerConnectionBool={handleLedgerConnectionBool}
            />
        </nav>
    );
};

export default Navbar;