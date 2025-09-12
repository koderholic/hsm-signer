import { ethers } from 'ethers';
import safePk from '@safe-global/protocol-kit';
const Safe = safePk.default || safePk; 
import 'dotenv/config'; 

const { EthSafeSignature } = Safe;
import { 
    initHSM, 
    loginHSMCU, 
    getEthereumKeyPair, 
    deriveEthereumAddress,
    signEthereumMessage
} from './ethereum-hsm.js';
import graphene from 'graphene-pk11';


// --- Configuration ---
const RPC_URL = process.env.RPC_URL;
const SAFE_ADDRESS = process.env.SAFE_ADDRESS;
const SIGNER_1_PRIVATE_KEY = process.env.PRIVATE_KEY;
const RECIPIENT_ADDRESS = '0x97542289b1453eB8e9C0f4af562ef7eb354DB75c';
const TBNB_AMOUNT = '0.1'; // Amount of tBNB to send

async function sendBnbFromSafeWithTwoSigners() {
    let hsmModule = null;
    let hsmSession = null;
    let ethereumKeys = null;
    let ethereumAddress = null;

    try {


    //    // Step 1: Initialize HSM
       console.log('🔧 Step 1: Initializing HSM...');
       hsmModule = initHSM();
       const slot = hsmModule.getSlots(0);

       if (!(slot.flags & graphene.SlotFlag.TOKEN_PRESENT)) {
           throw new Error('No HSM token found in slot');
       }

       console.log('🔐 Logging into HSM...');
       hsmSession = loginHSMCU(slot);
       
       console.log('🔑 Getting Ethereum key pair...');
       ethereumKeys = getEthereumKeyPair(hsmSession);

       console.log('📍 Deriving Ethereum address...');
       ethereumAddress = deriveEthereumAddress(ethereumKeys.publicKey);
       
       console.log(`✅ HSM initialized - Address: ${ethereumAddress}\n`);
       

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
          createCallAddress: process.env.CREATE_CALL_ADDRESS,
        }
      }

      console.log(CONTRACT_NETWORKS)
        // 1. Initialize the Safe Protocol Kit with the first signer
        const safeSDK = await Safe.init({
            provider: RPC_URL,
            signer: SIGNER_1_PRIVATE_KEY,
            safeAddress: SAFE_ADDRESS,
            contractNetworks: CONTRACT_NETWORKS // Uncomment if you have custom contract addresses
          });

        // 2. Create the transaction data
        const safeTransactionData = {
            to: RECIPIENT_ADDRESS,
            data: '0x',
            value: ethers.parseUnits(TBNB_AMOUNT, 'ether').toString(),
        };

        // 3. Create and sign the transaction with the first signer
        const safeTransaction = await safeSDK.createTransaction({
        transactions: [safeTransactionData]
        });

        await safeSDK.signTransaction(safeTransaction);

        
        const safeTxHash = await safeSDK.getTransactionHash(safeTransaction);

        console.log("Requesting signature from AWS CloudHSM...");
        const hsmSigner = {
            getAddress: () => ethereumAddress,
            signMessage: async (message) => {
                console.log(`🔐 Signing message with HSM: ${message}`);
                const signature = signEthereumMessage(
                    hsmSession,
                    ethereumKeys.privateKey,
                    ethereumKeys.publicKey,
                    message
                );
                console.log(`✅ Message signed: ${signature.signature}`);
                return signature.signature;
            }
        };

        // Add signature from HSM
        const sigHex = await hsmSigner.signMessage(safeTxHash);
        safeTransaction.addSignature({signer: ethereumAddress, data: sigHex, isContractSignature: false});
        
        // 5. Execute the transaction with both signatures
        console.log("Executing transaction with two signatures...");
        const txResponse = await safeSDK.executeTransaction(safeTransaction);

        console.log("Transaction broadcasted with hash:", txResponse.hash);

  } catch (error) {
    console.error("Failed to execute transaction:", error);
  }
}


// Run the function
sendBnbFromSafeWithTwoSigners().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});

