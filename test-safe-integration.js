#!/usr/bin/env node

/**
 * Test Script for Safe Transaction Confirmation
 * 
 * This script tests confirming a specific Safe transaction by hash.
 * It demonstrates the transaction confirmation flow using HSM signing.
 * 
 * Run with: node test-safe-integration.js
 */

import { SafeTransactionConfirmer } from './safe-transaction-confirm.js';
import { 
    initHSM, 
    loginHSMCU, 
    getEthereumKeyPair, 
    deriveEthereumAddress,
    signEthereumMessage
} from './ethereum-hsm.js';
import graphene from 'graphene-pk11';

// Test configuration - using Sepolia testnet
const TEST_CONFIG = {
    chainId: 11155111n, // Sepolia testnet
    safeAddress: '0x212f2EDFd22374dBef4f473ff709DBFC3BbD629f', // Your Safe address
    apiKey: process.env.SAFE_API_KEY || null, // Optional: Your Safe API key
    hsmSlot: 0, // HSM slot number
};

// Transaction hash to test confirmation
const TEST_TRANSACTION_HASH = '0x1663c7e2066a91a3ffb02b6668f6b54298d3256fbc669b6d519ad20d8c84361a';

async function testTransactionConfirmation() {
    console.log('🧪 Testing Safe Transaction Confirmation\n');
    console.log(`📝 Target transaction hash: ${TEST_TRANSACTION_HASH}\n`);
    
    let hsmModule = null;
    let hsmSession = null;
    let ethereumKeys = null;
    let ethereumAddress = null;
    
    try {
        // Step 1: Initialize HSM
        console.log('🔧 Step 1: Initializing HSM...');
        hsmModule = initHSM();
        const slot = hsmModule.getSlots(TEST_CONFIG.hsmSlot);

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
        
        
        // Step 2: Initialize Safe confirmer
        console.log('🏦 Step 2: Initializing Safe confirmer...');
        const confirmer = new SafeTransactionConfirmer({
            chainId: TEST_CONFIG.chainId,
            safeAddress: TEST_CONFIG.safeAddress,
            signerAddress: ethereumAddress,
            apiKey: TEST_CONFIG.apiKey
        });
        console.log(`✅ Safe confirmer initialized for Safe: ${TEST_CONFIG.safeAddress}\n`);
        
        // Step 3: Get transaction details
        console.log('🔍 Step 3: Fetching transaction details...');
        try {
            const transaction = await confirmer.getTransaction(TEST_TRANSACTION_HASH);
            console.log('✅ Transaction details retrieved:');
            console.log(`   Hash: ${transaction.safeTxHash}`);
            console.log(`   To: ${transaction.to}`);
            console.log(`   Value: ${transaction.value} wei`);
            console.log(`   Confirmations: ${transaction.confirmations?.length || 0}/${transaction.confirmationsRequired}`);
            console.log(`   Executed: ${transaction.isExecuted}\n`);
            
            // Step 4: Check if transaction can be confirmed
            console.log('🔍 Step 4: Checking if transaction can be confirmed...');
            const canConfirm = confirmer.canConfirmTransaction(transaction);
            
            if (!canConfirm.canConfirm) {
                console.log('❌ Transaction cannot be confirmed:');
                canConfirm.reasons.forEach(reason => console.log(`   - ${reason}`));
                console.log('\n📝 Update TEST_TRANSACTION_HASH with a valid pending transaction hash.\n');
                return;
            }
            
            console.log('✅ Transaction can be confirmed!\n');
            
            // Step 5: Create HSM signer
            console.log('🔐 Step 5: Creating HSM signer...');
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
            console.log('✅ HSM signer created\n');
            
            // Step 6: Confirm the transaction
            console.log('🚀 Step 6: Confirming transaction...');
            const result = await confirmer.confirmTransaction(TEST_TRANSACTION_HASH, hsmSigner);
            
            if (result.success) {
                console.log('🎉 Transaction confirmed successfully!');
                console.log(`📝 Signature: ${result.signature}`);
                console.log(`📊 Transaction details:`, {
                    hash: result.safeTxHash,
                    to: result.transaction.to,
                    value: result.transaction.value
                });
            } else {
                console.log('❌ Transaction confirmation failed:');
                console.log(`   Error: ${result.error}`);
                if (result.reasons) {
                    console.log(`   Reasons: ${result.reasons.join(', ')}`);
                }
            }
            
        } catch (error) {
            if (error.message.includes('Transaction not found')) {
                console.log('❌ Transaction not found in Safe Transaction Service');
                console.log('📝 This could mean:');
                console.log('   - The transaction hash is invalid');
                console.log('   - The transaction is not associated with this Safe');
                console.log('   - The transaction has been executed or rejected');
                console.log('\n💡 Update TEST_TRANSACTION_HASH with a valid pending transaction hash.');
            } else {
                throw error;
            }
        }
        
    } catch (error) {
        console.error('❌ Transaction confirmation test failed:', error);
        console.log('\n🔧 Troubleshooting:');
        console.log('1. Ensure HSM is connected and configured');
        console.log('2. Check your RPC URL configuration');
        console.log('3. Verify the transaction hash is valid');
        console.log('4. Ensure the Safe address is correct');
    } finally {
        // Cleanup HSM resources
        if (hsmSession) {
            try {
                hsmSession.logout();
                hsmSession.close();
                console.log('\n✅ HSM session closed');
            } catch (error) {
                console.error('❌ Error closing HSM session:', error);
            }
        }
        
        if (hsmModule) {
            try {
                hsmModule.finalize();
                console.log('✅ HSM module finalized');
            } catch (error) {
                console.error('❌ Error finalizing HSM module:', error);
            }
        }
    }
}

// Configuration validation
function validateConfig() {
    console.log('🔍 Validating configuration...\n');
    
    const issues = [];
    
    if (TEST_TRANSACTION_HASH === '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef') {
        issues.push('Transaction hash is placeholder - update TEST_TRANSACTION_HASH with real hash');
    }
    
    if (issues.length > 0) {
        console.log('⚠️  Configuration issues found:');
        issues.forEach(issue => console.log(`   - ${issue}`));
        console.log('\n📝 Update the configuration before running the test.\n');
    } else {
        console.log('✅ Configuration looks good!\n');
    }
}

// Run the test
console.log('🚀 Safe Transaction Confirmation Test\n');
validateConfig();
testTransactionConfirmation().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
