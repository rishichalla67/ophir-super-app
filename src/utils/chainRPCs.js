export const chainRPCs = {
  migaloo: {
    primary: "https://migaloo-rpc.polkachu.com",
    backups: [
      "https://rpc-migaloo.kujira.app",
      "https://migaloo-rpc.kleomedes.network",
      "https://migaloo-rpc.publicnode.com:443",
    ],
  },
  juno: {
    primary: "https://juno-rpc.polkachu.com",
    backups: [
      "https://rpc-juno.whispernode.com",
      "https://rpc-juno.pupmos.network",
      "https://juno-rpc.publicnode.com:443",
    ],
  },
  osmosis: {
    primary: "https://osmosis-rpc.polkachu.com",
    backups: [
      "https://rpc.osmosis.zone",
      "https://osmosis-rpc.publicnode.com:443",
      "https://rpc-osmosis.blockapsis.com",
    ],
  },
  stargaze: {
    primary: "https://stargaze-rpc.polkachu.com",
    backups: [
      "https://rpc.stargaze-apis.com",
      "https://stargaze-rpc.publicnode.com:443",
      "https://rpc-stargaze.pupmos.network",
    ],
  },
  terra: {
    primary: "https://terra-rpc.polkachu.com",
    backups: [
      "https://terra-rpc.publicnode.com:443",
      "https://terra-rpc.stakely.io",
      "https://rpc-terra.blockapsis.com",
    ],
  },
  injective: {
    primary: "https://injective-rpc.polkachu.com",
    backups: [
      "https://injective-rpc.publicnode.com:443",
      "https://rpc-injective.goldenratiostaking.net",
      "https://rpc-injective.block-spirit.network",
    ],
  },
  kujira: {
    primary: "https://kujira-rpc.polkachu.com",
    backups: [
      "https://rpc-kujira.whispernode.com",
      "https://kujira-rpc.publicnode.com:443",
      "https://rpc-kujira.mintthemoon.xyz",
    ],
  },
  bitcoin: {
    primary: "https://btc.getblock.io/mainnet/",
    backups: [
      "https://bitcoin.blockstream.info/api",
      "https://blockchain.info/api",
    ],
  },
  thorchain: {
    primary: "https://thornode.ninerealms.com",
    backups: [
      "https://rpc.thorchain.info",
      "https://thornode.thorswap.net",
      "https://rpc.thornode.thorswap.net",
    ],
  },
};

// Helper function to get a working RPC
export const getWorkingRPC = async (chain) => {
  if (!chainRPCs[chain]) {
    throw new Error(`No RPCs configured for chain: ${chain}`);
  }

  // Try primary first
  try {
    const response = await fetch(`${chainRPCs[chain].primary}/status`);
    if (response.ok) {
      return chainRPCs[chain].primary;
    }
  } catch (error) {
    console.warn(`Primary RPC for ${chain} failed, trying backups...`);
  }

  // Try backups in order
  for (const backupRPC of chainRPCs[chain].backups) {
    try {
      const response = await fetch(`${backupRPC}/status`);
      if (response.ok) {
        return backupRPC;
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error(`No working RPC found for chain: ${chain}`);
};

// Usage example:
// const rpc = await getWorkingRPC('osmosis'); 