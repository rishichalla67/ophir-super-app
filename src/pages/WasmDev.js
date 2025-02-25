import React, { useState, useEffect } from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import WalletConnect from "../components/WalletConnect";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { daoConfig } from "../utils/daoConfig";
import { useWallet } from '../context/WalletContext';
import { useSidebar } from '../context/SidebarContext';

const migalooRPC = "https://migaloo-rpc.polkachu.com/";
const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";
const terraRPC = "https://terra-rpc.polkachu.com/";
const osmosisRPC = "https://osmosis-rpc.polkachu.com/";

const OPHIR_DECIMAL = 1000000;

const WasmDev = () => {
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isSidebarOpen } = useSidebar();
  const [redeemContractQueryResponse, setRedeemContractQueryResponse] =
    useState({});

  const [redeemContractExecutionResponse, setRedeemContractExecutionResponse] =
    useState({});
  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [queryType, setQueryType] = useState("");
  const [executeType, setExecuteType] = useState("");
  const [editableQueryMessage, setEditableQueryMessage] = useState(""); // New state for the editable JSON string
  const [editableExecuteMessage, setEditableExecuteMessage] = useState(""); // New state for the editable JSON string
  const [queryMessage, setQueryMessage] = useState("");
  const [executeMessage, setExecuteMessage] = useState("");
  const [codeId, setCodeId] = useState(null); // State variable to store the codeId
  const [jsonQueryValid, setJsonQueryValid] = useState(true); // Add a state to track JSON validity
  const [jsonExecuteValid, setJsonExecuteValid] = useState(true); // Add a state to track JSON validity
  const [isUploadingContract, setIsUploadingContract] = useState(false);
  const [chainId, setChainId] = useState("narwhal-2");
  // const [isTestnet, setIsTestnet] = useState(true); // Default to Testnet
  const [contractAddress, setContractAddress] = useState(
    daoConfig["CONTRACT_ADDRESS_TESTNET"]
  );
  const [rpc, setRPC] = useState(migalooTestnetRPC);
  const [ophirAmount, setOphirAmount] = useState("");

  const initMsg = {
    dao_address:
      chainId === "narwhal-2"
        ? daoConfig["DAO_ADDRESS_TESTNET"]
        : daoConfig["DAO_ADDRESS"],
    redeemable_denom:
      chainId === "narwhal-2"
        ? daoConfig["OPHIR_DENOM_TESNET"]
        : daoConfig["OPHIR_DENOM"],
    staking_contract:
      chainId === "narwhal-2"
        ? daoConfig["DAO_STAKING_CONTRACT_ADDRESS_TESTNET"]
        : daoConfig["DAO_STAKING_CONTRACT_ADDRESS"],
    vault_contract:
      chainId === "narwhal-2"
        ? daoConfig["DAO_VAULT_ADDRESS_TESTNET"]
        : daoConfig["DAO_VAULT_ADDRESS"],
    mine_contract:
      chainId === "narwhal-2"
        ? daoConfig["DAO_MINE_ADDRESS_TESTNET"]
        : daoConfig["DAO_MINE_ADDRESS"],
    redemption_fee: "0.015",
  };

  const [instantiationMsg, setInstantiationMsg] = useState(
    JSON.stringify(initMsg, null, 2)
  );

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  useEffect(() => {
    // Initialize editableQueryMessage with the stringified version of queryMessage when the component mounts or queryMessage changes
    setEditableQueryMessage(JSON.stringify(queryMessage, null, 2));
  }, [queryMessage]);

  useEffect(() => {
    // Initialize editableExecuteMessage with the stringified version of executeMessage when the component mounts or queryMessage changes
    setEditableExecuteMessage(JSON.stringify(executeMessage, null, 2));
  }, [executeMessage, connectedWalletAddress]);

  useEffect(() => {
    setInstantiationMsg(JSON.stringify(initMsg, null, 2));
  }, [chainId]);

  useEffect(() => {
    let queryMsg;
    switch (queryType) {
      case "GetConfig":
        queryMsg = { get_config: {} };
        setJsonQueryValid(true);
        break;
      case "GetAssetValues":
        queryMsg = { get_asset_values: {} };
        setJsonQueryValid(true);
        break;
      case "GetRedemptions":
        queryMsg = {
          get_redemptions: {
            sender: connectedWalletAddress,
          },
        };
        setJsonQueryValid(true);
        break;
      case "GetRedemptionCalculation":
        queryMsg = {
          get_simulate_calculation: {
            amount: "1000000000000", // 1 million
          },
        };
        setJsonQueryValid(true);
        break;
      case "GetTokenSupply":
        queryMsg = {
          get_token_supply: {},
        };
        setJsonQueryValid(true);
        break;
      case "GetDebugValues":
        queryMsg = {
          get_debug_values: {},
        };
        setJsonQueryValid(true);
        break;
      case "Custom":
        queryMsg = queryMessage;
        break;
      default:
        queryMsg = {};
        break;
    }
    setQueryMessage(queryMsg);
    // }
  }, [queryType]);


  useEffect(() => {
    let executeMsg;
    switch (executeType) {
      case "ExecuteRedemption":
        executeMsg = {
          redeem_assets: {
            sender: connectedWalletAddress,
            amount: (Number(ophirAmount) * OPHIR_DECIMAL).toString(), // 1 OPHIR
          },
        };
        setJsonExecuteValid(true);
        break;
      case "Custom":
        executeMsg = executeMessage;
        break;
      default:
        executeMsg = {};
        break;
    }
    setExecuteMessage(executeMsg);
    // }
  }, [executeType, connectedWalletAddress, ophirAmount]);

  const chainIdToRPC = {
    "migaloo-1": migalooRPC,
    "narwhal-2": migalooTestnetRPC,
    "phoenix-1": terraRPC,
    "osmosis-1": osmosisRPC,
  };

  const handleNetworkChange = (event) => {
    const selectedChainId = event.target.value;
    const selectedRPC = chainIdToRPC[selectedChainId];
    setChainId(selectedChainId);
    setRPC(selectedRPC);
    // Adjust contract address based on the selected chain
    if (selectedChainId === "narwhal-2") {
      setContractAddress(daoConfig["CONTRACT_ADDRESS_TESTNET"]);
    } else {
      // Assuming you have mainnet addresses for migaloo-1 and phoenix-1
      setContractAddress(daoConfig["CONTRACT_ADDRESS"]);
    }
  };

  const getSigner = async () => {
    await window.keplr.enable(chainId);
    const offlineSigner = window.keplr.getOfflineSigner(chainId);
    return offlineSigner;
  };
  const uploadContract = async (file, signer) => {
    const account = await signer.getAccounts();
    if (!connectedWalletAddress || !account) {
      showAlert(
        "Wallet not connected. Please connect your wallet before uploading a contract.",
        "error"
      );
    }

    setIsUploadingContract(true);
    try {
      // Fetch the WASM file from the provided URL
      const wasmCode = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      const signingClient = await SigningCosmWasmClient.connectWithSigner(
        rpc,
        signer
      );

      const fee = calculateFee(chainId);
      // Upload the contract code
      const result = await signingClient.upload(
        account[0].address,
        wasmCode,
        fee,
        "WASM upload"
      );

      console.log(result);

      if (result.code !== undefined && result.code !== 0) {
        throw new Error(`Failed to upload contract: ${result.rawLog}`);
      }

      // Extract the code ID from the result
      const codeId = result.logs[0].events
        .find((event) => event.type === "store_code")
        .attributes.find((attr) => attr.key === "code_id").value;
      setCodeId(codeId);
      showAlert(
        "WASM uploaded successfully! Attempting to instantiate now...",
        "success"
      );
      // instantiateContract(Number(codeId), signer)
      return codeId;
    } catch (error) {
      showAlert(`Error in uploadContract: ${error.message}`, "error");
      throw error;
    } finally {
      setIsUploadingContract(false);
    }
  };
  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      console.log("No file selected.");
      return;
    }
    try {
      const signer = await getSigner(); // Assuming getSigner is a function that retrieves the signer
      console.log(signer);
      const codeId = await uploadContract(file, signer);
      showAlert(`Upload successful, codeId: ${codeId}`, "success");
    } catch (error) {
      console.error("Error uploading contract:", error);
      showAlert(`Error uploading contract: ${error.message}`, "error");
    }
  };
  const calculateFee = (chainId) => {
    let denom = "uwhale"; // Default denom
    let gas = "3250000"; // Default gas

    if (chainId === "phoenix-1") {
      denom = "uluna";
      gas = "2000000"; // Adjusted gas for phoenix-1
    } else if (chainId === "migaloo-1" || chainId === "narwhal-2") {
      // Keep the default values for denom and gas
    } else if (chainId === "osmosis-1") {
      denom = "uosmo";
      gas = "2000000"; // Adjusted gas for osmosis-1
    }

    return {
      amount: [
        {
          denom: denom,
          amount: "5000",
        },
      ],
      gas: gas,
    };
  };
  const instantiateContract = async (codeId, signer) => {
    try {
      const account = await signer.getAccounts();

      // Ensure the signer is available
      if (!signer) {
        showAlert("Signer is not available", "error");
      }

      // Create a signing client using the signer

      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      const admin = undefined; // Set admin address if needed, else undefined
      const label = `Instantiate WASM ${codeId}`; // Unique label for the contract instance
      const initFunds = []; // Initial funds to be sent to the contract, if any

      // Define the fee for the instantiate transaction
      const fee = calculateFee(chainId);

      // Instantiate the contract
      const instantiateResponse = await client.instantiate(
        account[0].address, // Ensure to get the address from the signer
        +codeId,
        JSON.parse(instantiationMsg),
        label,
        fee,
        { admin, amount: initFunds }
      );

      console.log(instantiateResponse);

      if (
        instantiateResponse.code !== undefined &&
        instantiateResponse.code !== 0
      ) {
        throw new Error(
          `Failed to instantiate contract: ${instantiateResponse.rawLog}`
        );
      }

      // Extract the contract address from the instantiate response
      const contractAddress = instantiateResponse.contractAddress;
      setContractAddress(contractAddress);
      showAlert(
        `WASM instantiated successfully! Contract Address: ${contractAddress}`,
        "success"
      );

      return contractAddress;
    } catch (error) {
      showAlert(`Error in instantiateContract: ${error.message}`, "error");
      throw error;
    }
  };

  const handleExecutionContract = async () => {
    try {
      if (!window.keplr) {
        showAlert("Keplr wallet is not installed.", "error");
        return;
      }
      let baseRPC;
      switch (chainId) {
        case "narwhal-2":
          baseRPC = "https://migaloo-testnet-rpc.polkachu.com";
          break;
        case "terra-1":
          baseRPC = "https://terra-rpc.polkachu.com";
          break;
        case "osmosis-1":
          baseRPC = "https://osmosis-rpc.polkachu.com";
          break;
        default:
          baseRPC = "https://migaloo-rpc.polkachu.com";
      }
      let contractAddressPrefix;
      switch (chainId) {
        case "narwhal-2":
          contractAddressPrefix = "migaloo";
          break;
        case "terra-1":
          contractAddressPrefix = "terra";
          break;
        case "osmosis-1":
          contractAddressPrefix = "osmo";
          break;
        default:
          contractAddressPrefix = "migaloo";
      }
      if (!contractAddress.startsWith(contractAddressPrefix)) {
        throw new Error(
          `Contract address does not start with the correct prefix for the chain: ${contractAddressPrefix}`
        );
      }

      const signer = await getSigner();

      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      const funds = [
        {
          denom:
            chainId === "narwhal-2"
              ? daoConfig["OPHIR_DENOM_TESNET"]
              : daoConfig["OPHIR_DENOM"],
          amount: (Number(ophirAmount) * OPHIR_DECIMAL).toString(),
        },
      ];
      const fee = {
        amount: [{ denom: "uwhale", amount: "5000" }],
        gas: "500000",
      };

      const replacer = (key, value) =>
        typeof value === "bigint" ? value.toString() : value;
  
      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        JSON.parse(JSON.stringify(executeMessage, replacer)),
        fee,
        "Execute redeem assets contract message",
        funds
      );
      console.log("Result: ", result)
      setRedeemContractExecutionResponse(result);
      if (result.transactionHash) {
        const baseTxnUrl = "https://ping.pfc.zone/narwhal-testnet/tx";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Message executed successfully! Transaction Hash: ${result.transactionHash}`,
          "success",
          `<a href="${txnUrl}" target="_blank">Message executed successfully! Transaction Hash: ${result.transactionHash}</a>`
        );
      } else {
        showAlert("Message executed successfully!", "success");
      }
    } catch (error) {
      console.error("Error executing message:", error);
      showAlert(`Error executing message. ${error.message}`, "error");
    }
  };

  const handleQueryContract = async () => {
    try {
      const formattedJsonString = JSON.stringify(queryMessage, null, 1); // This adds spaces in the JSON string
      const encodedQuery = Buffer.from(formattedJsonString).toString("base64");
      let baseURL;
      switch (chainId) {
        case "narwhal-2":
          baseURL = "https://migaloo-testnet-api.polkachu.com";
          break;
        case "terra-1":
          baseURL = "https://terra-api.polkachu.com";
          break;
        case "osmosis-1":
          baseURL = "https://osmosis-api.polkachu.com";
          break;
        default:
          baseURL = "https://migaloo-api.polkachu.com";
      }
      let contractAddressPrefix;
      switch (chainId) {
        case "narwhal-2":
          contractAddressPrefix = "migaloo";
          break;
        case "terra-1":
          contractAddressPrefix = "terra";
          break;
        case "osmosis-1":
          contractAddressPrefix = "osmo";
          break;
        default:
          contractAddressPrefix = "migaloo";
      }
      if (!contractAddress.startsWith(contractAddressPrefix)) {
        throw new Error(
          `Contract address does not start with the correct prefix for the chain: ${contractAddressPrefix}`
        );
      }
      const queryUrl = `${baseURL}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${encodedQuery}`;
      const response = await fetch(queryUrl);
      const queryResponse = await response.json();
      setRedeemContractQueryResponse(queryResponse);
      console.log("Query response:", queryResponse);
      showAlert("Query successful!", "success");
    } catch (error) {
      console.error("Error querying contract:", error);
      showAlert(`Error querying contract. ${error.message}`, "error");
    }
  };

  const executeContractMessage = async () => {
    try {
      if (!window.keplr) {
        showAlert("Keplr wallet is not installed.", "error");
        return;
      }
      if (!ophirAmount || ophirAmount <= 0) {
        showAlert("Please enter a valid OPHIR amount.", "error");
        return;
      }

      const message = {
        distribute_assets: {
          sender: connectedWalletAddress,
          amount: (Number(ophirAmount) * OPHIR_DECIMAL).toString(),
        },
      };
      // const message = {
      //     update_config: {
      //         dao_address: DAO_ADDRESS_TESTNET,
      //         redeemable_denom: OPHIR_DENOM_TESNET
      //     }
      // };
      const signer = await getSigner();

      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);
      const funds = [
        {
          denom:
            chainId === "narwhal-2"
              ? daoConfig["OPHIR_DENOM_TESNET"]
              : daoConfig["OPHIR_DENOM"],
          amount: (Number(ophirAmount) * OPHIR_DECIMAL).toString(),
        },
      ];
      // const executeMsg = JSON.stringify(message);
      const fee = {
        amount: [{ denom: "uwhale", amount: "5000" }],
        gas: "200000",
      };

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        message,
        fee,
        "Execute contract message",
        funds
      );

      console.log("Execute contract message result:", result);
      showAlert("Message executed successfully!", "success");
    } catch (error) {
      console.error("Error executing contract message:", error);
      showAlert(`Error executing contract message. ${error.message}`, "error");
    }
  };

  const handleInstantiateContract = async () => {
    try {
      if (!codeId) {
        showAlert("Code ID is not set.", "error");
        return;
      }
      const signer = await getSigner();
      if (!signer) {
        showAlert(
          "Signer is not available. Please connect your wallet.",
          "error"
        );
        return;
      }
      const contractAddress = await instantiateContract(codeId, signer);
      console.log("Instantiate successful, contractAddress:", contractAddress);
      showAlert(
        `Contract instantiated successfully. Address: ${contractAddress}`,
        "success"
      );
    } catch (error) {
      console.error("Error instantiating contract:", error);
      showAlert(
        "Error instantiating contract. Check console for details.",
        "error"
      );
    }
  };

  return (
    <div 
      className={`bg-black text-white mt-14 min-h-screen flex flex-col items-center transition-all duration-300 ${isSidebarOpen ? 'md:pl-64' : ''}`} 
      style={{ paddingTop: "10dvh" }}
    >
      {/* <div className="absolute top-14 right-0 m-4 mr-2 sm:mr-4">
        <WalletConnect />
      </div> */}
      <div className="w-full max-w-4xl flex flex-col items-center space-y-8">
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
              }}
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
        <div className="w-full flex flex-col items-center space-y-6">
          <div className="flex items-center space-x-4">
            <label htmlFor="networkSelect" className="text-white">
              Select Network:
            </label>
            <select
              id="networkSelect"
              value={chainId}
              onChange={handleNetworkChange}
              className="bg-slate-700 text-white border border-yellow-400 rounded p-2"
            >
              <option value="migaloo-1">Migaloo-1</option>
              <option value="narwhal-2">Narwhal-2 (Testnet)</option>
              <option value="phoenix-1">Phoenix-1</option>
              <option value="osmosis-1">Osmosis-1</option>
            </select>
          </div>
          <div className="w-full bg-slate-800 rounded-lg p-6">
            <h3 className="text-xl text-yellow-400 mb-4">WASM Upload</h3>
            <div className="flex justify-center">
              <input
                className="text-center"
                type="file"
                id="wasmFile"
                name="wasmFile"
                accept=".wasm"
                onChange={handleFileChange}
              />
            </div>
          </div>
          {!isUploadingContract && (
            <div className="w-full bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl text-yellow-400 mb-4">
                WASM Instantiation
              </h3>
              <div className="flex flex-col items-center space-y-4">
                <div className="w-full">
                  <label htmlFor="codeId" className="block text-white mb-2">
                    Code ID:
                  </label>
                  <input
                    id="codeId"
                    type="number"
                    className="w-full bg-slate-700 text-white border border-yellow-400 rounded p-2 text-center"
                    placeholder="Enter Code ID"
                    value={codeId}
                    onChange={(e) => setCodeId(Number(e.target.value))}
                  />
                </div>
                <div className="w-full">
                  <label
                    htmlFor="instantiationMsg"
                    className="block text-white mb-2"
                  >
                    Instantiation Message:
                  </label>
                  <textarea
                    id="instantiationMsg"
                    className=" w-full text-sm h-32 bg-slate-700 text-white border border-yellow-400 rounded p-2"
                    placeholder="Enter Instantiation Message in JSON format"
                    value={instantiationMsg}
                    onChange={(e) => setInstantiationMsg(e.target.value)}
                  ></textarea>
                </div>
                <div className="flex justify-center w-full">
                  <button
                    className="py-2 px-6 bg-yellow-400 text-black font-bold rounded-lg hover:bg-yellow-500 transition duration-300"
                    onClick={() =>
                      handleInstantiateContract(codeId, instantiationMsg)
                    }
                  >
                    Instantiate Contract
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="w-full bg-slate-800 rounded-lg p-6">
            <h3 className="text-xl text-yellow-400 mb-4">
              Contract Interactions
            </h3>
            <div className="mb-4">
              <input
                id="contractAddress"
                type="text"
                className="w-full bg-slate-700 text-white border border-yellow-400 rounded p-2 text-center"
                placeholder="Enter Contract Address"
                value={contractAddress}
                onChange={(e) => {
                  const value = e.target.value;
                  setContractAddress(value);
                }}
              />
            </div>
            <div className="mb-4">
              <textarea
                id="jsonQuery"
                value={editableQueryMessage}
                className={`w-full h-32 bg-slate-700 text-white rounded p-2 ${
                  jsonQueryValid
                    ? queryMessage === ""
                      ? "border border-yellow-400"
                      : "border border-green-400"
                    : "border border-red-500"
                }`}
                placeholder="Enter JSON Query"
                onChange={(e) => {
                  const newValue = e.target.value;
                  setEditableQueryMessage(newValue);
                  try {
                    const jsonQuery = JSON.parse(e.target.value);
                    setQueryMessage(jsonQuery);
                    setQueryType("Custom");
                    setJsonQueryValid(true);
                  } catch (error) {
                    setJsonQueryValid(false);
                  }
                }}
              ></textarea>
            </div>
            <div className="mb-4">
              <select
                id="querySelect"
                value={queryType}
                className="w-full bg-slate-700 text-white border border-yellow-400 rounded p-2"
                onChange={(e) => setQueryType(e.target.value)}
              >
                <option value="">Select a Query</option>
                <option value="GetConfig">Get Config</option>
                <option value="GetAssetValues">Get Asset Values</option>
                <option value="GetRedemptions">Get Redemptions</option>
                <option value="GetRedemptionCalculation">
                  Get Redemption Calculation
                </option>
                <option value="GetTokenSupply">Get Token Supply</option>
                <option value="GetDebugValues">Get Debug Values</option>
                <option value="Custom" disabled>
                  Custom Query
                </option>
              </select>
            </div>
            <div className="flex justify-center">
              <button
                className="py-2 px-6 bg-yellow-400 text-black font-bold rounded-lg hover:bg-yellow-500 transition duration-300"
                onClick={handleQueryContract}
              >
                Query Contract
              </button>
            </div>
            {Object.keys(redeemContractQueryResponse).length !== 0 && (
              <div className="w-full bg-slate-800 rounded-lg p-6">
                <h3 className="text-xl text-yellow-400 mb-4">
                  Contract Query Response:
                </h3>
                <pre className="text-white text-sm overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(redeemContractQueryResponse, null, 2)}
                </pre>
              </div>
            )}
            <hr style={{ margin: "20px 0" }} />
            <div className="mb-4 pt-4">
              <div className="flex align-items justify-center pb-2">
                <input
                  id="ophirAmount"
                  type="text"
                  inputMode="decimal" // Allows mobile users to open numeric keyboard
                  pattern="[0-9,]*" // Ensures only numbers and commas can be input
                  className="input-bg mt-2 text-xl text-white p-2 text-center"
                  placeholder="Enter OPHIR amount"
                  value={ophirAmount.toLocaleString()} // Format the value with commas
                  onChange={(e) => {
                    // Allow only numbers and commas to be input
                    const value = e.target.value.replace(/[^\d,]/g, "").replace(/,/g, "");
                    setOphirAmount(value ? Number(value) : "");
                  }}
                />
              </div>
              <textarea
                id="jsonExecute"
                value={editableExecuteMessage}
                className={`w-full h-32 text-sm bg-slate-700 text-white rounded p-2 ${
                  jsonExecuteValid
                    ? executeMessage === ""
                      ? "border border-yellow-400"
                      : "border border-green-400"
                    : "border border-red-500"
                }`}
                placeholder="Enter JSON Message"
                onChange={(e) => {
                  const newValueExecute = e.target.value;
                  setEditableExecuteMessage(newValueExecute);
                  try {
                    const jsonExecute = JSON.parse(e.target.value);
                    setExecuteMessage(jsonExecute);
                    setExecuteType("Custom");
                    setJsonExecuteValid(true);
                  } catch (error) {
                    setJsonExecuteValid(false);
                  }
                }}
              ></textarea>
            </div>
            <div className="mb-4">
              <select
                id="executeSelect"
                value={executeType}
                className="w-full bg-slate-700 text-white border border-yellow-400 rounded p-2"
                onChange={(e) => setExecuteType(e.target.value)}
              >
                <option value="">Select a Execution Message</option>
                <option value="ExecuteRedemption">Redeem Assets</option>
                <option value="Custom" disabled>
                  Custom Execution Message
                </option>
              </select>
            </div>
            <div className="flex justify-center">
              <button
                className="py-2 px-6 bg-yellow-400 text-black font-bold rounded-lg hover:bg-yellow-500 transition duration-300"
                onClick={handleExecutionContract}
              >
                Execute Message
              </button>
            </div>
          </div>
          {/* {Object.keys(redeemContractExecutionResponse).length !== 0 && (
            <div className="w-full bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl text-yellow-400 mb-4">
                Contract Execute Response:
              </h3>
              <pre className="text-white text-sm overflow-auto whitespace-pre-wrap">
                {JSON.stringify(redeemContractExecutionResponse, null, 2)}
              </pre>
            </div>
          )} */}
        </div>
      </div>
    </div>
  );
};

export default WasmDev;
