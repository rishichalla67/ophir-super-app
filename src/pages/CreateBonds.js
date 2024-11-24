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
import Timeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineDot from '@mui/lab/TimelineDot';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';

const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";

const ADDITIONAL_MINUTES_BUFFER = 5; // Easily adjustable buffer time in minutes

const PRESET_DURATIONS = [
  { label: 'Testing', minutes: { start: 5, end: 30, maturity: 180 } },
  { label: '24h Bond', days: 1 },
  { label: '7d Bond', days: 7 },
  { label: '30d Bond', days: 30 },
  { label: '90d Bond', days: 90 },
  { label: '1y Bond', days: 365 },
];

const calculateExpectedAmount = (totalSupply, price, purchasingDenom) => {
  if (!totalSupply || !price || !purchasingDenom) return null;
  
  const decimals = tokenMappings[purchasingDenom]?.decimals || 6;
  const rawAmount = parseFloat(totalSupply) * parseFloat(price);
  const feeAmount = rawAmount * 0.05; // 5% fee
  const netAmount = rawAmount - feeAmount;
  
  return {
    gross: rawAmount.toFixed(decimals),
    fee: feeAmount.toFixed(decimals),
    net: netAmount.toFixed(decimals)
  };
};

const BOND_TYPES = [
  { value: 'cliff', label: 'Cliff - Full claim at maturity' },
  { value: 'vested', label: 'Vested - Custom claim start time' },
];

const BondTimelinePreview = ({ formData }) => {
  const [dates, setDates] = useState([]);

  useEffect(() => {
    // Only update if all required date fields are present
    if (formData.start_time && formData.start_time_hour &&
        formData.end_time && formData.end_time_hour &&
        formData.maturity_date && formData.maturity_date_hour) {
      
      try {
        const newDates = [
          {
            time: new Date(`${formData.start_time}T${formData.start_time_hour}`).getTime(),
            label: 'Purchase Start',
            color: 'grey'
          },
          {
            time: new Date(`${formData.end_time}T${formData.end_time_hour}`).getTime(),
            label: 'Purchase End',
            color: 'grey'
          },
          {
            time: formData.bond_type === 'vested' && formData.claim_start_date && formData.claim_start_hour ? 
              new Date(`${formData.claim_start_date}T${formData.claim_start_hour}`).getTime() :
              new Date(`${formData.end_time}T${formData.end_time_hour}`).getTime(),
            label: 'Claim Start',
            color: 'grey'
          },
          {
            time: new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`).getTime(),
            label: 'Maturity Date',
            color: 'grey'
          }
        ].sort((a, b) => a.time - b.time);

        setDates(newDates);
      } catch (error) {
        console.error('Error updating timeline dates:', error);
      }
    }
  }, [
    formData.start_time,
    formData.start_time_hour,
    formData.end_time,
    formData.end_time_hour,
    formData.maturity_date,
    formData.maturity_date_hour,
    formData.bond_type,
    formData.claim_start_date,
    formData.claim_start_hour
  ]);

  // Don't render timeline if dates aren't valid
  if (dates.length === 0) {
    return (
      <div className="text-gray-400 text-sm">
        Please fill in all required date and time fields to see the timeline.
      </div>
    );
  }

  return (
    <Timeline position="alternate" sx={{ 
      '& .MuiTimelineItem-root:before': {
        flex: 0
      }
    }}>
      {dates.map((date, index) => (
        <TimelineItem key={index}>
          <TimelineOppositeContent color="white" sx={{ flex: 0.5 }}>
            {new Date(date.time).toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short'
            })}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineDot color={date.color} />
            {index < dates.length - 1 && <TimelineConnector />}
          </TimelineSeparator>
          <TimelineContent sx={{ 
            color: 'white',
            flex: 0.5,
            '&.MuiTimelineContent-root': {
              px: 2
            }
          }}>
            {date.label}
            {date.time === Math.min(...dates.map(d => d.time)) && (
              <div className="text-yellow-400 text-sm mt-1">(Start)</div>
            )}
            {date.time === Math.max(...dates.map(d => d.time)) && (
              <div className="text-yellow-400 text-sm mt-1">(End)</div>
            )}
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
};

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
    now.setMinutes(now.getMinutes() + ADDITIONAL_MINUTES_BUFFER);
    
    const startDate = new Date(now);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 1);
    const maturityDate = new Date(endDate);
    maturityDate.setHours(maturityDate.getHours() + 1);

    return {
      start_time: startDate.toLocaleDateString('en-CA'),
      start_time_hour: startDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
      end_time: endDate.toLocaleDateString('en-CA'),
      end_time_hour: endDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
      maturity_date: maturityDate.toLocaleDateString('en-CA'),
      maturity_date_hour: maturityDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
      token_denom: "",
      total_supply: "",
      purchasing_denom: "",
      price: "",
      bond_denom_name: "",
      bond_denom_suffix: 1,
      description: "",
      immediate_claim: true,
      nft_metadata: {
        name: "",
        symbol: "",
        token_uri: ""
      },
      claim_start_date: "",
      claim_start_hour: "",
      claim_end_date: "",
      claim_end_hour: "",
    };
  });
  const [walletBalances, setWalletBalances] = useState({});
  const [fullBondDenomName, setFullBondDenomName] = useState("");
  const [userTimezone, setUserTimezone] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const [customBondName, setCustomBondName] = useState("");
  const [bondType, setBondType] = useState('cliff');

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

  const validateNumericInput = (value) => {
    // Allows positive numbers with optional decimals
    const regex = /^\d*\.?\d*$/;
    return regex.test(value) && value !== '.';
  };

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
    } else if (name === 'total_supply' || name === 'price') {
      // Validate numeric inputs
      if (value === '' || validateNumericInput(value)) {
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
      const signer = await getSigner();
      const client = await SigningCosmWasmClient.connectWithSigner(rpc, signer);

      // Calculate minute offsets from current time
      const now = new Date();
      const startDate = new Date(`${formData.start_time}T${formData.start_time_hour}`);
      const endDate = new Date(`${formData.end_time}T${formData.end_time_hour}`);
      const maturityDate = new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`);

      // Validate dates with detailed error messages
      if (endDate <= startDate) {
        throw new Error("End date must be after start date");
      }
      if (maturityDate <= endDate) {
        throw new Error(`Invalid maturity time: ${maturityDate.toLocaleString()} must be after end time: ${endDate.toLocaleString()}`);
      }

      // Calculate all offsets in minutes (ceiling)
      const startOffset = Math.ceil((startDate - now) / (1000 * 60));
      const endOffset = Math.ceil((endDate - now) / (1000 * 60));
      const maturityOffset = Math.ceil((maturityDate - now) / (1000 * 60));

      let claimStartOffset, claimEndOffset;
      if (formData.immediate_claim) {
        // Set claim start to 1 minute after bond end
        claimStartOffset = endOffset + 1;
        // Set claim end to match maturity
        claimEndOffset = maturityOffset;
      } else if (formData.claim_start_date) {
        const claimStart = new Date(`${formData.claim_start_date}T${formData.claim_start_hour}`);
        claimStartOffset = Math.ceil((claimStart - now) / (1000 * 60));
        // Always use maturity date as claim end
        claimEndOffset = maturityOffset;
      } else {
        // Default behavior
        claimStartOffset = endOffset;
        claimEndOffset = maturityOffset;
      }

      // Single timestamp query with all offsets
      const timestampQuery = {
        get_timestamp_offsets: {
          start_offset: startOffset,
          end_offset: endOffset,
          claim_start_offset: claimStartOffset,
          claim_end_offset: claimEndOffset,
          mature_offset: maturityOffset
        }
      };

      const timestamps = await client.queryContractSmart(
        daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET,
        timestampQuery
      );

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
          purchase_start_time: timestamps.start_time.toString(),
          purchase_end_time: timestamps.end_time.toString(),
          claim_start_time: timestamps.claim_start_time.toString(),
          maturity_date: timestamps.mature_time.toString(),
          bond_type: bondType,
          description: formData.description,
          nft_metadata: {
            name: formData.nft_metadata.name || `${fullBondDenomName} Bond NFT`,
            symbol: formData.nft_metadata.symbol || fullBondDenomName,
          }
        },
      };

      // Log timestamps for debugging
      console.log('Timestamps:', {
        purchase_start: timestamps.start_time,
        purchase_end: timestamps.end_time,
        claim_start: timestamps.claim_start_time,
        claim_end: timestamps.claim_end_time
      });

      // Calculate the fee in uwhale (25 WHALE)
      const whaleFee = "25000000"; // 25 WHALE in uwhale

      // Validate token_denom and total_supply before creating funds array
      if (!formData.token_denom || !formData.total_supply) {
        throw new Error("Token denom and total supply are required");
      }

      // Ensure tokenDecimals is valid
      const tokenDecimals = tokenMappings[formData.token_denom]?.decimals;
      if (typeof tokenDecimals !== 'number') {
        throw new Error("Invalid token decimals configuration");
      }

      // Calculate the total supply in the smallest unit of the token
      const adjustedTotalSupply = BigInt(
        Math.round(parseFloat(formData.total_supply) * Math.pow(10, tokenDecimals))
      ).toString();

      // Prepare the funds array with validation
      const funds = [{
        denom: formData.token_denom,
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
        daoConfig.BONDS_CONTRACT_ADDRESS_TESTNET,
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
        now.setMinutes(now.getMinutes() + ADDITIONAL_MINUTES_BUFFER);
        
        const startDate = new Date(now);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 1);
        const maturityDate = new Date(endDate);
        maturityDate.setHours(maturityDate.getHours() + 1);

        return {
          ...prevState,
          start_time: startDate.toLocaleDateString('en-CA'),
          start_time_hour: startDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
          end_time: endDate.toLocaleDateString('en-CA'),
          end_time_hour: endDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
          maturity_date: maturityDate.toLocaleDateString('en-CA'),
          maturity_date_hour: maturityDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
          token_denom: "",
          total_supply: "",
          purchasing_denom: "",
          price: "",
          bond_denom_name: fullBondDenomName,
          bond_denom_suffix: 1,
          description: "",
          immediate_claim: false,
          flow_schedule: {
            percentage: 100,
            start_date: startDate.toLocaleDateString('en-CA'),
            initial_delay: 0,
            duration: 0,
          },
          nft_metadata: {
            name: "",
            symbol: "",
            token_uri: ""
          },
          claim_start_date: "",
          claim_start_hour: "",
          claim_end_date: "",
          claim_end_hour: "",
        };
      });

      // Redirect to /bonds page
      navigate("/bonds");
    } catch (error) {
      console.error("Error creating bond:", error);
      // Log the full error for debugging
      console.error("Full error:", error);
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
    if (customBondName.trim()) {
      setFullBondDenomName(customBondName);
    } else {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000); // Generate random 4-digit number
      const defaultName = `ob${(
        tokenMappings[formData.token_denom]?.symbol || formData.token_denom
      ).toUpperCase()}${randomSuffix}`;
      setFullBondDenomName(defaultName);
    }
  }, [customBondName, formData.token_denom]);

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
    <div className="flex items-center gap-2 pb-2">
      <span className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <Tooltip title={tooltip} arrow placement="top">
        <InfoIcon className="h-4 w-4 text-gray-400 cursor-help" />
      </Tooltip>
    </div>
  );

  const handlePresetDuration = (preset) => {
    // Get current time in local timezone
    const now = new Date();
    // Add buffer to ensure we're not setting times in the past due to UTC conversion
    now.setMinutes(now.getMinutes() + ADDITIONAL_MINUTES_BUFFER);
    
    if (preset.minutes) {
      // Handle testing preset with minute-based durations
      const startDate = new Date(now);
      startDate.setMinutes(startDate.getMinutes() + preset.minutes.start);
      
      const endDate = new Date(now);
      endDate.setMinutes(endDate.getMinutes() + preset.minutes.end);
      
      const maturityDate = new Date(now);
      maturityDate.setMinutes(maturityDate.getMinutes() + preset.minutes.maturity);
      
      setFormData(prev => ({
        ...prev,
        start_time: startDate.toLocaleDateString('en-CA'), // Format as YYYY-MM-DD in local timezone
        start_time_hour: startDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
        end_time: endDate.toLocaleDateString('en-CA'),
        end_time_hour: endDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
        maturity_date: maturityDate.toLocaleDateString('en-CA'),
        maturity_date_hour: maturityDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
      }));
    } else {
      // Handle day-based presets
      const startDate = new Date(now);
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + preset.days);
      
      const maturityDate = new Date(endDate);
      maturityDate.setHours(maturityDate.getHours() + 1);
      
      setFormData(prev => ({
        ...prev,
        start_time: startDate.toLocaleDateString('en-CA'),
        start_time_hour: startDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
        end_time: endDate.toLocaleDateString('en-CA'),
        end_time_hour: endDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
        maturity_date: maturityDate.toLocaleDateString('en-CA'),
        maturity_date_hour: maturityDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5),
      }));
    }
  };

  useEffect(() => {
    const endDate = new Date(`${formData.end_time}T${formData.end_time_hour}`);
    const maturityDate = new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`);
    
    if (maturityDate <= endDate) {
      const newMaturityDate = new Date(endDate);
      newMaturityDate.setHours(endDate.getHours() + 1);
      
      setFormData(prev => ({
        ...prev,
        maturity_date: newMaturityDate.toLocaleDateString('en-CA'),
        maturity_date_hour: newMaturityDate.toLocaleTimeString('en-US', { hour12: false }).slice(0, 5)
      }));
    }
  }, [formData.end_time, formData.end_time_hour]);

  // Add this effect to update claim times when immediate claim changes
  useEffect(() => {
    if (formData.immediate_claim) {
      // Parse bond end date and time
      const endDate = new Date(`${formData.end_time}T${formData.end_time_hour}`);
      const maturityDate = new Date(`${formData.maturity_date}T${formData.maturity_date_hour}`);
      
      // Set claim start to exactly match bond end time, preserving the date
      const claimStartDate = new Date(endDate);
      
      // Set claim end to match maturity time
      const claimEndDate = new Date(maturityDate);
      
      // Format dates ensuring we use the same date as bond end
      setFormData(prevState => ({
        ...prevState,
        claim_start_date: formData.end_time, // Use exact same date as bond end
        claim_start_hour: formData.end_time_hour, // Use exact same time as bond end
        claim_end_date: formData.maturity_date, // Use exact same date as maturity
        claim_end_hour: formData.maturity_date_hour // Use exact same time as maturity
      }));
    }
  }, [formData.immediate_claim, formData.end_time, formData.end_time_hour, formData.maturity_date, formData.maturity_date_hour]);

  return (
    <div className={`global-bg-new text-white min-h-screen w-full transition-all duration-300 ease-in-out ${
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

        <div className="bond-creation-div p-6 rounded-lg shadow-lg mb-8">
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
                    key={duration.label}
                    onClick={() => handlePresetDuration(duration)}
                    className="px-4 py-2 text-sm rounded-md bond-create-text-container hover:bg-[#3c3d4a] transition-colors duration-200 text-white border border-gray-600 hover:border-gray-500"
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
                  className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
                <input
                  type="time"
                  name="start_time_hour"
                  value={formData.start_time_hour}
                  onChange={handleInputChange}
                  className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
              </div>
            </div>
            <div>
              <LabelWithTooltip
                label="Bond End Date and Time"
                tooltip="The deadline for purchasing the bond. After this time, no new purchases will be accepted"
                required
              />
              <div className="flex space-x-2 mobile-date-time">
                <input
                  type="date"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleInputChange}
                  className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
                <input
                  type="time"
                  name="end_time_hour"
                  value={formData.end_time_hour}
                  onChange={handleInputChange}
                  className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
              </div>
            </div>

            <div className="mb-6">
              <LabelWithTooltip
                label="Bond Type"
                tooltip="Cliff: Tokens can only be claimed at maturity. Vested: Tokens can be claimed starting from a specified date after purchase end."
                required
              />
              <select
                value={bondType}
                onChange={(e) => setBondType(e.target.value)}
                className="bond-create-text-container w-full px-3 py-2 rounded-md bg-transparent border border-gray-600 hover:border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200"
              >
                {BOND_TYPES.map((type) => (
                  <option 
                    key={type.value} 
                    value={type.value}
                    className="bg-[#1a1b23] text-white"
                  >
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {bondType === 'cliff' 
                  ? 'Tokens can only be claimed when the bond reaches maturity.' 
                  : 'Tokens can be claimed starting from a specified date after the purchase end date.'}
              </p>
            </div>

            {bondType === 'vested' && (
              <div className="space-y-6">
                <div>
                  <LabelWithTooltip
                    label="Claim Start Date and Time"
                    tooltip="The time when users can start claiming their tokens. Must be after the bond end date and before maturity."
                    required={bondType === 'vested'}
                  />
                  <div className="flex space-x-2 mobile-date-time">
                    <input
                      type="date"
                      name="claim_start_date"
                      value={formData.claim_start_date}
                      onChange={handleInputChange}
                      className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                    />
                    <input
                      type="time"
                      name="claim_start_hour"
                      value={formData.claim_start_hour}
                      onChange={handleInputChange}
                      className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <LabelWithTooltip
                label="Bond Maturity Date"
                tooltip="Date and time when the bond will mature and all claiming ends. Bond issuers can claim their tokens at any time after this date."
                required
              />
              <div className="flex space-x-2 mobile-date-time">
                <input
                  type="date"
                  name="maturity_date"
                  value={formData.maturity_date}
                  onChange={handleInputChange}
                  className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
                <input
                  type="time"
                  name="maturity_date_hour"
                  value={formData.maturity_date_hour}
                  onChange={handleInputChange}
                  className="bond-create-text-container w-1/2 px-3 py-2 rounded-md mobile-full-width"
                />
              </div>

              {/* Add the timeline preview */}
              <div className="mt-6 pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-yellow-400">Bond Timeline Preview</h3>
                <div className="overflow-x-auto">
                  <BondTimelinePreview formData={formData} />
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-4">
              <div className="flex space-x-4">
                <div className="flex-1 mobile-full-width">
                  <LabelWithTooltip
                    label="List Asset"
                    tooltip="The token you're offering in the bond. This is what buyers will receive when they claim their purchased bonds."
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
                  <label className="block text-sm font-medium pb-2">
                    Token Quantity
                  </label>
                  <input
                    type="text"
                    name="total_supply"
                    value={formData.total_supply}
                    onChange={handleInputChange}
                    className="bond-create-text-container w-full px-3 py-2 mt-1 rounded-md"
                    placeholder="0"
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
              <div className="flex space-x-4 mobile-input-group align-qtty-and-price">
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
                  <label className="block text-sm font-medium pb-2">
                    Purchasing Price
                  </label>
                  <input
                    type="text"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    className="bond-create-text-container w-full px-3 py-2 mt-1 rounded-md"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {formData.total_supply && formData.price && formData.purchasing_denom && (
              <div className="mt-2 p-4 rounded-md bg-gray-800/50 border border-gray-700">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Expected Returns</h4>
                {(() => {
                  const amounts = calculateExpectedAmount(
                    formData.total_supply,
                    formData.price,
                    formData.purchasing_denom
                  );
                  const symbol = tokenMappings[formData.purchasing_denom]?.symbol || formData.purchasing_denom;
                  
                  return (
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-400">
                        Gross Amount: {amounts.gross} {symbol}
                      </p>
                      <p className="text-red-400">
                        Fee (5%): {amounts.fee} {symbol}
                      </p>
                      <p className="text-green-400">
                        Max Return: {amounts.net} {symbol}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            <div>
              <LabelWithTooltip
                label="Bond Denom"
                tooltip="Enter a custom name for your bond (max 127 characters), or leave blank to use the default format (obTOKENXXXX)"
                required
              />
              <div className="flex items-center mobile-input-group">
                <input
                  type="text"
                  value={customBondName}
                  onChange={(e) => {
                    // Limit input to 127 characters
                    if (e.target.value.length <= 127) {
                      setCustomBondName(e.target.value);
                    }
                  }}
                  maxLength={127}
                  className="bond-create-text-container w-full px-3 py-2 rounded-md mobile-full-width"
                  placeholder={`Default: ob${(tokenMappings[formData.token_denom]?.symbol || formData.token_denom).toUpperCase()}XXXX`}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {customBondName ? 
                  `Using custom bond name (${customBondName.length}/127 characters)` : 
                  "Leave blank to use default format with random 4-digit suffix"
                }
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium pb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="bond-create-text-container w-full px-3 py-2 rounded-md min-h-[100px]"
                placeholder="Enter a description for your bond..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Provide details about your bond offering to help users understand its purpose and terms.
              </p>
            </div>
          </div>
        </div>

        <h3 className="text-3xl font-bold mb-4">NFT Metadata</h3>
        <p className="text-gray-400 mb-8">
          Configure the metadata for the NFT that represents this bond.
        </p>

        <div className="nft-metadata-div p-6 rounded-lg shadow-lg mb-8">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium pb-2">
                NFT Name
              </label>
              <input
                type="text"
                name="nft_metadata.name"
                value={formData.nft_metadata.name}
                onChange={handleInputChange}
                className="bond-create-text-container w-full px-3 py-2 rounded-md"
                placeholder={`${fullBondDenomName} Bond NFT`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium pb-2">
                NFT Symbol
              </label>
              <input
                type="text"
                name="nft_metadata.symbol"
                value={formData.nft_metadata.symbol}
                onChange={handleInputChange}
                className="bond-create-text-container w-full px-3 py-2 rounded-md"
                placeholder={fullBondDenomName}
              />
            </div>

            <div>
              <label className="block text-sm font-medium pb-2">
                Token URI (Optional)
              </label>
              <input
                type="text"
                name="nft_metadata.token_uri"
                value={formData.nft_metadata.token_uri}
                onChange={handleInputChange}
                className="bond-create-text-container w-full px-3 py-2 rounded-md"
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
          prompted to approve a transaction.
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
        formData={{
          ...formData,
          bond_type: bondType
        }}
        isLoading={isLoading}
        customBondName={customBondName}
        fullBondDenomName={fullBondDenomName}
        className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-8 shadow-xl border border-gray-700"
      />

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
    </div>
  );
};

export default CreateBonds;