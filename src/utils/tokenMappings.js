// Add constants at the top of the file
export const OPHIR = "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir";
export const WBTC = "ibc/6E5BF71FE1BEBBD648C8A7CB7A790AEF0081120B2E5746E6563FC95764716D61";
export const LUNA = "ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8";
export const LAB_DENOM = "factory/osmo17fel472lgzs87ekt9dvk0zqyh5gl80sqp4sk4n/LAB";
export const RSTK_DENOM = "ibc/04FAC73DFF7F1DD59395948F2F043B0BBF978AD4533EE37E811340F501A08FFB";
export const ROAR_DENOM = "ibc/98BCD43F190C6960D0005BC46BB765C827403A361C9C03C2FF694150A30284B0";
export const SHARK_DENOM = "ibc/64D56DF9EC69BE554F49EBCE0199611062FF1137EF105E2F645C1997344F3834";
export const USDC_DENOM = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
export const AMP_WHALE = "factory/migaloo1436kxs0w2es6xlqpp9rd35e3d0cjnw4sv8j3a7483sgks29jqwgshqdky4/ampWHALE";
export const B_WHALE = "factory/migaloo1mf6ptkssddfmxvhdx0ech0k03ktp6kf9yk59renau2gvht3nq2gqdhts4u/boneWhale";

// Add constants for multipliers
export const AMPROAR_ERIS_CONSTANT = 1.04;
export const MOAR_ERIS_CONSTANT = 1.3984;
export const MUSDC_ERIS_CONSTANT = 1.2124;
export const AMPBTC_ERIS_CONSTANT = 1.029;
export const BLUNA_CONSTANT = 1 / 0.79007;
export const BOSMO_CONSTANT = 1 / 0.956234;
export const AMPOSMO_ERIS_CONSTANT = 1.1318;
export const AMPLUNA_ERIS_CONSTANT = 1.3356;
export const AMPWHALET_ERIS_CONSTANT = 1.6386;
export const BWHALET_CONSTANT = 1.5317;
export const UNSOLD_OPHIR_FUZION_BONDS = 47175732.096;

export const tokenMappings = {
  "factory/migaloo1436kxs0w2es6xlqpp9rd35e3d0cjnw4sv8j3a7483sgks29jqwgshqdky4/ampWHALE": {
    symbol: "ampWhale",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/517E13F14A1245D4DE8CF467ADD4DA0058974CDCC880FA6AE536DBCA1D16D84E": {
    symbol: "bWhale",
    decimals: 6,
    chain: "terra"
  },
  "ibc/917C4B1E92EE2F959FC11ECFC435C4048F97E8B00F9444592706F4604F24BF25": {
    symbol: "bWhale",
    decimals: 6,
    chain: "osmosis"
  },
  "ibc/B3F639855EE7478750CC8F82072307ED6E131A8EFF20345E1D136B50C4E5EC36": {
    symbol: "ampWhale",
    decimals: 6,
    chain: "terra"
  },
  "ibc/834D0AEF380E2A490E4209DFF2785B8DBB7703118C144AC373699525C65B4223": {
    symbol: "ampWhale",
    decimals: 6,
    chain: "osmosis"
  },
  "factory/migaloo1t862qdu9mj5hr3j727247acypym3ej47axu22rrapm4tqlcpuseqltxwq5/ophir":
    { symbol: "ophir", decimals: 6, chain: "migaloo" },
  "factory/migaloo17c5ped2d24ewx9964ul6z2jlhzqtz5gvvg80z6x9dpe086v9026qfznq2e/daoophir": { symbol: "daoOphir", decimals: 6, chain: "migaloo-testnet" },
  uwhale: { symbol: "whale", decimals: 6, chain: "migaloo" },
  uluna: { symbol: "luna", decimals: 6, chain: "terra" },
  "ibc/EDD6F0D66BCD49C1084FB2C35353B4ACD7B9191117CE63671B61320548F7C89D": {
    symbol: "whale",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/EA459CE57199098BA5FFDBD3194F498AA78439328A92C7D136F06A5220903DA6": {
    symbol: "ampWHALEt",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/6E5BF71FE1BEBBD648C8A7CB7A790AEF0081120B2E5746E6563FC95764716D61": {
    symbol: "wBTC",
    decimals: 8,
    chain: "migaloo"
  },
  "ibc/EF4222BF77971A75F4E655E2AD2AFDDC520CE428EF938A1C91157E9DFBFF32A3": {
    symbol: "kuji",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/50D7251763B4D5E9DD7A8A6C6B012353E998CDE95C546C1F96D68F7CCB060918": {
    symbol: "ampKuji",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/B65E189D3168DB40C88C6A6C92CA3D3BB0A8B6310325D4C43AB5702F06ECD60B": {
    symbol: "wBTCaxl",
    decimals: 8,
    chain: "migaloo"
  },
  "ibc/4627AD2524E3E0523047E35BB76CC90E37D9D57ACF14F0FCBCEB2480705F3CB8": {
    symbol: "luna",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/migaloo1erul6xyq0gk6ws98ncj7lnq9l4jn4gnnu9we73gdz78yyl2lr7qqrvcgup/ash":
    { symbol: "ash", decimals: 6, chain: "migaloo" },
  "factory/migaloo1p5adwk3nl9pfmjjx6fu9mzn4xfjry4l2x086yq8u8sahfv6cmuyspryvyu/uLP":
    { symbol: "ophirWhaleLp", decimals: 6, chain: "migaloo" },
  "factory/migaloo154k8ta3n0eduqrkr657f0kaj8yc89rczjpznxwnrnfvdlnjkxkjq0mv55f/uLP":
    { symbol: "ophirWbtcLp", decimals: 6, chain: "migaloo" },
  "factory/migaloo1axtz4y7jyvdkkrflknv9dcut94xr5k8m6wete4rdrw4fuptk896su44x2z/uLP":
    { symbol: "whalewBtcLp", decimals: 6, chain: "migaloo" },
  "factory/migaloo1xv4ql6t6r8zawlqn2tyxqsrvjpmjfm6kvdfvytaueqe3qvcwyr7shtx0hj/uLP":
    { symbol: "usdcWhaleLp", decimals: 6, chain: "migaloo" },
  "factory/osmo1rckme96ptawr4zwexxj5g5gej9s2dmud8r2t9j0k0prn5mch5g4snzzwjv/sail":
    { symbol: "sail", decimals: 6, chain: "osmosis" },
  "factory/terra1vklefn7n6cchn0u962w3gaszr4vf52wjvd4y95t2sydwpmpdtszsqvk9wy/ampROAR":
    { symbol: "ampRoar", decimals: 6, chain: "terra" },
  "factory/migaloo1cwk3hg5g0rz32u6us8my045ge7es0jnmtfpwt50rv6nagk5aalasa733pt/ampUSDC":
    { symbol: "ampUSDC", decimals: 6, chain: "migaloo" },
  "ibc/BC5C0BAFD19A5E4133FDA0F3E04AE1FBEE75A4A226554B2CBB021089FF2E1F8A": {
    symbol: "usdc",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/40C29143BF4153B365089E40E437B7AA819672646C45BB0A5F1E10915A0B6708": {
    symbol: "bLuna",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/05238E98A143496C8AF2B6067BABC84503909ECE9E45FBCBAC2CBA5C889FD82A": {
    symbol: "ampLuna",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/kujira16rujrka8vk3c7l7raa37km8eqcxv9z583p3c6e288q879rwp23ksy6efce/bOPHIR01":
    { symbol: "bOPHIR01", decimals: 6, chain: "kujira" },
  "ibc/2C962DAB9F57FE0921435426AE75196009FAA1981BF86991203C8411F8980FDB": {
    symbol: "usdc",
    decimals: 6,
    chain: "terra"
  }, //axlusdc transfer/channel-253
  "ibc/B3504E092456BA618CC28AC671A71FB08C6CA0FD0BE7C8A5B5A3E2DD933CC9E4": {
    symbol: "usdc",
    decimals: 6,
    chain: "terra"
  }, //axlUsdc transfer/channel-6 crypto-org-chain-mainnet-1 channel-56
  "ibc/36A02FFC4E74DF4F64305130C3DFA1B06BEAC775648927AA44467C76A77AB8DB": {
    symbol: "whale",
    decimals: 6,
    chain: "terra"
  },
  "migaloo10nucfm2zqgzqmy7y7ls398t58pjt9cwjsvpy88y2nvamtl34rgmqt5em2v": {
    symbol: "mUSDC",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/E54A0C1E4A2A79FD4F92765F68E38939867C3DA36E2EA6BBB2CE81C43F4C8ADC": {
    symbol: "bWHALEt",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/1480B8FD20AD5FCAE81EA87584D269547DD4D436843C1D20F15E00EB64743EF4": {
    symbol: "akt",
    decimals: 6,
    chain: "osmosis"
  },
  "factory/migaloo1r9x8fz4alekzr78k42rpmr9unpa7egsldpqeynmwl2nfvzexue9sn8l5rg/gash":
    { symbol: "gASH", decimals: 6, chain: "migaloo" },
  "ibc/DAB7EEB14B61CA588F013729604B01017A5FE0E860E1CCBAA5A1A5D9763737D6": {
    symbol: "MOAR",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/migaloo1eqntnl6tzcj9h86psg4y4h6hh05g2h9nj8e09l/urac": {
    symbol: "rac",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/6A368710043EEB6A499E805196E2552EF36926CBBC4F6FA4F4076411AC21A8ED": {
    symbol: "xusk",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/migaloo1pll95yfcnxd5pkkrcsad63l929m4ehk4c46fpqqp3c2d488ca0csc220d0/ampBTC":
    { symbol: "ampBTC", decimals: 8, chain: "migaloo" },
  "ibc/DAB7EEB14B61CA588F013729604B01017A5FE0E860E1CCBAA5A1A5D9763737D6": {
    symbol: "moar",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/44C29C91F202E20C8E28DFB1FA89B725C54171CD77B8948836C72E7A97E4A018": {
    symbol: "rakoff",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/87011191A408E791269307E8EC1D506737C6B48AE539C1CBCB40E70A7F35185B": {
    symbol: "usdc",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/BEFB9AB13AB43157A0AF6214AD4B1F565AC0CA0C1760B8337BE7B9E2996F7752": {
    symbol: "ampOsmo",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/EC48B819FC1D955ED1708A8E8E230B37217CC6D953448D3B4BCCF5B29BD1FCF9": {
    symbol: "bOsmo",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/F7EC3CE77AB008AE3EFCFEDBA1CD07E7306AAA0A8800FADD4B2F1725C0DADB6B": {
    symbol: "lab",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/migaloo1mf6ptkssddfmxvhdx0ech0k03ktp6kf9yk59renau2gvht3nq2gqdhts4u/boneWhale": {
    symbol: "bWhale",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/kujira13x2l25mpkhwnwcwdzzd34cr8fyht9jlj7xu9g4uffe36g3fmln8qkvm3qn/ukart": {
    symbol: "kart",
    decimals: 6,
    chain: "kujira"
  },
  "ukuji": {
    symbol: "kuji",
    decimals: 6,
    chain: "kujira"
  },
  "ibc/BB6BCDB515050BAE97516111873CCD7BCF1FD0CCB723CC12F3C4F704D6C646CE": {
    symbol: "kuji",
    decimals: 6,
    chain: "osmosis"
  },
  "ibc/bb6bcdb515050bae97516111873ccd7bcf1fd0ccb723cc12f3c4f704d6c646ce": {
    symbol: "kuji",
    decimals: 6,
    chain: "osmosis"
  },
  "uosmo": {
    symbol: "osmo",
    decimals: 6,
    chain: "osmosis"
  },
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4": {
    symbol: "usdc",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/498a0751c798a0d9a389aa3691123dada57daa4fe165d5c75894505b876ba6e4": {
    symbol: "usdc",
    decimals: 6,
    chain: "migaloo"
  },
  "factory/kujira1jelmu9tdmr6hqg0d6qw4g6c9mwrexrzuryh50fwcavcpthp5m0uq20853h/urcpt": {
    symbol: "xusdc",
    decimals: 6,
    chain: "kujira"
  },
  "factory/kujira1jelmu9tdmr6hqg0d6qw4g6c9mwrexrzuryh50fwcavcpthp5m0uq20853h/urcpt": {
    symbol: "xusdc",
    decimals: 6,
    chain: "kujira"
  },
  "factory/kujira1w4yaama77v53fp0f9343t9w2f932z526vj970n2jv5055a7gt92sxgwypf/urcpt": {
    symbol: "xusk",
    decimals: 6,
    chain: "kujira"
  },
  'ibc/D8C6D71032EC7CC4C9CCD0FF709CF87D34A7311FE5491E70F7EDE2351D189C10': {
    symbol: "dgn",
    decimals: 6,
    chain: "dungeon"
  },
  "ibc/F9905FB2922CEE27015C339B2B870FB854314AA1CBC2D3F56C5E8BA2691C3B61": {
    symbol: "ampWhaleAmpLp",
    decimals: 6,
    chain: "migaloo"
  },
  "ibc/4F5CB28CE3E351058D4CE671EAF935CA6D728C6DF34C1AC662B495310FECBBDA": {
    symbol: "bwhaleAmpLp",
    decimals: 6,
    chain: "migaloo"
  },
  'ibc/4725376E0682CFA116C4B67494AFA010B5204F1B6DAF3606516F18A0AD67B4B3': {
    symbol: 'drugs',
    decimals: 6,
    chain: 'injective'
  },
  'ibc/1C2D8505A29823310B4484E4C63CFDCB08C0D3B57537A615A45F4E5D42CDC789': {
    symbol: 'inj',
    decimals: 6,
    chain: 'injective'
  },
  'factory/migaloo1zsptvkg5aeg4tjksgv7vp4x5s9p5euqrh9jl3sfdv48wtnrhftlszsvmu5/uwhalex': {
    symbol: 'whalex',
    decimals: 6,
    chain: 'migaloo'
  }
};
