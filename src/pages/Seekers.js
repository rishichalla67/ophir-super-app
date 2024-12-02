import React, { useState, useEffect } from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { coins } from "@cosmjs/amino";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { LedgerSigner } from "@cosmjs/ledger-amino";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { stringToPath } from "@cosmjs/crypto";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import WalletConnect from "../components/WalletConnect";

import "../App.css";
import walletAddresses from "../auth/security.json";
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';

const USDC_DENOM =
  "ibc/BC5C0BAFD19A5E4133FDA0F3E04AE1FBEE75A4A226554B2CBB021089FF2E1F8A";
const OPHIR_DAO_VAULT_ADDRESS =
  "migaloo14gu2xfk4m3x64nfkv9cvvjgmv2ymwhps7fwemk29x32k2qhdrmdsp9y2wu";
const chainId = "migaloo-1";

const SeekerRound = () => {
  const [usdcAmount, setUsdcAmount] = useState("");
  const [usdcBalance, setUsdcBalance] = useState(0); // Add a state for the balance
  const [vestingData, setVestingData] = useState(null);
  const [isLoading, setIsLoading] = useState(false); // Add this line to manage loading state
  const [isLoadingClaim, setIsLoadingClaim] = useState(false);
  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [twitterHandle, setTwitterHandle] = useState("");
  const [isLedgerConnected, setIsLedgerConnected] = useState(false);
  const [showIframe, setShowIframe] = useState(false);
  const [seekerRoundDetails, setSeekerRoundDetails] = useState(null);

  const { connectedWalletAddress: contextConnectedWalletAddress, isLedgerConnected: contextIsLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();

  useEffect(() => {
    if (contextConnectedWalletAddress) {
      checkBalance(contextConnectedWalletAddress).then((balance) => {
        setUsdcBalance(balance);
      });
      checkVesting(contextConnectedWalletAddress);
    }
  }, [contextConnectedWalletAddress]);

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const fetchSeekerRoundDetails = async () => {
    try {
      const response = await fetch(
        "https://parallax-analytics.onrender.com/ophir/getSeekerRoundDetails"
      );
      const data = await response.json();
      setSeekerRoundDetails(data);
    } catch (error) {
      console.error("Failed to fetch seeker round details:", error);
      showAlert(
        "Failed to fetch seeker round details. Please try again later.",
        "error"
      );
    }
  };

  useEffect(() => {
    fetchSeekerRoundDetails();
  }, []);

  async function checkVesting(address) {
    const baseUrl =
      "https://parallax-analytics.onrender.com/ophir/seeker-vesting?vestingAddress=";
    const response = await fetch(`${baseUrl}${address}`);
    const data = await response.json();
    // Check if the response contains the specific message indicating no vesting details or amountVesting is 0
    if (
      data.message !==
        "Vesting details not found for the given contract address" &&
      data.amountVesting !== 0
    ) {
      setVestingData(data); // Store the vesting data in state if it exists
    } else {
      setVestingData(null); // Reset or ignore the vesting data if not found or amountVesting is 0
    }
  }

  const checkBalance = async (address) => {
    const rpcEndpoint = "https://migaloo-rpc.polkachu.com"; // Replace with the actual RPC endpoint for Migaloo
    try {
      const client = await SigningStargateClient.connect(rpcEndpoint);
      const balances = await client.getAllBalances(address);
      const usdcBalance = balances.find(
        (balance) => balance.denom === USDC_DENOM
      );

      if (usdcBalance) {
        return parseFloat(usdcBalance.amount) / 1000000; // Assuming the amount is in micro units
      } else {
        showAlert("No USDC balance found.", "error");
        return 0;
      }
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      showAlert("Failed to fetch balances. Please try again later.", "error");
      return 0;
    }
  };

  const getSigner = async () => {
    await window.keplr.enable(chainId);
    const offlineSigner = window.keplr.getOfflineSigner(chainId);
    return offlineSigner;
  };

  const sendSeekerFunds = async () => {
    setIsLoading(true);
    const amountNum = parseFloat(usdcAmount);
    if (
      !usdcAmount ||
      isNaN(amountNum) ||
      amountNum < 1000 ||
      amountNum % 500 !== 0
    ) {
      showAlert(
        "Please enter an amount that is a minimum of 1000 and in increments of 500.",
        "error"
      );
      setIsLoading(false);
      return;
    }
    if (amountNum > 100000) {
      showAlert("The amount cannot be greater than 100,000 USDC.", "error");
      setIsLoading(false);
      return;
    }
    if (usdcBalance < amountNum) {
      showAlert("Your USDC balance is less than the amount entered.", "error");
      setIsLoading(false);
      return;
    }

    try {
      if (!window.keplr) {
        showAlert("Keplr wallet is not installed.", "error");
        return;
      }

      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(
        "https://migaloo-rpc.polkachu.com/",
        signer
      );

      const fee = {
        amount: [{ denom: "uwhale", amount: "5000" }],
        gas: "200000",
      };

      const amount = {
        denom: USDC_DENOM,
        amount: String(amountNum * 1000000),
      };

      const msgSend = {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          fromAddress: contextConnectedWalletAddress,
          toAddress: OPHIR_DAO_VAULT_ADDRESS,
          amount: [amount],
        },
      };

      const memo = `Twitter: ${twitterHandle}`;
      
      const txHash = await client.signAndBroadcast(
        contextConnectedWalletAddress,
        [msgSend],
        fee,
        memo
      );

      showAlert(
        "Successfully sent USDC to OPHIR DAO Vault.",
        "success",
        `Successfully sent USDC to OPHIR DAO Vault. Transaction: <a href="https://inbloc.org/migaloo/transactions/${txHash.transactionHash}" target="_blank" rel="noopener noreferrer" style="color: black;">https://inbloc.org/migaloo/transactions/${txHash.transactionHash}</a>`
      );

      checkBalance(contextConnectedWalletAddress).then((balance) => {
        setUsdcBalance(balance);
      });

    } catch (error) {
      console.error("Transaction error:", error);
      showAlert(`Sending funds to OPHIR DAO Vault failed. ${error}`, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const claimSeekerOphir = async () => {
    setIsLoadingClaim(true);

    try {
      const chainId = "migaloo-1"; // Make sure this matches the chain you're interacting with
      let signer;
      let accountAddress;

      // Check if the user is connected through Ledger
      if (isLedgerConnected) {
        // You need to manage a state `isLedgerConnected` when connecting via Ledger
        const transport = await TransportWebUSB.create();
        const ledgerSigner = new LedgerSigner(transport, {
          hdPaths: [stringToPath("m/44'/118'/0'/0/0")],
          prefix: "migaloo",
        });
        signer = ledgerSigner;
        const accounts = await ledgerSigner.getAccounts();
        accountAddress = accounts[0].address;
      } else {
        // Fallback to Keplr's offline signer if not using Ledger
        await window.keplr.enable(chainId);
        const offlineSigner = window.keplr.getOfflineSigner(chainId);
        signer = offlineSigner;
        const accounts = await offlineSigner.getAccounts();
        accountAddress = accounts[0].address;
      }

      // Define the contract execution parameters
      const contractAddress =
        "migaloo10uky7dtyfagu4kuxvsm26cvpglq25qwlaap2nzxutma594h6rx9qxtk9eq"; // The address of the contract
      const executeMsg = {
        claim: {
          recipient: contextConnectedWalletAddress, // The recipient address
          amount: (vestingData.amountVesting * 1000000).toString(), // The amount to claim, converted to string
        },
      };

      const rpcEndpoint = "https://migaloo-rpc.polkachu.com/"; // RPC endpoint
      if (isLedgerConnected) {
        showAlert(
          "Check your hardware wallet to validate and approve the transaction",
          "info"
        );
      }
      const client = await SigningCosmWasmClient.connectWithSigner(
        rpcEndpoint,
        signer,
        {
          prefix: "migaloo",
        }
      );

      const fee = {
        amount: [
          {
            denom: "uwhale",
            amount: "5000",
          },
        ],
        gas: "800000",
      };

      const result = await client.execute(
        accountAddress,
        contractAddress,
        executeMsg,
        fee,
        "Execute Wasm Contract Claim"
      );
      console.log("Transaction Hash:", result.transactionHash);
      showAlert(
        `Successfully executed contract claim. Transaction: https://inbloc.org/migaloo/transactions/${result.transactionHash}`,
        "success"
      );
    } catch (error) {
      console.error("Transaction error:", error);
      if (error.code === -32603) {
        showAlert(
          "Transaction was successful despite the error.",
          "success",
          `Transaction was successful. Transaction: <a href="https://inbloc.org/migaloo/transactions/${error.transactionHash}" target="_blank" rel="noopener noreferrer" style="color: black;">https://inbloc.org/migaloo/transactions/${error.transactionHash}</a>`
        );
      } else {
        showAlert(`Successfully executed contract claim. ${error}`, "error");
      }
    } finally {
      setIsLoadingClaim(false);
    }
  };

  const resetWalletState = () => {
    setUsdcAmount("");
    setUsdcBalance("");
    setTwitterHandle("");
    setIsLedgerConnected(false);
  };

  const disconnectWallet = async () => {
    if (window.leap) {
      await window.leap.disconnect("migaloo-1").then(() => {
        resetWalletState();
      });
    } else if (window.keplr) {
      // Assuming Keplr has a similar disconnect method
      resetWalletState();
    }
  };

  return (
    <div 
      className={`global-bg text-white min-h-dvh w-full flex flex-col items-center justify-content transition-all duration-300 ${isSidebarOpen ? 'md:pl-64' : ''}`}
      style={{ paddingTop: "20dvh" }}
    >
      {/* Snackbar for alerts */}
      {/* <h1
        className={`text-3xl ${
          vestingData ? "mt-14" : ""
        } mb-3 font-bold h1-color`}
      >
        See
      </h1> */}
      <Snackbar
        open={alertInfo.open}
        autoHideDuration={6000}
        onClose={() => setAlertInfo({ ...alertInfo, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        {alertInfo.htmlContent ? (
          <SnackbarContent
            style={{
              color: "black",
              backgroundColor:
                alertInfo.severity === "error" ? "#ffcccc" : "#ccffcc",
            }} // Adjusted colors to be less harsh
            message={
              <span
                dangerouslySetInnerHTML={{ __html: alertInfo.htmlContent }}
              />
            }
          />
        ) : (
          <Alert
            onClose={() => setAlertInfo({ ...alertInfo, open: false })}
            severity={alertInfo.severity}
            sx={{ width: "100%" }}
          >
            {alertInfo.message}
          </Alert>
        )}
      </Snackbar>
      <>
        <div className="mx-auto p-4 rounded-lg">
        {!contextConnectedWalletAddress && (
            <div className="mt-4 text-center">
              <p className="text-lg text-white">
                Connect your wallet to see if you have any claims available...
              </p>
              {/* <WalletConnect onConnect={handleConnectedWalletAddress} /> */}
            </div>
          )}
          {/* <div
            className="mb-3 mt-2 text-xs sm:text-base text-center text-white-600 hover:text-yellow-400 visited:text-purple-600 underline cursor-pointer"
            onClick={() =>
              window.open(
                "https://medium.com/@sebastian18018/introducing-ophir-daos-seeker-round-0f3a1d470d2e",
                "_blank"
              )
            }
          >
            Introduction and details of the seeker round →
          </div> */}
          {/* {seekerRoundDetails && (
            <div className="text-xs mt-2 text-center">
              OPHIR remaining:{" "}
              {seekerRoundDetails?.ophirLeftInSeekersRound.toLocaleString()}
            </div>
          )} */}
          {/* Prompt to connect wallet */}
          
          <div className="text-xs mt-4 text-center">
            {/* <a
              href="https://daodao.zone/dao/migaloo14gu2xfk4m3x64nfkv9cvvjgmv2ymwhps7fwemk29x32k2qhdrmdsp9y2wu/treasury"
              target="_blank"
              rel="noopener noreferrer"
            >
              Destination Address:{" "}
              {`${OPHIR_DAO_VAULT_ADDRESS.substring(
                0,
                10
              )}...${OPHIR_DAO_VAULT_ADDRESS.substring(
                OPHIR_DAO_VAULT_ADDRESS.length - 4
              )}`}
            </a> */}
            {/* <button
              onClick={() =>
                navigator.clipboard.writeText(OPHIR_DAO_VAULT_ADDRESS)
              }
              className="ml-2 bg-transparent text-yellow-400 hover:text-yellow-500 font-bold rounded"
            >
              <img
                src="https://png.pngtree.com/png-vector/20190223/ourlarge/pngtree-vector-copy-icon-png-image_695355.jpg"
                alt="Copy"
                style={{
                  width: "16px",
                  height: "16px",
                  verticalAlign: "middle",
                }}
                className=""
              />
            </button> */}
          </div>
        </div>
      </>
      <div className="max-w-lg mt-4 mx-auto p-1 text-center">
        {vestingData && Number(vestingData.amountVesting) > 1 && (
          <>
            <div className="text-2xl mb-2">Vesting Details</div>
            <div className="border border-gray-200 rounded-lg overflow-hidden ">
              <div className="p-4 border-b border-gray-200">
                <div className="font-bold text-sm text-white">Address:</div>
                <div className="text-white md:hidden">{`${vestingData.address.substring(
                  0,
                  10
                )}...${vestingData.address.substring(
                  vestingData.address.length - 5
                )}`}</div>
                <div className="hidden md:block text-white">{`${vestingData.address}`}</div>
              </div>
              <div className="p-4 border-b border-gray-200">
                <div className="font-bold text-sm text-white">
                  Amount Vesting:
                </div>
                <div className="text-white">
                  {Number(vestingData.amountVesting).toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}{" "}
                  OPHIR
                </div>
              </div>
              <div className="p-4 border-b border-gray-200">
                <div className="font-bold text-sm text-white">
                  Vesting Start:
                </div>
                <div className="text-white">
                  {new Date(vestingData.vestingStart).toLocaleString()}
                </div>
              </div>
              <div className="p-4 border-b border-gray-200">
                <div className="font-bold text-sm text-white">Vesting End:</div>
                <div className="text-white">
                  {new Date(vestingData.vestingEnd).toLocaleString()}
                </div>
              </div>
              {new Date() > new Date(vestingData.vestingEnd) && (
                <div className="p-4">
                  <button
                    className="bg-yellow-400 hover:bg-yellow-600 text-black font-bold py-1 px-2 rounded"
                    onClick={() => claimSeekerOphir()}
                  >
                    {isLoadingClaim ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                      </div>
                    ) : (
                      "Claim OPHIR"
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {contextConnectedWalletAddress &&
        walletAddresses.includes(contextConnectedWalletAddress) &&
        seekerRoundDetails?.transactions && (
          <div className="mt-4 p-4" style={{ maxWidth: "95dvw" }}>
            <div className="text-2xl mb-2">
              Seeker Transaction History{" "}
              <span className="text-sm">
                ({seekerRoundDetails.transactionCount})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-white">
                    <th className="px-4 py-2">Timestamp</th>
                    <th className="px-4 py-2">From</th>
                    <th className="px-4 py-2">To</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2">Memo</th>
                    <th className="px-4 py-2">TxHash</th>{" "}
                    {/* New column for TxHash */}
                  </tr>
                </thead>
                <tbody>
                  {seekerRoundDetails.transactions.map((transaction, index) => (
                    <tr
                      key={index}
                      className="border-b border-gray-200 text-white"
                    >
                      <td className="px-4 py-2">
                        {transaction.timestamp
                          ? new Date(transaction.timestamp).toLocaleString()
                          : "N/A"}
                      </td>
                      <td className="px-4 py-2">
                        ...
                        {transaction.tx.messages[0]?.fromAddress
                          ? transaction.tx.messages[0].fromAddress.slice(-5)
                          : "N/A"}
                      </td>
                      <td className="px-4 py-2">DAO Vault</td>
                      <td className="px-4 py-2">
                        {transaction.tx.messages[0]?.amount[0]?.amount
                          ? transaction.tx.messages[0].amount[0].amount /
                            1000000
                          : "N/A"}
                      </td>
                      <td className="px-4 py-2">
                        {transaction.tx.memo || "N/A"}
                      </td>
                      <td className="px-4 py-2">
                        {transaction.tx?.txHash ? (
                          <a
                            href={`https://inbloc.org/migaloo/transactions/${transaction.tx.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow-400"
                          >
                            ...{transaction.tx.txHash.slice(-4)}
                          </a>
                        ) : (
                          <span>N/A</span>
                        )}
                      </td>{" "}
                      {/* New cell for clickable TxHash */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
};

export default SeekerRound;

// https://inbloc.org/migaloo/transactions/
