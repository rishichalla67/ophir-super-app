import React, { useState, useEffect } from 'react';
import { SigningStargateClient } from "@cosmjs/stargate";
import { LedgerSigner } from "@cosmjs/ledger-amino";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { stringToPath } from "@cosmjs/crypto";
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import SnackbarContent from '@mui/material/SnackbarContent';
import { WalletIcon } from '@heroicons/react/24/solid';

const WalletConnect = ({ handleConnectedWalletAddress, handleLedgerConnectionBool }) => {
    const [connectedWalletAddress, setConnectedWalletAddress] = useState('');
    const [manuallyDisconnected, setManuallyDisconnected] = useState(false);
    const [alertInfo, setAlertInfo] = useState({ open: false, message: '', severity: 'info' });
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        const autoConnect = async () => {
            // Don't auto-connect if manually disconnected
            if (manuallyDisconnected) return;
            
            // Try LEAP first
            if (window.leap) {
                try {
                    const chainId = "migaloo-1";
                    
                    // Force suggest chain before enabling
                    if (window.leap.experimentalSuggestChain) {
                        await window.leap.experimentalSuggestChain({
                            chainId: chainId,
                            chainName: "Migaloo",
                            rpc: "https://rpc.migaloo.co",
                            rest: "https://rest.migaloo.co",
                            // ... rest of your chain config ...
                        });
                    }
                    
                    await window.leap.enable(chainId);
                    const offlineSigner = window.leap.getOfflineSigner(chainId);
                    const accounts = await offlineSigner.getAccounts();
                    if (accounts.length > 0) {
                        walletConnected(accounts, false);
                        return;
                    }
                } catch (error) {}
            }

            // Try Keplr if LEAP fails
            if (window.keplr) {
                try {
                    const chainId = "migaloo-1";
                    
                    // Force suggest chain before enabling
                    if (window.keplr.experimentalSuggestChain) {
                        await window.keplr.experimentalSuggestChain({
                            chainId: chainId,
                            chainName: "Migaloo",
                            rpc: "https://migaloo-rpc.polkachu.com/",
                            rest: "https://ww-migaloo-rest.polkachu.com/",
                            // ... rest of your chain config ...
                        });
                    }
                    
                    await window.keplr.enable(chainId);
                    const offlineSigner = window.keplr.getOfflineSigner(chainId);
                    const accounts = await offlineSigner.getAccounts();
                    if (accounts.length > 0) {
                        walletConnected(accounts, false);
                        return;
                    }
                } catch (error) {}
            }
        };

        // Try multiple times with increasing delays
        const attemptConnection = () => {
            const attempts = [0, 500, 1000, 2000];
            attempts.forEach(delay => {
                setTimeout(() => {
                    if (!connectedWalletAddress) {
                        autoConnect();
                    }
                }, delay);
            });
        };

        attemptConnection();

        // Add event listeners for wallet changes
        window.addEventListener("leap_keystorechange", autoConnect);
        window.addEventListener("keplr_keystorechange", autoConnect);

        return () => {
            window.removeEventListener("leap_keystorechange", autoConnect);
            window.removeEventListener("keplr_keystorechange", autoConnect);
        };
    }, [connectedWalletAddress, manuallyDisconnected]);

    const showAlert = (message, severity = 'info', htmlContent = null) => {
        setAlertInfo({ open: true, message, severity, htmlContent });
    };

    const connectWalletLeap = async () => {
        setManuallyDisconnected(false);
        
        if (window.leap) {
            try {
                const chainId = "migaloo-1";

                // Add chain information to Keplr
                if (window.leap.experimentalSuggestChain) {
                    await window.leap.experimentalSuggestChain({
                        // Chain details
                        chainId: chainId,
                        chainName: "Migaloo",
                        rpc: "https://rpc.migaloo.co", // Example RPC endpoint, replace with actual
                        rest: "https://rest.migaloo.co", // Example REST endpoint, replace with actual
                        bip44: {
                            coinType: 118, // Example coinType, replace with actual
                        },
                        bech32Config: {
                            bech32PrefixAccAddr: "migaloo",
                            bech32PrefixAccPub: "migaloopub",
                            bech32PrefixValAddr: "migaloovaloper",
                            bech32PrefixValPub: "migaloovaloperpub",
                            bech32PrefixConsAddr: "migaloovalcons",
                            bech32PrefixConsPub: "migaloovalconspub",
                        },
                        currencies: [{
                            // Example currency, replace with actual
                            coinDenom: "whale",
                            coinMinimalDenom: "uwhale",
                            coinDecimals: 6,
                        }],
                        feeCurrencies: [{
                            // Example fee currency, replace with actual
                            coinDenom: "whale",
                            coinMinimalDenom: "uwhale",
                            coinDecimals: 6,
                        }],
                        stakeCurrency: {
                            // Example stake currency, replace with actual
                            coinDenom: "whale",
                            coinMinimalDenom: "uwhale",
                            coinDecimals: 6,
                        },
                        gasPriceStep: {
                            low: 0.2,
                            average: 0.45,
                            high: 0.75,
                        },
                    });
                }

                await window.leap.enable(chainId);
                const offlineSigner = window.leap.getOfflineSigner(chainId);
                const accounts = await offlineSigner.getAccounts();
                walletConnected(accounts, false);
                return;
            } catch (error) {
                console.error("Error connecting to LEAP:", error);
                showAlert(`Error connecting to LEAP: ${error.message}`, "error");
                setIsModalOpen(false);
            }
        } else {
            showAlert("LEAP extension not found...", "error");
        }
    };

    const connectWalletKeplr = async () => {
        if (window.keplr) {
            try {
                const chainId = "migaloo-1"; // Make sure to use the correct chain ID for Migaloo
    
                // Add chain information to Keplr
                if (window.keplr.experimentalSuggestChain) {
                    await window.keplr.experimentalSuggestChain({
                        // Chain details
                        chainId: chainId,
                        chainName: "Migaloo",
                        rpc: "https://migaloo-rpc.polkachu.com/", // Example RPC endpoint, replace with actual
                        rest: "https://ww-migaloo-rest.polkachu.com/", // Example REST endpoint, replace with actual
                        bip44: {
                            coinType: 118, // Example coinType, replace with actual
                        },
                        bech32Config: {
                            bech32PrefixAccAddr: "migaloo",
                            bech32PrefixAccPub: "migaloopub",
                            bech32PrefixValAddr: "migaloovaloper",
                            bech32PrefixValPub: "migaloovaloperpub",
                            bech32PrefixConsAddr: "migaloovalcons",
                            bech32PrefixConsPub: "migaloovalconspub",
                        },
                        currencies: [{
                            // Example currency, replace with actual
                            coinDenom: "whale",
                            coinMinimalDenom: "uwhale",
                            coinDecimals: 6,
                        }],
                        feeCurrencies: [{
                            // Example fee currency, replace with actual
                            coinDenom: "whale",
                            coinMinimalDenom: "uwhale",
                            coinDecimals: 6,
                        }],
                        stakeCurrency: {
                            // Example stake currency, replace with actual
                            coinDenom: "whale",
                            coinMinimalDenom: "uwhale",
                            coinDecimals: 6,
                        },
                        gasPriceStep: {
                            low: 0.2,
                            average: 0.45,
                            high: 0.75,
                        },
                    });
                }
    
                await window.keplr.enable(chainId);
                const offlineSigner = window.keplr.getOfflineSigner(chainId);
                const accounts = await offlineSigner.getAccounts();
                walletConnected(accounts, false);

                return; // Exit the function after successful connection
            } catch (error) {
                console.error("Error connecting to Keplr:", error);
                showAlert(`Error connecting to Keplr: ${error.message}`, "error");
                setIsModalOpen(false); // Close the modal after successful connection
                // Don't return here, try connecting with Ledger next
            }
        } else {
            showAlert("Keplr extension not found...", "error");
        }
    };

    const connectLedger = async () => {
        try {
            const transport = await TransportWebUSB.create();
            const ledgerSigner = new LedgerSigner(transport, {
                hdPaths: [stringToPath("m/44'/118'/0'/0/0")],
                prefix: "migaloo",
            });
    
    
            // Example: Using ledgerSigner with SigningStargateClients

            // Example: Using ledgerSigner with SigningStargateClient
            const client = await SigningStargateClient.connectWithSigner(
                "https://migaloo-rpc.polkachu.com/", 
                ledgerSigner
            );
    
            // Now you can use `client` to sign and send transactions
            // For example, to get the accounts:
            const accounts = await ledgerSigner.getAccounts();
            walletConnected(accounts, true);
            showAlert("Ledger connected successfully.", "success");
        } catch (error) {
            console.error("Error connecting to Ledger:", error);
            showAlert(`Error connecting to Ledger: ${error.message}`, "error");
        }
        

    };
    const resetWalletState = () => {
        handleConnectedWalletAddress('');
        setConnectedWalletAddress('');
        handleLedgerConnectionBool(false);
    };

    const walletConnected = (accounts, isLedger) => {
        handleConnectedWalletAddress(accounts[0].address);
        setConnectedWalletAddress(accounts[0].address);
        handleLedgerConnectionBool(isLedger); // Indicate that the connection is not through Ledger
        setIsModalOpen(false); // Close the modal after successful connection
        setManuallyDisconnected(false);
    }
    
    const handleWalletClick = () => {
        if (connectedWalletAddress) {
            disconnectWallet();
        }
        setIsModalOpen(true);
    };

    const disconnectWallet = async () => {
        if (window.leap) {
            try {
                await window.leap.disconnect("migaloo-1");
            } catch (error) {
                console.error("Error disconnecting from LEAP:", error);
            }
        } else if (window.keplr) {
            // Keplr doesn't have a disconnect method, so we just reset the state
        }
        setManuallyDisconnected(true);
        resetWalletState();
    };

    const formatAddress = (address) => {
        if (address.length > 12) {
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        }
        return address;
    };

    return (
        <>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-black p-5 rounded-lg shadow-lg border border-yellow-400">
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => connectWalletLeap()} className="flex flex-col items-center justify-center p-2 hover:bg-slate-600 rounded">
                                <img src="https://play-lh.googleusercontent.com/qXNXZaFX6PyEksn3kdaRVuzSXoxiCLObrDhpWjN71IxyncCSS-Ftvdi_Hbr2pucgBSM=w240-h480-rw" alt="Leap Extension" className="w-12 h-12"/>
                                <span>LEAP Extension</span>
                            </button>
                            <button onClick={() => connectWalletKeplr()} className="flex flex-col items-center justify-center p-2 hover:bg-slate-600 rounded">
                                <img src="https://play-lh.googleusercontent.com/SKXXUqR4jXkvPJvKSXhJkQjKUU9wA-hI9lgBTrpxEz5GP8NbaOeSaEp1zzQscv8BTA=w240-h480-rw" alt="Keplr Extension" className="w-12 h-12"/>
                                <span>Keplr Extension</span>
                            </button>
                            <button onClick={() => connectLedger()} className="flex flex-col items-center justify-center p-2 hover:bg-slate-600 rounded">
                                <img src="https://www.ledger.com/wp-content/uploads/2023/08/Ledger-logo-696.png" alt="Ledger" className="w-12 h-12"/>
                                <span>Ledger</span>
                            </button>
                            {/* <button onClick={() => connectLeapMobile()} className="flex flex-col items-center justify-center p-2 hover:bg-slate-600 rounded">
                                <img src="https://play-lh.googleusercontent.com/qXNXZaFX6PyEksn3kdaRVuzSXoxiCLObrDhpWjN71IxyncCSS-Ftvdi_Hbr2pucgBSM=w240-h480-rw" alt="Ledger" className="w-12 h-12"/>
                                <span>Leap Mobile</span>
                            </button> */}
                            {/* Add more buttons for other wallets as needed */}
                        </div>
                        <div className="flex justify-center w-full">
                            <button onClick={() => setIsModalOpen(false)} className="py-2 px-4 mt-4 font-medium rounded flex items-center justify-center gap-2 bg-black text-yellow-400 border-none shadow-lg transition-colors duration-300 md:hover:bg-yellow-400 md:hover:text-black connect-button">Close</button>
                        </div>
                    <div className="flex justify-center w-full mt-4 sm:hidden">
                    <a href="https://leapcosmoswallet.page.link/BfpmrsQLhrqJqtQx6" target="_blank" rel="noopener noreferrer" className="" style={{ textDecoration: 'underline', color: 'yellow', cursor: 'pointer' }}>Open this page in LEAP</a>
                    </div>
                    </div>
                </div>
            )}
            <Snackbar open={alertInfo.open} autoHideDuration={6000} onClose={() => setAlertInfo({ ...alertInfo, open: false })}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
                {alertInfo.htmlContent ? (
                    <SnackbarContent
                        style={{color: 'black', backgroundColor: alertInfo.severity === 'error' ? '#ffcccc' : '#ccffcc' }} // Adjusted colors to be less harsh
                        message={<span dangerouslySetInnerHTML={{ __html: alertInfo.htmlContent }} />}
                    />
                ) : (
                    <Alert onClose={() => setAlertInfo({ ...alertInfo, open: false })} severity={alertInfo.severity} sx={{ width: '100%' }}>
                        {alertInfo.message}
                    </Alert>
                )}
            </Snackbar>
            {connectedWalletAddress ? (
                <div 
                    onClick={handleWalletClick}
                    className="py-2 px-4 m-2 font-medium rounded flex items-center justify-center gap-2 bg-black text-yellow-400 border border-yellow-400 shadow-lg transition-colors duration-300 md:hover:bg-yellow-400 md:hover:text-black cursor-pointer"
                    style={{
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <WalletIcon className="w-4 h-4 mr-2" />
                    {formatAddress(connectedWalletAddress)}
                </div>
            ) : (
                <div>
                    <button 
                        className="py-2 px-4 m-2 font-medium rounded flex items-center justify-center gap-2 connect-button"
                        style={{
                            color: 'white',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        }}
                        onClick={() => setIsModalOpen(true)}
                    >
                        Connect Wallet
                    </button>
                </div>
            )}
        </>
    );
};

export default WalletConnect;