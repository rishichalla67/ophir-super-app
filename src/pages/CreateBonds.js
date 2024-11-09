import React, { useState, useEffect } from "react";
// import WalletConnect from "./walletConnect";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { daoConfig } from "../utils/daoConfig";
import BigInt from "big-integer";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar"
import SnackbarContent from "@mui/material/SnackbarContent";
import { Link, useNavigate } from "react-router-dom";
import { tokenMappings } from "../utils/tokenMappings";
import TokenDropdown from "../components/TokenDropdown"; 
import { SigningStargateClient } from "@cosmjs/stargate";
import ConfirmationModal from "../components/ConfirmationModal";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import "../App.css";
import { useWallet } from '../context/WalletContext'; 
import { useSidebar } from '../context/SidebarContext';
import Tooltip from '@mui/material/Tooltip';
import InfoIcon from '@mui/icons-material/Info';

const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";

const ADDITIONAL_MINUTES_BUFFER = 5; // Easily adjustable buffer time in minutes

const PRESET_DURATIONS = [
  { label: '24h Bond', days: 1 },
  { label: '7d Bond', days: 7 },
  { label: '30d Bond', days: 30 },
  { label: '90d Bond', days: 90 },
  { label: '1y Bond', days: 365 },
];

const CreateBonds = () => {
  const { isSidebarOpen } = useSidebar();
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const [isTestnet, setIsTestnet] = useState(true);
  const [rpc, setRPC] = useState(migalooTestnetRPC);
  const [alertInfo, setAlertInfo] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 60); // Changed from 30 to 60 minutes
    const startTime = now.toTimeString().slice(0, 5); // Format as HH:MM
    const startDate = now.toISOString().split("T")[0]; // Format as YYYY-MM-DD

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 1); // Add one day
    const endTime = endDate.toTimeString().slice(0, 5);
    const endDateString = endDate.toISOString().split("T")[0];

    const maturityDate = new Date(endDate);
    maturityDate.setHours(maturityDate.getHours() + 1); // Add 1 hour for maturity only
    const maturityTime = maturityDate.toTimeString().slice(0, 5);

    return {
      start_time: startDate,
      start_time_hour: startTime,
      end_time: endDateString,
      end_time_hour: endTime,
      maturity_date: endDateString,
      maturity_date_hour: maturityTime,
      token_denom: "",
      total_supply: "",
      purchasing_denom: "",
      price: "",
      bond_denom_name: "",
      bond_denom_suffix: 1,
      description: "",
      immediate_claim: false,
      nft_metadata: {
        name: "",
        symbol: "",
        token_uri: ""
      }
    };
  });
  const [walletBalances, setWalletBalances] = useState({});
  const [fullBondDenomName, setFullBondDenomName] = useState("");
  const [userTimezone, setUserTimezone] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const allowedDenoms = [
    "factory/migaloo17c5ped2d24ewx9964ul6z2jlhzqtz5gvvg80z6x9dpe086v9026qfznq2e/daoophir",
    "uwhale",
  ];

  const filteredTokenMappings = Object.entries(tokenMappings).reduce(
    (acc, [denom, value]) => {
      if (allowedDenoms.includes(denom)) {
        acc[denom] = value;
      }
      return acc;
    },
    {}
  );

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('nft_metadata.')) {
      // Handle nested nft_metadata fields
      const field = name.split('.')[1];
      setFormData(prevState => ({
        ...prevState,
        nft_metadata: {
          ...prevState.nft_metadata,
          [field]: value
        }
      }));
    } else if (type === "number") {
      // Allow decimal inputs
      const regex = /^\d*\.?\d*$/;
      if (regex.test(value) || value === '') {
        setFormData((prevState) => ({
          ...prevState,
          [name]: value,
        }));
      }
    } else {
      setFormData((prevState) => ({
        ...prevState,
        [name]: type === "checkbox" ? checked : value,
      }));
    }
  };

  const handleFlowScheduleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      flow_schedule: {
        ...prevState.flow_schedule,
        [name]: value,
      },
    }));
  };

  const showAlert = (message, severity = "info", htmlContent = null) => {
    setAlertInfo({ open: true, message, severity, htmlContent });
  };

  const getSigner = async () => {
    if (window.keplr?.experimentalSuggestChain) {
      await window.keplr?.experimentalSuggestChain({
        chainId: "narwhal-2",
        chainName: "Migaloo Testnet",
        rpc: rpc,
        rest: "https://migaloo-testnet-api.polkachu.com",
        bip44: { coinType: 118 },
        bech32Config: {
          bech32PrefixAccAddr: "migaloo",
          bech32PrefixAccPub: "migaloopub",
          bech32PrefixValAddr: "migaloovaloper",
          bech32PrefixValPub: "migaloovaloperpub",
          bech32PrefixConsAddr: "migaloovalcons",
          bech32PrefixConsPub: "migaloovalconspub",
        },
        currencies: [
          { coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 },
        ],
        feeCurrencies: [
          { coinDenom: "whale", coinMinimalDenom: "uwhale", coinDecimals: 6 },
        ],
        stakeCurrency: {
          coinDenom: "whale",
          coinMinimalDenom: "uwhale",
          coinDecimals: 6,
        },
        gasPriceStep: { low: 0.2, average: 0.45, high: 0.75 },
      });
    }

    await window.keplr?.enable("narwhal-2");
    const offlineSigner = window.keplr?.getOfflineSigner("narwhal-2");
    return offlineSigner;
  };

  const executeCreateBond = async () => {
    setIsLoading(true);
    try {
      const {
        start_time,
        start_time_hour,
        end_time,
        end_time_hour,
        maturity_date,
        maturity_date_hour,
        token_denom,
        total_supply,
        purchasing_denom,
        price,
        bond_denom_name,
        bond_denom_suffix,
        immediate_claim,
        nft_metadata
      } = formData;

      // Ensure bond_denom_name is prefixed with "o"
      const fullBondDenomName = `ob${(
        tokenMappings[formData.token_denom]?.symbol || formData.token_denom
      ).toUpperCase()}${bond_denom_suffix.toString()}`;

      const contractAddress = daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET;

      // Convert dates to UTC and add 4 hours plus buffer minutes
      const convertToUTC = (date, time, addExtraHour = false) => {
        const localDate = new Date(`${date}T${time}`);
        const utcDate = new Date(
          localDate.getTime() - localDate.getTimezoneOffset() * 60000
        );
        // Add 4 hours plus buffer minutes
        utcDate.setHours(utcDate.getHours() + 4);
        utcDate.setMinutes(utcDate.getMinutes() + ADDITIONAL_MINUTES_BUFFER);
        // Add extra hour if needed
        if (addExtraHour) {
          utcDate.setHours(utcDate.getHours() + 1);
        }
        return utcDate;
      };

      const message = {
        issue_bond: {
          bond_denom_name: fullBondDenomName,
          expect_to_receive: {
            denom: formData.purchasing_denom,
            amount: String(
              Math.round(
                parseFloat(formData.total_supply) * 
                parseFloat(formData.price) * 
                10 ** (tokenMappings[formData.purchasing_denom]?.decimals || 6)
              )
            )
          },
          purchase_start_time: String(Math.floor(
            convertToUTC(start_time, start_time_hour).getTime() * 1_000_000
          )),
          purchase_end_time: String(Math.floor(
            convertToUTC(end_time, end_time_hour).getTime() * 1_000_000
          )),
          claim_start_time: String(Math.floor(
            convertToUTC(end_time, end_time_hour, true).getTime() * 1_000_000 // Add extra hour
          )),
          claim_end_time: String(Math.floor(
            convertToUTC(maturity_date, maturity_date_hour, true).getTime() * 1_000_000 // Add extra hour
          )),
          immediate_claim,
          description: formData.description,
          nft_metadata: {
            name: nft_metadata.name || `${fullBondDenomName} Bond NFT`,
            symbol: nft_metadata.symbol || fullBondDenomName,
          }
        },
      };

      const signer = await getSigner();

      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      // Calculate the fee in uwhale (25 WHALE)
      const whaleFee = "25000000"; // 25 WHALE in uwhale

      // Validate token_denom and total_supply before creating funds array
      if (!token_denom || !total_supply) {
        throw new Error("Token denom and total supply are required");
      }

      // Ensure tokenDecimals is valid
      const tokenDecimals = tokenMappings[token_denom]?.decimals;
      if (typeof tokenDecimals !== 'number') {
        throw new Error("Invalid token decimals configuration");
      }

      // Calculate the total supply in the smallest unit of the token
      const adjustedTotalSupply = BigInt(
        Math.round(parseFloat(total_supply) * Math.pow(10, tokenDecimals))
      ).toString();

      // Prepare the funds array with validation
      const funds = [{
        denom: token_denom,
        amount: adjustedTotalSupply
      }];

      const fee = {
        amount: [{ denom: "uwhale", amount: "50000" }],
        gas: "500000",
      };

      // Validate funds array before executing
      if (!funds || !funds.length || !funds[0].amount) {
        throw new Error("Invalid funds configuration");
      }

      const result = await client.execute(
        connectedWalletAddress,
        contractAddress,
        message,
        fee,
        `Create Bond: ${fullBondDenomName}`,
        funds
      );

      console.log(result);
      if (result.transactionHash) {
        const baseTxnUrl = isTestnet
          ? "https://ping.pfc.zone/narwhal-testnet/tx"
          : "https://inbloc.org/migaloo/transactions";
        const txnUrl = `${baseTxnUrl}/${result.transactionHash}`;
        showAlert(
          `Bond created successfully! Transaction Hash: ${result.transactionHash}`,
          "success",
          `<a href="${txnUrl}" target="_blank">View Transaction</a>`
        );
      } else {
        showAlert("Bond created successfully!", "success");
      }

      // Close the modal after successful execution
      setIsModalOpen(false);

      // Reset form
      setFormData((prevState) => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 60); // Changed from 30 to 60 minutes
        const startTime = now.toTimeString().slice(0, 5);
        const startDate = now.toISOString().split("T")[0];

        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 1);
        const endTime = endDate.toTimeString().slice(0, 5);
        const endDateString = endDate.toISOString().split("T")[0];

        const maturityDate = new Date(endDate);
        maturityDate.setHours(maturityDate.getHours() + 1); // Add 1 hour for maturity only
        const maturityTime = maturityDate.toTimeString().slice(0, 5);

        return {
          ...prevState,
          start_time: startDate,
          start_time_hour: startTime,
          end_time: endDateString,
          end_time_hour: endTime,
          maturity_date: endDateString,
          maturity_date_hour: maturityTime,
          token_denom: "",
          total_supply: "",
          purchasing_denom: "",
          price: "",
          bond_denom_name: "",
          bond_denom_suffix: 1,
          description: "",
          immediate_claim: false,
          flow_schedule: {
            percentage: 100,
            start_date: startDate,
            initial_delay: 0,
            duration: 0,
          },
          nft_metadata: {
            name: "",
            symbol: "",
            token_uri: ""
          }
        };
      });

      // Redirect to /bonds page
      navigate("/bonds");
    } catch (error) {
      console.error("Error creating bond:", error);
      showAlert(
        `Error creating bond: ${error.message || "Unknown error occurred"}`, 
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (connectedWalletAddress) {
      checkBalances();
    }
  }, [connectedWalletAddress, isTestnet]);

  const checkBalances = async () => {
    try {
      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(rpc, signer);
      const balances = await client.getAllBalances(connectedWalletAddress);

      const formattedBalances = balances.reduce((acc, balance) => {
        const tokenInfo = tokenMappings[balance.denom] || {
          symbol: balance.denom,
          decimals: 6,
        };
        const amount =
          parseFloat(balance.amount) / Math.pow(10, tokenInfo.decimals);
        acc[balance.denom] = amount;
        return acc;
      }, {});

      setWalletBalances(formattedBalances);
    } catch (error) {
      console.error("Error checking balances:", error);
      showAlert(`Error checking balances. ${error.message}`, "error");
    }
  };

  useEffect(() => {
    const name = `ob${(
      tokenMappings[formData.token_denom]?.symbol || formData.token_denom
    ).toUpperCase()}`;
    const suffix = formData.bond_denom_suffix.toString();
    setFullBondDenomName(`${name}${suffix}`);
  }, [formData.bond_denom_name, formData.bond_denom_suffix]);

  useEffect(() => {
    // Get the user's timezone abbreviation and UTC offset
    const getTimezoneInfo = () => {
      const now = new Date();
      const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Get abbreviation
      const abbreviation = now
        .toLocaleTimeString("en-us", { timeZoneName: "short" })
        .split(" ")
        .pop();

      // Get UTC offset in hours
      const offsetInMinutes = now.getTimezoneOffset();
      const offsetHours = -offsetInMinutes / 60;
      const sign = offsetHours >= 0 ? "+" : "-";
      const absoluteOffset = Math.abs(offsetHours);
      const formattedOffset = `UTC${sign}${absoluteOffset}`;

      return `${abbreviation} (${formattedOffset})`;
    };

    const timezoneInfo = getTimezoneInfo();
    setUserTimezone(timezoneInfo);
  }, []);

  const handleSubmit = () => {
    setIsModalOpen(true);
  };

  const handleConfirm = () => {
    executeCreateBond();
  };

  const handleGoBack = () => {
    navigate("/bonds");
  };

  const isFormValid = () => {
    const {
      start_time,
      start_time_hour,
      end_time,
      end_time_hour,
      maturity_date,
      maturity_date_hour,
      token_denom,
      total_supply,
      purchasing_denom,
      price,
      bond_denom_suffix,
    } = formData;

    return (
      start_time &&
      start_time_hour &&
      end_time &&
      end_time_hour &&
      maturity_date &&
      maturity_date_hour &&
      token_denom &&
      total_supply &&
      purchasing_denom &&
      price &&
      bond_denom_suffix &&
      // Validate that numeric fields are greater than 0
      parseFloat(total_supply) > 0 &&
      parseFloat(price) > 0 &&
      parseInt(bond_denom_suffix) > 0
    );
  };

  const LabelWithTooltip = ({ label, tooltip, required }) => (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <Tooltip title={tooltip} arrow placement="top">
        <InfoIcon className="h-4 w-4 text-gray-400 cursor-help" />
      </Tooltip>
    </div>
  );

  const handlePresetDuration = (days) => {
    const now = new Date();
    
    // Start time: 1 hour from now
    const startDate = new Date(now);
    startDate.setHours(startDate.getHours() + 1);
    
    // End time: Start time + selected days
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);
    
    // Maturity time: End time + 1 hour
    const maturityDate = new Date(endDate);
    maturityDate.setHours(maturityDate.getHours() + 1);
    
    setFormData(prev => ({
      ...prev,
      start_time: startDate.toISOString().split('T')[0],
      start_time_hour: startDate.toTimeString().slice(0, 5),
      end_time: endDate.toISOString().split('T')[0],
      end_time_hour: endDate.toTimeString().slice(0, 5),
      maturity_date: maturityDate.toISOString().split('T')[0],
      maturity_date_hour: maturityDate.toTimeString().slice(0, 5),
    }));
  };

  return (
    <div className={`global-bg text-white min-h-screen w-full transition-all duration-300 ease-in-out ${
      isSidebarOpen ? 'md:pl-64' : ''
    }`}>
      <div className="pt-32 md:pt-24 w-[92%] md:w-[95%] md:max-w-10xl mx-auto">
        <button
          onClick={handleGoBack}
          className="ml-4 mb-4 flex items-center text-gray-300 hover:text-white transition duration-300"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Bonds
        </button>

        <div className="flex justify-between items-center mb-8">
          {isTestnet ? (
            <h1 className="text-4xl font-bold mb-4">Create a Bond (Testnet)</h1>
          ) : (
            <h1 className="text-4xl font-bold mb-4">Create a Bond</h1>
          )}
        </div>
        {/* <p className="text-gray-400 mb-2">
          A 25 whale fee is charged to create an obTOKEN denom.
        </p> */}

        <div className="bg-[#23242f] p-6 rounded-lg shadow-lg mb-8">
          <div className="space-y-6">
            {/* <p className="text-gray-400 mb-8">
              Your current timezone: {userTimezone}. All times will be converted
              to UTC for submission.
            </p> */}
            <div className="mb-6">
              <div className="flex justify-end">
                <LabelWithTooltip
                  label="Preset Durations"
                  tooltip="Quick options to set standard bond durations"
                />
              </div>
              <div className="flex justify-end flex-wrap gap-2">
                {PRESET_DURATIONS.map((duration) => (
                  <button
                    key={duration.days}
                    onClick={() => handlePresetDuration(duration.days)}
                    className="px-4 py-2 text-sm rounded-md bg-[#2c2d3a] hover:bg-[#3c3d4a] transition-colors duration-200 text-white border border-gray-600 hover:border-gray-500"
                  >
                    {duration.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <LabelWithTooltip
                label="Bond Start Date and Time"
                tooltip="The time range when users can purchase the bond. This defines when your bond sale begins."
                required
              />
              <div className="flex space-x-2 mobile-date-time">
                <input
                  type="date"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
                <input
                  type="time"
                  name="start_time_hour"
                  value={formData.start_time_hour}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
              </div>
            </div>

            <div>
              <LabelWithTooltip
                label="Bond End Date and Time"
                tooltip="The deadline for purchasing the bond. After this time, no new purchases will be accepted."
                required
              />
              <div className="flex space-x-2 mobile-date-time">
                <input
                  type="date"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
                <input
                  type="time"
                  name="end_time_hour"
                  value={formData.end_time_hour}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
              </div>
            </div>

            <div>
              <LabelWithTooltip
                label="Bond Maturity Date"
                tooltip="The date and time when users can claim their tokens from the bond. This must be after the bond end date."
                required
              />
              <div className="flex space-x-2 mobile-date-time">
                <input
                  type="date"
                  name="maturity_date"
                  value={formData.maturity_date}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
                <input
                  type="time"
                  name="maturity_date_hour"
                  value={formData.maturity_date_hour}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
              </div>
            </div>

            <div className="flex flex-col space-y-4">
              <div className="flex space-x-4 mobile-input-group">
                <div className="flex-1 mobile-full-width">
                  <LabelWithTooltip
                    label="List Asset"
                    tooltip="The token you're offering in the bond. This is what buyers will receive when the bond matures."
                    required
                  />
                  <TokenDropdown
                    name="token_denom"
                    value={formData.token_denom}
                    onChange={handleInputChange}
                    allowedDenoms={allowedDenoms}
                  />
                </div>
                <div className="flex-1 mobile-full-width">
                  <label className="block text-sm font-medium mb-1">
                    Token Quantity
                  </label>
                  <input
                    type="number"
                    name="total_supply"
                    value={formData.total_supply}
                    onChange={handleInputChange}
                    className="bg-[#2c2d3a] w-full px-3 py-2 rounded-md"
                    placeholder="0"
                    step="any"
                  />
                  {formData.token_denom &&
                    walletBalances[formData.token_denom] && (
                      <p className="text-xs text-gray-400 mt-1">
                        Available:{" "}
                        {walletBalances[formData.token_denom].toLocaleString(
                          undefined,
                          { minimumFractionDigits: 6, maximumFractionDigits: 6 }
                        )}{" "}
                        {tokenMappings[formData.token_denom]?.symbol ||
                          formData.token_denom}
                      </p>
                    )}
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-4">
              <div className="flex space-x-4 mobile-input-group">
                <div className="flex-1 mobile-full-width">
                  <LabelWithTooltip
                    label="Sale Asset"
                    tooltip="The token that users will pay with to purchase the bond."
                    required
                  />
                  <TokenDropdown
                    name="purchasing_denom"
                    value={formData.purchasing_denom}
                    onChange={handleInputChange}
                    allowedDenoms={allowedDenoms}
                  />
                </div>
                <div className="flex-1 mobile-full-width">
                  <label className="block text-sm font-medium mb-1">
                    Purchasing Price
                  </label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    className="bg-[#2c2d3a] w-full px-3 py-2 rounded-md"
                    placeholder="0"
                    step="any"
                  />
                </div>
              </div>
            </div>

            <div>
              <LabelWithTooltip
                label="Bond Denom"
                tooltip="A unique identifier for your bond. The prefix 'ob' stands for 'Ophir Bond' followed by your token symbol and a number suffix to ensure uniqueness."
                required
              />
              <div className="flex items-center mobile-input-group">
                <input
                  type="text"
                  name="bond_name"
                  value={`ob${(tokenMappings[formData.token_denom]?.symbol || formData.token_denom).toUpperCase()}`}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/2 px-3 py-2 rounded-l-md mobile-full-width"
                  disabled={true}
                />
                <input
                  type="number"
                  name="bond_denom_suffix"
                  value={formData.bond_denom_suffix}
                  onChange={handleInputChange}
                  className="bg-[#2c2d3a] w-1/4 px-3 py-2 rounded-r-md mobile-full-width"
                  min="1"
                  max="99"
                  placeholder="01"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Use a number suffix (01-99) to ensure a unique name for your
                bond denom.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="bg-[#2c2d3a] w-full px-3 py-2 rounded-md min-h-[100px]"
                placeholder="Enter a description for your bond..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide details about your bond offering to help users understand its purpose and terms.
              </p>
            </div>
          </div>
        </div>

        <h3 className="text-3xl font-bold mb-4">Immediate Claim</h3>
        <p className="text-gray-400 mb-8">
          
        </p>

        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.immediate_claim}
              onChange={(e) =>
                setFormData({ ...formData, immediate_claim: e.target.checked })
              }
              className="mr-2"
            />
            <span>
              Check box for all tokens to be available to claim immediately
              after the bond activates.
            </span>
          </label>
        </div>

        <h3 className="text-3xl font-bold mb-4">NFT Metadata</h3>
        <p className="text-gray-400 mb-8">
          Configure the metadata for the NFT that represents this bond.
        </p>

        <div className="bg-[#23242f] p-6 rounded-lg shadow-lg mb-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                NFT Name
              </label>
              <input
                type="text"
                name="nft_metadata.name"
                value={formData.nft_metadata.name}
                onChange={handleInputChange}
                className="bg-[#2c2d3a] w-full px-3 py-2 rounded-md"
                placeholder={`${fullBondDenomName} Bond NFT`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                NFT Symbol
              </label>
              <input
                type="text"
                name="nft_metadata.symbol"
                value={formData.nft_metadata.symbol}
                onChange={handleInputChange}
                className="bg-[#2c2d3a] w-full px-3 py-2 rounded-md"
                placeholder={fullBondDenomName}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Token URI (Optional)
              </label>
              <input
                type="text"
                name="nft_metadata.token_uri"
                value={formData.nft_metadata.token_uri}
                onChange={handleInputChange}
                className="bg-[#2c2d3a] w-full px-3 py-2 rounded-md"
                placeholder="https://example.com/metadata/1"
              />
              <p className="text-xs text-gray-500 mt-1">
                External URI for additional NFT metadata (optional)
              </p>
            </div>
          </div>
        </div>

        <h3 className="text-2xl font-bold mb-4">Submit Bond</h3>
        <p className="text-gray-400 mb-8">
          Happy with the Bond? Click Submit to make it public. You will be
          prompted to approve a transaction. Please note, there is a 25 whale
          fee charged to create the denom for{" "}
          {fullBondDenomName !== "ob01" ? fullBondDenomName : "the obTOKEN"}.
        </p>

        <button
          onClick={handleSubmit}
          className={`px-6 py-2 rounded-md transition duration-300 mb-5 ${
            isFormValid()
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-600 cursor-not-allowed text-gray-300'
          }`}
          disabled={isLoading || !isFormValid()}
        >
          {isLoading ? "Submitting..." : "Submit"}
        </button>

        {!isFormValid() && (
          <p className="text-red-400 mt-2 text-sm mb-3">
            Please fill in all required fields before submitting.
          </p>
        )}
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirm}
        formData={formData}
        isLoading={isLoading}
        className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-8 shadow-xl border border-gray-700"
      />

      <Snackbar
        open={alertInfo.open}
        autoHideDuration={6000}
        onClose={() => setAlertInfo({ ...alertInfo, open: false })}
      >
        <Alert 
          onClose={() => setAlertInfo({ ...alertInfo, open: false })} 
          severity={alertInfo.severity}
        >
          {alertInfo.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default CreateBonds;