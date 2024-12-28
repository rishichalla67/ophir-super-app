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
import { useCrypto } from '../context/CryptoContext';
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { useNetwork } from '../context/NetworkContext';
import { useIssuer } from '../context/IssuerContext';

const migalooRPC = "https://migaloo-rpc.polkachu.com";
const migalooTestnetRPC = "https://migaloo-testnet-rpc.polkachu.com:443";
const ADDITIONAL_MINUTES_BUFFER = 5;
const BOND_PURCHASE_FEE_PERCENTAGE = 3; // 5% fee, easily adjustable

// Add new constant for markup range
const MARKUP_RANGE = {
  min: -100, // -100% (discount)
  max: 100,  // +100% (premium)
  step: 1
};

const PRESET_DURATIONS = [
  { label: 'Quick Bond', minutes: { start: 5, end: 30, maturity: 180 } },
  { label: '24h Bond', minutes: { start: 5, end: 1440, maturity: 180 } },
  { label: '7d Bond', minutes: { start: 5, end: 10080, maturity: 7*24 } },
  { label: '30d Bond', minutes: { start: 5, end: 43200, maturity: 30*24 } },
  { label: '90d Bond', minutes: { start: 5, end: 129600, maturity: 90*24 } },
  { label: '1y Bond', minutes: { start: 5, end: 525600, maturity: 365*24 } },
];

const calculateExpectedAmount = (totalSupply, price, purchasingDenom) => {
  if (!totalSupply || !price || !purchasingDenom) return null;
  
  const decimals = tokenMappings[purchasingDenom]?.decimals || 6;
  const rawAmount = parseFloat(totalSupply) * parseFloat(price);
  const feeAmount = rawAmount * (BOND_PURCHASE_FEE_PERCENTAGE / 100); // Use the constant
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

const calculateDiscount = (listTokenDenom, saleTokenDenom, bondPrice, prices) => {
  if (!prices || !listTokenDenom || !saleTokenDenom || !bondPrice) return null;

  // Debug logging
  console.log('Prices object:', prices);
  console.log('List token denom:', listTokenDenom);
  console.log('Sale token denom:', saleTokenDenom);

  // Convert denoms to lowercase and handle special testnet case
  let listTokenSymbol = (tokenMappings[listTokenDenom]?.symbol || listTokenDenom).toLowerCase();
  let saleTokenSymbol = (tokenMappings[saleTokenDenom]?.symbol || saleTokenDenom).toLowerCase();
  
  // Debug logging after conversion
  console.log('Converted list token symbol:', listTokenSymbol);
  console.log('Converted sale token symbol:', saleTokenSymbol);
  
  // Map daoOphir to ophir for price lookup
  if (listTokenSymbol?.includes('daoophir')) listTokenSymbol = 'ophir';
  if (saleTokenSymbol?.includes('daoophir')) saleTokenSymbol = 'ophir';
  
  // Handle wBTC case specifically
  if (listTokenSymbol?.includes('wbtc')) listTokenSymbol = 'btc';
  if (saleTokenSymbol?.includes('wbtc')) saleTokenSymbol = 'btc';
  
  // Debug logging after special case handling
  console.log('Final list token symbol:', listTokenSymbol);
  console.log('Final sale token symbol:', saleTokenSymbol);
  console.log('Available prices:', Object.keys(prices));
  
  const listTokenPrice = prices[listTokenSymbol];
  const saleTokenPrice = prices[saleTokenSymbol];

  // Debug logging for prices
  console.log('List token price:', listTokenPrice);
  console.log('Sale token price:', saleTokenPrice);

  if (!listTokenPrice || !saleTokenPrice) return null;

  // Calculate discount/premium percentage
  const bondPriceInUSD = parseFloat(bondPrice) * saleTokenPrice;
  const discount = ((bondPriceInUSD - listTokenPrice) / listTokenPrice) * 100;
  
  return discount;
};

const calculatePriceFromMarkup = (markup, listTokenDenom, saleTokenDenom, prices) => {
  if (!prices || !listTokenDenom || !saleTokenDenom) return null;

  // Debug logging
  console.log('Prices object:', prices);
  console.log('List token denom:', listTokenDenom);
  console.log('Sale token denom:', saleTokenDenom);

  // Convert denoms to lowercase and handle special testnet case
  let listTokenSymbol = (tokenMappings[listTokenDenom]?.symbol || listTokenDenom).toLowerCase();
  let saleTokenSymbol = (tokenMappings[saleTokenDenom]?.symbol || saleTokenDenom).toLowerCase();
  
  // Debug logging after conversion
  console.log('Converted list token symbol:', listTokenSymbol);
  console.log('Converted sale token symbol:', saleTokenSymbol);
  
  // Map daoOphir to ophir for price lookup
  if (listTokenSymbol?.includes('daoophir')) listTokenSymbol = 'ophir';
  if (saleTokenSymbol?.includes('daoophir')) saleTokenSymbol = 'ophir';
  
  // Handle wBTC case specifically
  if (listTokenSymbol?.includes('wbtc')) listTokenSymbol = 'btc';
  if (saleTokenSymbol?.includes('wbtc')) saleTokenSymbol = 'btc';
  
  // Debug logging after special case handling
  console.log('Final list token symbol:', listTokenSymbol);
  console.log('Final sale token symbol:', saleTokenSymbol);
  console.log('Available prices:', Object.keys(prices));
  
  const listTokenPrice = prices[listTokenSymbol];
  const saleTokenPrice = prices[saleTokenSymbol];

  // Debug logging for prices
  console.log('List token price:', listTokenPrice);
  console.log('Sale token price:', saleTokenPrice);

  if (!listTokenPrice || !saleTokenPrice) return null;

  // Calculate price based on markup percentage
  const basePrice = listTokenPrice / saleTokenPrice;
  const markupMultiplier = 1 + (markup / 100);
  return (basePrice * markupMultiplier).toFixed(6);
};

const BondTimelinePreview = ({ formData, setFormData, bondType }) => {
  // Add refs for each input
  const inputRefs = {
    start: React.useRef(),
    end: React.useRef(),
    claim_start: React.useRef(),
    maturity: React.useRef()
  };

  const handleDateClick = (id) => {
    inputRefs[id].current?.showPicker();
  };

  const handleDateChange = (dateType, newDateTime) => {
    const date = new Date(newDateTime);
    
    // Format date and time according to the required format
    const formattedDate = date.toLocaleDateString('en-CA'); // YYYY-MM-DD
    const formattedTime = date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    // Update the form data based on the date type
    const updates = {
      start: {
        start_time: formattedDate,
        start_time_hour: formattedTime
      },
      end: {
        end_time: formattedDate,
        end_time_hour: formattedTime
      },
      claim_start: {
        claim_start_date: formattedDate,
        claim_start_hour: formattedTime
      },
      maturity: {
        maturity_date: formattedDate,
        maturity_date_hour: formattedTime
      }
    };

    setFormData(prev => ({
      ...prev,
      ...updates[dateType]
    }));
  };

  const getDateTime = (dateType) => {
    const dateTimeMap = {
      start: `${formData.start_time}T${formData.start_time_hour}`,
      end: `${formData.end_time}T${formData.end_time_hour}`,
      claim_start: formData.claim_start_date && formData.claim_start_hour ? 
        `${formData.claim_start_date}T${formData.claim_start_hour}` :
        `${formData.end_time}T${formData.end_time_hour}`,
      maturity: `${formData.maturity_date}T${formData.maturity_date_hour}`
    };

    return dateTimeMap[dateType] || '';
  };

  // Define fixed order for timeline items
  const dates = [
    {
      id: 'start',
      time: getDateTime('start'),
      label: 'Purchase Start',
      color: 'grey',
      editable: true,
      order: 1
    },
    {
      id: 'end',
      time: getDateTime('end'),
      label: 'Purchase End',
      color: 'grey',
      editable: true,
      order: 2
    },
    ...(bondType === 'vested' ? [{
      id: 'claim_start',
      time: getDateTime('claim_start'),
      label: 'Claim Start',
      color: 'grey',
      editable: true,
      order: 3
    }] : []),
    {
      id: 'maturity',
      time: getDateTime('maturity'),
      label: bondType === 'cliff' ? 'Maturity & Claim Start' : 'Maturity',
      color: 'grey',
      editable: true,
      order: 4
    }
  ].sort((a, b) => a.order - b.order); // Sort by fixed order instead of dates

  // Add console logs to debug
  React.useEffect(() => {
    console.log('Current formData:', formData);
  }, [formData]);

  const isDateInvalid = (dateType, dateTime) => {
    const now = new Date();
    const date = new Date(dateTime);
    
    // Basic past date validation
    if (date <= now) return true;
    
    // Additional validation rules based on date type
    switch (dateType) {
      case 'end':
        return date <= new Date(getDateTime('start'));
      case 'maturity':
        return date <= new Date(getDateTime('end'));
      default:
        return false;
    }
  };

  // Modify the date display component to include validation
  const DateDisplay = ({ date, isInvalid }) => (
    <div 
      onClick={() => handleDateClick(date.id)}
      className={`relative bg-transparent border rounded px-3 py-1.5 cursor-pointer transition-colors duration-200
        ${isInvalid 
          ? 'border-red-500 text-red-400 hover:border-red-400' 
          : 'border-gray-600 hover:border-yellow-500'}
        flex items-center justify-center min-w-[200px]`}
    >
      <div className="text-sm whitespace-nowrap">
        {new Date(date.time).toLocaleString()}
      </div>
      <input
        ref={inputRefs[date.id]}
        type="datetime-local"
        value={date.time}
        onChange={(e) => handleDateChange(date.id, e.target.value)}
        className="absolute opacity-0 w-0 h-0"
      />
    </div>
  );

  return (
    <div className="bond-create-text-container rounded-lg p-4 md:p-6">
      {/* Mobile View */}
      <div className="md:hidden space-y-4">
        {dates.map((date, index) => {
          const isInvalid = isDateInvalid(date.id, date.time);
          return (
            <div 
              key={date.id}
              className="relative flex flex-col space-y-2 bg-gray-900/50 p-3 rounded-lg"
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium ${isInvalid ? 'text-red-400' : 'text-yellow-500'}`}>
                  {date.label}
                </span>
                {index === 0 && <span className="text-xs text-yellow-400">(Start)</span>}
                {index === dates.length - 1 && <span className="text-xs text-yellow-400">(End)</span>}
              </div>
              <DateDisplay date={date} isInvalid={isInvalid} />
              {index < dates.length - 1 && (
                <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-0.5 h-4 bg-gray-600" />
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop View */}
      <div className="hidden md:block">
        <Timeline position="alternate">
          {dates.map((date, index) => {
            const isInvalid = isDateInvalid(date.id, date.time);
            return (
              <TimelineItem key={date.id}>
                <TimelineOppositeContent 
                  sx={{ 
                    flex: 0.5,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: index % 2 === 0 ? 'flex-end' : 'flex-start'
                  }}
                >
                  <DateDisplay date={date} isInvalid={isInvalid} />
                </TimelineOppositeContent>
                <TimelineSeparator>
                  <TimelineDot 
                    sx={{
                      cursor: 'pointer',
                      backgroundColor: isInvalid ? '#ef4444' : '#808080',
                      '&:hover': {
                        backgroundColor: isInvalid ? '#dc2626' : '#fbbf24',
                      }
                    }}
                    onClick={() => handleDateClick(date.id)}
                  />
                  {index < dates.length - 1 && <TimelineConnector />}
                </TimelineSeparator>
                <TimelineContent sx={{ 
                  color: isInvalid ? '#ef4444' : 'white',
                  flex: 0.5,
                  '&.MuiTimelineContent-root': {
                    px: 2
                  }
                }}>
                  {date.label}
                  {index === 0 && <div className="text-yellow-400 text-sm mt-1">(Start)</div>}
                  {index === dates.length - 1 && <div className="text-yellow-400 text-sm mt-1">(End)</div>}
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      </div>
    </div>
  );
};

// Add this helper function near other utility functions
const getTokenPriceInfo = (listTokenDenom, saleTokenDenom, markup, prices) => {
  if (!prices || !listTokenDenom || !saleTokenDenom) return null;

  // Debug logging
  console.log('Prices object:', prices);
  console.log('List token denom:', listTokenDenom);
  console.log('Sale token denom:', saleTokenDenom);

  // Convert denoms to lowercase and handle special testnet case
  let listTokenSymbol = (tokenMappings[listTokenDenom]?.symbol || listTokenDenom).toLowerCase();
  let saleTokenSymbol = (tokenMappings[saleTokenDenom]?.symbol || saleTokenDenom).toLowerCase();
  
  // Debug logging after conversion
  console.log('Converted list token symbol:', listTokenSymbol);
  console.log('Converted sale token symbol:', saleTokenSymbol);
  
  // Map daoOphir to ophir for price lookup
  if (listTokenSymbol?.includes('daoophir')) listTokenSymbol = 'ophir';
  if (saleTokenSymbol?.includes('daoophir')) saleTokenSymbol = 'ophir';
  
  // Handle wBTC case specifically
  if (listTokenSymbol?.includes('wbtc')) listTokenSymbol = 'btc';
  if (saleTokenSymbol?.includes('wbtc')) saleTokenSymbol = 'btc';
  
  // Debug logging after special case handling
  console.log('Final list token symbol:', listTokenSymbol);
  console.log('Final sale token symbol:', saleTokenSymbol);
  console.log('Available prices:', Object.keys(prices));
  
  const listTokenPrice = prices[listTokenSymbol];
  const saleTokenPrice = prices[saleTokenSymbol];

  // Debug logging for prices
  console.log('List token price:', listTokenPrice);
  console.log('Sale token price:', saleTokenPrice);

  if (!listTokenPrice || !saleTokenPrice) return null;

  const basePrice = listTokenPrice / saleTokenPrice;
  const adjustedPrice = basePrice * (1 + (markup / 100));

  return {
    marketPrice: basePrice.toFixed(6),
    bondPrice: adjustedPrice.toFixed(6),
    listSymbol: tokenMappings[listTokenDenom]?.symbol || listTokenDenom,
    saleSymbol: tokenMappings[saleTokenDenom]?.symbol || saleTokenDenom
  };
};

const CreateBonds = () => {
  const { isSidebarOpen } = useSidebar();
  const { connectedWalletAddress, isLedgerConnected } = useWallet();
  const { isTestnet, rpc, contractAddress } = useNetwork();
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
        image: ""
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
  const { prices } = useCrypto();

  // Add new state for tracking selected preset
  const [selectedPreset, setSelectedPreset] = useState(null);

  // Remove the hardcoded allowedDenoms array
  const [allowedDenoms, setAllowedDenoms] = useState([]);

  // Add useEffect to fetch allowed denoms when component mounts
  useEffect(() => {
    const fetchAllowedDenoms = async () => {
      try {
        const client = await CosmWasmClient.connect(rpc);
        
        const query = {
          get_allowed_resale_denoms: {}
        };
        
        const response = await client.queryContractSmart(
          contractAddress,
          query
        );
        
        if (response?.denoms) {
          setAllowedDenoms(response.denoms);
        }
      } catch (error) {
        console.error("Error fetching allowed denoms:", error);
        showAlert("Error fetching allowed tokens", "error");
      }
    };

    fetchAllowedDenoms();
  }, [rpc, contractAddress]);

  // Update the filteredTokenMappings to use the fetched allowedDenoms
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
        chainId: isTestnet ? "narwhal-2" : "migaloo-1",
        chainName: isTestnet ? "Migaloo Testnet" : "Migaloo",
        rpc: rpc,
        rest: isTestnet 
          ? "https://migaloo-testnet-api.polkachu.com"
          : "https://migaloo-api.polkachu.com",
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

    // Enable chain with correct chain ID
    const chainId = isTestnet ? "narwhal-2" : "migaloo-1";
    await window.keplr?.enable(chainId);
    const offlineSigner = window.keplr?.getOfflineSigner(chainId);
    
    // Verify chain ID matches
    const accounts = await offlineSigner?.getAccounts();
    if (!accounts?.length) {
      throw new Error("No accounts found");
    }
    
    return offlineSigner;
  };

  const { setIsIssuer } = useIssuer();

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

      // For cliff bonds, claim start time should match maturity date
      const claimStartOffset = bondType === 'cliff' ? maturityOffset : endOffset + 2;

      // Query contract config to get fee rate
      const configQuery = {
        config: {}
      };
      
      const config = await client.queryContractSmart(
        contractAddress,
        configQuery
      );

      console.log('Contract config:', config); // Debug log

      // Single timestamp query with all offsets
      const timestampQuery = {
        get_timestamp_offsets: {
          start_offset: startOffset,
          end_offset: endOffset,
          claim_start_offset: claimStartOffset,
          // claim_end_offset: maturityOffset,
          mature_offset: maturityOffset
        }
      };

      const timestamps = await client.queryContractSmart(
        contractAddress,
        timestampQuery
      );

      // Base message structure
      let bondMessage = {
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
          image: formData.nft_metadata.image || null
        }
      };

      console.log("config.fee_rate", config.config.fee_rate)
      // Add maker/taker fee rates if using custom fee split
      if (showAdvancedSettings && feeSplit !== 30) { // 30 is the default taker percentage
        const totalFeeRate = parseFloat(config.config.fee_rate);
        console.log('Total fee rate:', totalFeeRate); // Debug log
        console.log('Current fee split:', feeSplit); // Debug log

        if (!isNaN(totalFeeRate) && totalFeeRate > 0) {
          // Calculate maker and taker rates based on the fee split
          const makerRate = ((100 - feeSplit) / 100) * totalFeeRate;
          const takerRate = (feeSplit / 100) * totalFeeRate;
          
          // Add to message
          bondMessage.maker_fee_rate = makerRate.toString();
          bondMessage.taker_fee_rate = takerRate.toString();

          console.log('Custom fee rates:', { // Debug log
            maker: makerRate,
            taker: takerRate
          });
        }
      }

      const message = {
        issue_bond: bondMessage
      };

      console.log('Final message:', message); // Debug log

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
        contractAddress,
        message,
        fee,
        `Create Bond: ${fullBondDenomName}`,
        funds
      );

      console.log(result);
      if (result.transactionHash) {
        // Set issuer status to true after successful bond creation
        setIsIssuer(true);
        
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
            image: ""
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
    setSelectedPreset(preset.label); // Track which preset is selected
    
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
        start_time: startDate.toLocaleDateString('en-CA'),
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

  // Add this near the top with other state declarations
  const [showUsdAmounts, setShowUsdAmounts] = useState({
    pricePer: false,
    gross: false,
    fee: false,
    maxReturn: false
  });

  const [markupValue, setMarkupValue] = useState(0);

  // Add new effect for markup
  useEffect(() => {
    if (formData.token_denom && formData.purchasing_denom) {
      const newPrice = calculatePriceFromMarkup(
        markupValue,
        formData.token_denom,
        formData.purchasing_denom,
        prices
      );
      if (newPrice) {
        setFormData(prev => ({
          ...prev,
          price: newPrice
        }));
      }
    }
  }, [markupValue, formData.token_denom, formData.purchasing_denom, prices]);

  // In the CreateBonds component, add this state
  const [showPriceTooltip, setShowPriceTooltip] = useState(false);

  // Add new state for advanced settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [feeSplit, setFeeSplit] = useState(30);
  const feeSplitRef = React.useRef(null);

  return (
    <div className={`global-bg-new text-white min-h-screen w-full transition-all duration-300 ease-in-out ${
      isSidebarOpen ? 'md:pl-64' : ''
    }`}>
      <div className="pt-32 md:pt-24 w-[92%] md:w-[95%] md:max-w-10xl mx-auto">
        <button
          onClick={handleGoBack}
          className="back-button ml-4 mb-4 flex items-center text-gray-300 hover:text-white transition duration-300"
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
                    className={`px-4 py-2 text-sm rounded-md bond-create-text-container hover:bg-[#3c3d4a] transition-colors duration-200 text-white border 
                      ${selectedPreset === duration.label 
                        ? 'border-yellow-500 border-2' 
                        : 'border-gray-600 hover:border-gray-500'}`}
                  >
                    {duration.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
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

            {/* {bondType === 'vested' && (
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
            )} */}

            <div>
              {/* <LabelWithTooltip
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
              </div> */}

              {/* Add the timeline preview */}
              <div className="mt-6 pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold mb-4 text-yellow-400">Bond Lifecycle</h3>
                <div className="overflow-x-auto">
                  <BondTimelinePreview formData={formData} setFormData={setFormData} bondType={bondType} />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center">
                <LabelWithTooltip
                  label="Preset Markup"
                  tooltip="Quickly set bond price based on current market price. Negative values indicate discount, positive values indicate premium."
                />
                <span className={`text-sm font-medium ${
                  markupValue < 0 ? 'text-green-400' : markupValue > 0 ? 'text-red-400' : 'text-gray-400'
                }`}>
                  {markupValue > 0 ? '+' : ''}{markupValue}% {markupValue < 0 ? 'Discount' : markupValue > 0 ? 'Premium' : ''}
                </span>
              </div>
              <div className="flex items-center space-x-4 mt-2">
                <button 
                  onClick={() => setMarkupValue(-100)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  -100%
                </button>
                <div className="flex-1 relative">
                  <div 
                    className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 
                      ${showPriceTooltip && getTokenPriceInfo(formData.token_denom, formData.purchasing_denom, markupValue, prices) ? 'block' : 'hidden'} 
                      bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg border border-gray-700
                      whitespace-nowrap text-sm z-10`}
                  >
                    {(() => {
                      const priceInfo = getTokenPriceInfo(
                        formData.token_denom,
                        formData.purchasing_denom,
                        markupValue,
                        prices
                      );
                      
                      if (!priceInfo) return null;
                      
                      return (
                        <div className="space-y-1">
                          <div>Market Price: {priceInfo.marketPrice} {priceInfo.listSymbol}/{priceInfo.saleSymbol}</div>
                          <div className={markupValue < 0 ? 'text-green-400' : markupValue > 0 ? 'text-red-400' : 'text-gray-400'}>
                            Bond Price: {priceInfo.bondPrice} {priceInfo.listSymbol}/{priceInfo.saleSymbol}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <input
                    type="range"
                    min={MARKUP_RANGE.min}
                    max={MARKUP_RANGE.max}
                    step={MARKUP_RANGE.step}
                    value={markupValue}
                    onChange={(e) => setMarkupValue(Number(e.target.value))}
                    onMouseEnter={() => setShowPriceTooltip(true)}
                    onMouseLeave={() => setShowPriceTooltip(false)}
                    onTouchStart={() => setShowPriceTooltip(true)}
                    onTouchEnd={() => setShowPriceTooltip(false)}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-yellow-500
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-moz-range-thumb]:w-4
                      [&::-moz-range-thumb]:h-4
                      [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-yellow-500
                      [&::-moz-range-thumb]:cursor-pointer
                      [&::-moz-range-thumb]:border-0"
                  />
                  <div className="absolute w-full top-6 flex justify-between">
                    <span className="text-xs text-gray-500">Max Discount</span>
                    <span className="text-xs text-gray-500">Max Premium</span>
                  </div>
                </div>
                <button 
                  onClick={() => setMarkupValue(100)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  +100%
                </button>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {[-50, -25, -10, 0, 10, 25, 50].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setMarkupValue(preset)}
                    className={`px-2 py-1 text-xs rounded-md transition-colors duration-200 min-w-[60px]
                      ${markupValue === preset 
                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500' 
                        : 'bond-create-text-container hover:bg-[#3c3d4a]'}`}
                  >
                    {preset > 0 ? '+' : ''}{preset}%
                  </button>
                ))}
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
                    isTestnet={isTestnet}
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
                    isTestnet={isTestnet}
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
                  
                  // Get token price for USD conversion
                  const purchasingTokenSymbol = tokenMappings[formData.purchasing_denom]?.symbol?.toLowerCase() || formData.purchasing_denom?.toLowerCase();
                  const purchasingTokenPrice = prices[purchasingTokenSymbol === 'daoophir' ? 'ophir' : purchasingTokenSymbol];
                  const singleBondUsdPrice = purchasingTokenPrice ? (parseFloat(formData.price) * purchasingTokenPrice) : null;
                  
                  // Calculate USD values
                  const grossUsd = purchasingTokenPrice ? (parseFloat(amounts.gross) * purchasingTokenPrice) : null;
                  const feeUsd = purchasingTokenPrice ? (parseFloat(amounts.fee) * purchasingTokenPrice) : null;
                  const maxReturnUsd = purchasingTokenPrice ? (parseFloat(amounts.net) * purchasingTokenPrice) : null;

                  const formatUsd = (amount) => amount?.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });

                  // Calculate discount/premium
                  const discount = calculateDiscount(
                    formData.token_denom,
                    formData.purchasing_denom,
                    formData.price,
                    prices
                  );

                  return (
                    <div className="space-y-1 text-sm">
                      <p 
                        className="text-gray-400 mb-2 cursor-pointer hover:text-gray-300 transition-colors"
                        onClick={() => setShowUsdAmounts(prev => ({ ...prev, pricePer: !prev.pricePer }))}
                      >
                        Price per Bond: {showUsdAmounts.pricePer 
                          ? formatUsd(singleBondUsdPrice)
                          : `${formData.price} ${symbol}`
                        }
                      </p>
                      
                      <p 
                        className="text-gray-400 cursor-pointer hover:text-gray-300 transition-colors"
                        onClick={() => setShowUsdAmounts(prev => ({ ...prev, gross: !prev.gross }))}
                      >
                        Gross Amount: {showUsdAmounts.gross 
                          ? formatUsd(grossUsd)
                          : `${amounts.gross} ${symbol}`
                        }
                      </p>
                      
                      <p 
                        className="text-red-400 cursor-pointer hover:text-red-300 transition-colors"
                        onClick={() => setShowUsdAmounts(prev => ({ ...prev, fee: !prev.fee }))}
                      >
                        Fee ({BOND_PURCHASE_FEE_PERCENTAGE}%): {showUsdAmounts.fee 
                          ? formatUsd(feeUsd)
                          : `${amounts.fee} ${symbol}`
                        }
                      </p>
                      
                      <p 
                        className="text-green-400 cursor-pointer hover:text-green-300 transition-colors"
                        onClick={() => setShowUsdAmounts(prev => ({ ...prev, maxReturn: !prev.maxReturn }))}
                      >
                        Max Return: {showUsdAmounts.maxReturn 
                          ? formatUsd(maxReturnUsd)
                          : `${amounts.net} ${symbol}`
                        }
                      </p>
                      
                      {discount !== null && (
                        <p className={`mt-2 ${discount < 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {Math.abs(discount).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}% {discount < 0 ? 'Discount' : 'Premium'}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Advanced Settings Section */}
            <div className="mt-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showAdvancedSettings"
                  checked={showAdvancedSettings}
                  onChange={(e) => {
                    setShowAdvancedSettings(e.target.checked);
                    // Reset fee split to default (30% taker) when unchecking
                    if (!e.target.checked) {
                      setFeeSplit(30);
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                />
                <label htmlFor="showAdvancedSettings" className="text-sm font-medium text-gray-300">
                  Advanced Settings
                </label>
              </div>

              {showAdvancedSettings && (
                <div className="mt-4 p-4 rounded-md bg-gray-800/50 border border-gray-700">
                  <div className="mb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-300">Fee Split</span>
                    </div>
                    <div className="mt-4 relative">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{100 - feeSplit}% Maker</span>
                        <span>{feeSplit}% Taker</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={feeSplit}
                        onChange={(e) => setFeeSplit(Number(e.target.value))}
                        ref={feeSplitRef}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer
                          [&::-webkit-slider-thumb]:appearance-none
                          [&::-webkit-slider-thumb]:w-4
                          [&::-webkit-slider-thumb]:h-4
                          [&::-webkit-slider-thumb]:rounded-full
                          [&::-webkit-slider-thumb]:bg-yellow-500
                          [&::-webkit-slider-thumb]:cursor-pointer
                          [&::-moz-range-thumb]:w-4
                          [&::-moz-range-thumb]:h-4
                          [&::-moz-range-thumb]:rounded-full
                          [&::-moz-range-thumb]:bg-yellow-500
                          [&::-moz-range-thumb]:cursor-pointer
                          [&::-moz-range-thumb]:border-0"
                      />
                      <div className="absolute w-0.5 h-3 bg-gray-500 top-[calc(100%+2px)] left-1/2 transform -translate-x-1/2"></div>
                      <div className="absolute top-[calc(100%+8px)] left-1/2 transform -translate-x-1/2 text-xs text-gray-400">
                        50/50
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Add default split info when advanced settings are hidden */}
              {!showAdvancedSettings && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400">
                    Default Fee Split: 70% Maker / 30% Taker
                  </p>
                </div>
              )}
            </div>

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

        <h3 className="text-3xl font-bold mb-4">
          NFT Metadata
          <Tooltip title="Each bond is represented as an NFT (Non-Fungible Token) that proves ownership. When you purchase a bond, you receive an NFT that you can later redeem for the promised tokens." arrow placement="top">
            <InfoIcon className="h-5 w-5 ml-2 text-gray-400 cursor-help inline-block" />
          </Tooltip>
        </h3>
        <p className="text-gray-400 mb-8">
          Each bond is represented as an NFT that proves ownership and enables trading. The NFT will be automatically minted to bond purchasers and can be used to claim the underlying tokens at maturity.
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
                Image URL (Optional)
              </label>
              <input
                type="text"
                name="nft_metadata.image"
                value={formData.nft_metadata.image}
                onChange={handleInputChange}
                className="bond-create-text-container w-full px-3 py-2 rounded-md"
                placeholder="https://example.com/metadata/1"
              />
              <p className="text-xs text-gray-500 mt-1">
                External URL for the NFT image (optional)
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
        formData={formData}
        setFormData={setFormData}
        isLoading={isLoading}
        customBondName={customBondName}
        fullBondDenomName={fullBondDenomName}
        bondType={bondType}
        feeSplit={feeSplit}
        showAdvancedSettings={showAdvancedSettings}
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