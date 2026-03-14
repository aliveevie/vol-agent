// Patches the WDK Aave module to support Sepolia testnet (chain ID 11155111).
// The @bgd-labs/aave-address-book already has AaveV3Sepolia — the WDK module
// just doesn't import it. This script adds it to the address map.

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mapFile = resolve(
  __dirname,
  '..',
  'node_modules',
  '@tetherto',
  'wdk-protocol-lending-aave-evm',
  'src',
  'aave-v3-address-map.js'
);

let content = readFileSync(mapFile, 'utf8');

if (content.includes('AaveV3Sepolia')) {
  console.log('Aave Sepolia patch already applied.');
  process.exit(0);
}

// Add AaveV3Sepolia to the import
content = content.replace(
  /import \{([^}]+)\} from '@bgd-labs\/aave-address-book'/,
  (match, imports) => {
    const newImports = imports.trim().replace(/AaveV3Soneium/, 'AaveV3Sepolia, AaveV3Soneium');
    return `import {${newImports}} from '@bgd-labs/aave-address-book'`;
  }
);

// Add Sepolia entry to the map
content = content.replace(
  'export default {',
  `export default {
  [AaveV3Sepolia.CHAIN_ID]: {
    pool: AaveV3Sepolia.POOL,
    uiPoolDataProvider: AaveV3Sepolia.UI_POOL_DATA_PROVIDER,
    poolAddressesProvider: AaveV3Sepolia.POOL_ADDRESSES_PROVIDER,
    priceOracle: AaveV3Sepolia.ORACLE
  },`
);

writeFileSync(mapFile, content);
console.log('Aave Sepolia patch applied successfully.');
