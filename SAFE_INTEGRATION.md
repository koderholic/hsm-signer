# Safe SDK Integration for HSM-Signed Transaction Confirmation

This integration allows you to confirm Safe transactions using your existing HSM-based Ethereum signing service. It combines the Safe SDK with your HSM infrastructure to provide secure transaction confirmation capabilities.

## Files Added

- `safe-transaction-confirm.js` - Core Safe transaction confirmation utility
- `safe-integration-example.js` - Complete integration example with HSM
- `SAFE_INTEGRATION.md` - This documentation file

## Dependencies Added

The following dependencies have been added to `package.json`:

```json
{
  "@safe-global/protocol-kit": "^4.0.0",
  "ethers": "^6.0.0"
}
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Your Setup

Update the configuration in `safe-integration-example.js`:

```javascript
const CONFIG = {
    chainId: 11155111n, // Sepolia testnet - change to your network
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY', // Your RPC URL
    safeAddress: '0xYourSafeAddress', // Your Safe address
    apiKey: 'YOUR_SAFE_API_KEY', // Optional: Your Safe API key
    hsmSlot: 0, // HSM slot number
};
```

### 3. Run the Example

```bash
node safe-integration-example.js
```

## Core Functionality

### SafeTransactionConfirmer Class

The `SafeTransactionConfirmer` class provides the following methods:

#### `getTransaction(safeTxHash)`
Fetches transaction details by hash from the Safe Transaction Service.

```javascript
const transaction = await confirmer.getTransaction('0xTransactionHash');
```

#### `confirmTransaction(safeTxHash, hsmSigner)`
Confirms a Safe transaction using HSM-signed signatures.

```javascript
const result = await confirmer.confirmTransaction('0xTransactionHash', hsmSigner);
```

#### `getPendingTransactions()`
Retrieves all pending transactions for the Safe.

```javascript
const pendingTxs = await confirmer.getPendingTransactions();
```

#### `getTransactionHistory(limit)`
Gets transaction history for the Safe.

```javascript
const history = await confirmer.getTransactionHistory(20);
```

### HSM Integration

The integration works with your existing HSM setup:

1. **HSM Initialization**: Uses your existing `initHSM()`, `loginHSMCU()`, and `getEthereumKeyPair()` functions
2. **Message Signing**: Leverages your `signEthereumMessage()` function for Safe transaction confirmation
3. **Address Derivation**: Uses your `deriveEthereumAddress()` function

## Usage Examples

### Basic Transaction Confirmation

```javascript
import { SafeTransactionConfirmer } from './safe-transaction-confirm.js';
import { initHSM, loginHSMCU, getEthereumKeyPair, deriveEthereumAddress } from './ethereum-hsm.js';

// Initialize HSM (your existing code)
const hsmModule = initHSM();
const slot = hsmModule.getSlots(0);
const hsmSession = loginHSMCU(slot);
const ethereumKeys = getEthereumKeyPair(hsmSession);
const ethereumAddress = deriveEthereumAddress(ethereumKeys.publicKey);

// Initialize Safe confirmer
const confirmer = new SafeTransactionConfirmer({
    chainId: 1n, // Ethereum mainnet
    rpcUrl: 'https://your-rpc-url',
    safeAddress: '0xYourSafeAddress',
    signerAddress: ethereumAddress
});

// Create HSM signer
const hsmSigner = {
    getAddress: () => ethereumAddress,
    signMessage: async (message) => {
        // Use your existing HSM signing logic
        const signature = signEthereumMessage(hsmSession, ethereumKeys.privateKey, ethereumKeys.publicKey, message);
        return signature.signature;
    }
};

// Confirm transaction
const result = await confirmer.confirmTransaction('0xTransactionHash', hsmSigner);
```

### Integration with Your Express Server

You can add Safe confirmation endpoints to your existing Express server:

```javascript
// Add to your index.js
import { SafeTransactionConfirmer } from './safe-transaction-confirm.js';

// Initialize Safe confirmer (after HSM initialization)
let safeConfirmer = null;

// Add endpoint for Safe transaction confirmation
app.post("/safe/confirm", async (req, res) => {
    if (!hsmSession || !ethereumKeys || !safeConfirmer) {
        return res.status(503).json({ 
            error: "HSM or Safe not ready", 
            message: "HSM is still initializing or Safe confirmer not initialized" 
        });
    }

    const { safeTxHash } = req.body;
    
    if (!safeTxHash) {
        return res.status(400).json({ 
            error: "Missing safeTxHash", 
            message: "Please provide a Safe transaction hash" 
        });
    }

    try {
        // Create HSM signer
        const hsmSigner = {
            getAddress: () => ethereumAddress,
            signMessage: async (message) => {
                const signature = signEthereumMessage(hsmSession, ethereumKeys.privateKey, ethereumKeys.publicKey, message);
                return signature.signature;
            }
        };

        const result = await safeConfirmer.confirmTransaction(safeTxHash, hsmSigner);
        
        res.json(result);
        
    } catch (error) {
        console.error("❌ Safe transaction confirmation failed:", error);
        res.status(500).json({ 
            error: "Confirmation failed", 
            message: error.message 
        });
    }
});

// Initialize Safe confirmer after HSM initialization
async function initializeHSM() {
    // ... your existing HSM initialization code ...
    
    // Initialize Safe confirmer
    safeConfirmer = new SafeTransactionConfirmer({
        chainId: 1n, // Change to your network
        rpcUrl: 'https://your-rpc-url',
        safeAddress: '0xYourSafeAddress',
        signerAddress: ethereumAddress
    });
    
    return true;
}
```

## Network Configuration

### Supported Networks

The Safe SDK supports multiple networks. Update the `chainId` in your configuration:

- **Ethereum Mainnet**: `1n`
- **Sepolia Testnet**: `11155111n`
- **Polygon**: `137n`
- **Arbitrum**: `42161n`
- **Optimism**: `10n`

### RPC URLs

You'll need RPC URLs for the networks you're using:

- **Infura**: `https://mainnet.infura.io/v3/YOUR_PROJECT_ID`
- **Alchemy**: `https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY`
- **QuickNode**: `https://your-endpoint.quiknode.pro/YOUR_TOKEN/`

## Safe API Key (Optional)

While not required, having a Safe API key provides higher rate limits:

1. Visit [Safe API Keys](https://app.safe.global/settings/api-keys)
2. Create a new API key
3. Add it to your configuration

## Security Considerations

1. **HSM Security**: Your private keys remain secure in the HSM
2. **Transaction Validation**: Always validate transaction details before confirming
3. **Network Security**: Use secure RPC endpoints
4. **API Keys**: Store API keys securely (environment variables recommended)

## Error Handling

The integration includes comprehensive error handling:

- **HSM Connection Issues**: Handles HSM initialization failures
- **Network Errors**: Manages RPC and API connection issues
- **Transaction Validation**: Checks if transactions can be confirmed
- **Signature Errors**: Handles HSM signing failures

## Testing

### Test with Sepolia Testnet

1. Deploy a Safe on Sepolia testnet
2. Fund it with Sepolia ETH
3. Create a test transaction
4. Use the integration to confirm it

### Test Transaction Flow

```bash
# 1. Start your HSM service
node index.js

# 2. In another terminal, run the Safe integration example
node safe-integration-example.js
```

## Troubleshooting

### Common Issues

1. **HSM Not Found**: Ensure your HSM is properly connected and configured
2. **Network Errors**: Check your RPC URL and network configuration
3. **Transaction Not Found**: Verify the transaction hash and Safe address
4. **Already Confirmed**: Check if the transaction is already executed or confirmed

### Debug Mode

Enable debug logging by setting environment variables:

```bash
DEBUG=safe:* node safe-integration-example.js
```

## Next Steps

1. **Customize Configuration**: Update network settings and addresses
2. **Add Error Handling**: Implement retry logic and better error messages
3. **Add Monitoring**: Implement logging and monitoring for production use
4. **Security Audit**: Review the integration for security best practices

## Support

For issues related to:
- **Safe SDK**: Check the [Safe documentation](https://docs.safe.global/sdk)
- **HSM Integration**: Review your existing HSM setup
- **Network Issues**: Verify your RPC configuration

## License

This integration follows the same license as your main project.
