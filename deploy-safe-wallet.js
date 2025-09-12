import { ethers } from 'ethers';
import safePk from '@safe-global/protocol-kit';
import 'dotenv/config';

// Fix the import - Safe is the default export
const Safe = safePk.default || safePk; 

// --- Configuration ---
const RPC_URL = process.env.RPC_URL;
const SIGNER_1_PRIVATE_KEY = process.env.PRIVATE_KEY;

// Create a new Safe (owners: array of addresses, threshold: number, optional saltNonce)
// Deploy a Safe using createSafeDeploymentTransaction
export async function deploySafeWithCreateTx(owners, threshold = 1, saltNonce) {
    
    console.log("RPC_URL => ", RPC_URL);
    console.log('🚀 Starting Safe deployment...');
    console.log('Owners:', owners);
    console.log('Threshold:', threshold);
    if (saltNonce !== undefined) {
      console.log('Salt nonce:', saltNonce);
    } else {
      console.log('No salt nonce provided, using default.');
    }

    if (!Array.isArray(owners) || owners.length === 0) {
      console.error('❌ Owners must be a non-empty array');
      throw new Error('Owners must be a non-empty array');
    }
    if (threshold < 1 || threshold > owners.length) {
      console.error('❌ Invalid threshold:', threshold, 'for owners:', owners.length);
      throw new Error('Invalid threshold');
    }

    console.log("Get some details")
    // Debug: Check what chain we're on
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const network = await provider.getNetwork();
    console.log('🔍 Chain ID:', network.chainId.toString());
    console.log('🔍 Chain name:', network.name);

    // 1) Initialize a Safe instance with a predicted Safe config
    console.log('🔧 Initializing Safe SDK with predicted config...');
    
    // If Safe contracts aren't deployed on your chain, you need to provide their addresses:
    const CONTRACT_NETWORKS = {
      [network.chainId.toString()]: {
        safeSingletonAddress: process.env.SAFE_SINGLETON_ADDRESS,
        safeProxyFactoryAddress: process.env.SAFE_PROXY_FACTORY_ADDRESS,
        multiSendAddress: process.env.MULTI_SEND_ADDRESS,
        multiSendCallOnlyAddress: process.env.MULTI_SEND_CALL_ONLY_ADDRESS,
        fallbackHandlerAddress: process.env.FALLBACK_HANDLER_ADDRESS,
        signMessageLibAddress: process.env.SIGN_MESSAGE_LIB_ADDRESS,
        createCallAddress: process.env.CREATE_CALL_ADDRESS
      }
    }
    
    const safeSDK = await Safe.init({
      provider: RPC_URL,              // URL string
      signer: SIGNER_1_PRIVATE_KEY,   // private key string
      predictedSafe: {
        safeAccountConfig: { owners, threshold },
        safeDeploymentConfig: { safeVersion: '1.4.1' } // saltNonce optional
      },
      contractNetworks: CONTRACT_NETWORKS // Uncomment if you have custom contract addresses
    });

    // Predicted address (deterministic with same owners/threshold/saltNonce)
    const predictedAddress = await safeSDK.getAddress();
    console.log('🔮 Predicted Safe address:', predictedAddress);

    // 2) Build the deployment transaction
    console.log('🛠️  Building Safe deployment transaction...');
    const deployTx = await safeSDK.createSafeDeploymentTransaction(saltNonce);
    console.log('Deployment transaction:', {
      to: deployTx.to,
      data: deployTx.data,
      value: deployTx.value
    });

    // 3) Send the transaction with ethers
    console.log('📡 Connecting to provider and sending deployment transaction...');
    const wallet = new ethers.Wallet(SIGNER_1_PRIVATE_KEY, provider);
    const tx = await wallet.sendTransaction({
      to: deployTx.to,
      data: deployTx.data,
      value: deployTx.value // '0' for Safe deployment
    });
    console.log('📤 Deployment tx sent! Hash:', tx.hash);

    console.log('⏳ Waiting for deployment transaction confirmation...');
    const receipt = await tx.wait();
    console.log('✅ Deployment confirmed in block:', receipt.blockNumber);

    console.log('🎉 Safe deployed at (predicted):', predictedAddress);
    return predictedAddress;
  }

deploySafeWithCreateTx(['0x97542289b1453eB8e9C0f4af562ef7eb354DB75c', '0x111732c30117e9219201896F2cfaD924CbBC598c'], 1).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
