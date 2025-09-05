#!/usr/bin/env node

/**
 * Safe Integration Example
 * 
 * This example demonstrates how to integrate Safe transaction confirmation
 * with your existing HSM-based Ethereum signing service.
 * 
 * Run with: node safe-integration-example.js
 */

import { SafeTransactionConfirmer, createHSMSigner } from './safe-transaction-confirm.js';
import { 
    initHSM, 
    loginHSMCU, 
    getEthereumKeyPair, 
    deriveEthereumAddress,
    signEthereumMessage
} from './ethereum-hsm.js';
import graphene from 'graphene-pk11';

// Configuration - Update these values for your setup
const CONFIG = {
    // Network configuration
    chainId: 11155111n, // Sepolia testnet - change to your network
    rpcUrl: process.env.RPC_URL, // Replace with your RPC URL
    safeAddress: '0x4b68d95191F9bc9319BBD648895Dd758aa0F7bCF', // Replace with your Safe address
    apiKey: process.env.SAFE_API_KEY, // Optional: Replace with your Safe API key
    
    // HSM configuration
    hsmSlot: 0, // HSM slot number
};

class HSMSafeIntegration {
    constructor(config) {
        this.config = config;
        this.hsmModule = null;
        this.hsmSession = null;
        this.ethereumKeys = null;
        this.ethereumAddress = null;
        this.safeConfirmer = null;
    }

    /**
     * Initialize HSM and Safe integration
     */
    async initialize() {
        try {
            console.log('🚀 Initializing HSM and Safe integration...\n');
            
            // Step 1: Initialize HSM
            await this.initializeHSM();
            
            // Step 2: Initialize Safe confirmer
            await this.initializeSafeConfirmer();
            
            console.log('✅ HSM and Safe integration initialized successfully!\n');
            
        } catch (error) {
            console.error('❌ Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Initialize HSM connection and get Ethereum keys
     */
    async initializeHSM() {
        console.log('🔧 Initializing HSM...');
        
        this.hsmModule = initHSM();
        const slot = this.hsmModule.getSlots(this.config.hsmSlot);

        if (!(slot.flags & graphene.SlotFlag.TOKEN_PRESENT)) {
            throw new Error('No HSM token found in slot');
        }

        console.log('🔐 Logging into HSM...');
        this.hsmSession = loginHSMCU(slot);
        
        console.log('🔑 Getting Ethereum key pair...');
        this.ethereumKeys = getEthereumKeyPair(this.hsmSession);

        console.log('📍 Deriving Ethereum address...');
        this.ethereumAddress = deriveEthereumAddress(this.ethereumKeys.publicKey);
        
        console.log(`✅ HSM initialized - Address: ${this.ethereumAddress}\n`);
    }

    /**
     * Initialize Safe transaction confirmer
     */
    async initializeSafeConfirmer() {
        console.log('🏦 Initializing Safe transaction confirmer...');
        
        this.safeConfirmer = new SafeTransactionConfirmer({
            chainId: this.config.chainId,
            rpcUrl: this.config.rpcUrl,
            safeAddress: this.config.safeAddress,
            signerAddress: this.ethereumAddress,
            apiKey: this.config.apiKey
        });
        
        console.log(`✅ Safe confirmer initialized for Safe: ${this.config.safeAddress}\n`);
    }

    /**
     * Create HSM-based signer for Safe transactions
     */
    createHSMSigner() {
        return {
            getAddress: () => this.ethereumAddress,
            signMessage: async (message) => {
                console.log(`🔐 Signing message with HSM: ${message}`);
                
                // Use your existing HSM signing logic
                const signature = signEthereumMessage(
                    this.hsmSession,
                    this.ethereumKeys.privateKey,
                    this.ethereumKeys.publicKey,
                    message
                );
                
                return signature.signature;
            },
            signTransaction: async (transaction) => {
                // This would need to be implemented based on your transaction signing needs
                throw new Error('Transaction signing not implemented in this example');
            }
        };
    }

    /**
     * List pending transactions for the Safe
     */
    async listPendingTransactions() {
        try {
            console.log('📋 Fetching pending transactions...\n');
            
            const pendingTxs = await this.safeConfirmer.getPendingTransactions();
            
            if (pendingTxs.length === 0) {
                console.log('✅ No pending transactions found.\n');
                return [];
            }
            
            console.log(`📊 Found ${pendingTxs.length} pending transactions:\n`);
            
            pendingTxs.forEach((tx, index) => {
                console.log(`${index + 1}. Transaction Hash: ${tx.safeTxHash}`);
                console.log(`   To: ${tx.to}`);
                console.log(`   Value: ${tx.value} wei`);
                console.log(`   Confirmations: ${tx.confirmations?.length || 0}/${tx.confirmationsRequired}`);
                console.log(`   Executed: ${tx.isExecuted}`);
                console.log('');
            });
            
            return pendingTxs;
            
        } catch (error) {
            console.error('❌ Failed to fetch pending transactions:', error);
            throw error;
        }
    }

    /**
     * Confirm a specific transaction by hash
     */
    async confirmTransaction(safeTxHash) {
        try {
            console.log(`🔐 Confirming transaction: ${safeTxHash}\n`);
            
            const hsmSigner = this.createHSMSigner();
            const result = await this.safeConfirmer.confirmTransaction(safeTxHash, hsmSigner);
            
            if (result.success) {
                console.log('🎉 Transaction confirmed successfully!');
                console.log(`📝 Signature: ${result.signature}`);
            } else {
                console.log('❌ Transaction confirmation failed:');
                console.log(`   Error: ${result.error}`);
                if (result.reasons) {
                    console.log(`   Reasons: ${result.reasons.join(', ')}`);
                }
            }
            
            return result;
            
        } catch (error) {
            console.error('❌ Failed to confirm transaction:', error);
            throw error;
        }
    }

    /**
     * Get transaction history
     */
    async getTransactionHistory(limit = 10) {
        try {
            console.log(`📜 Fetching transaction history (last ${limit} transactions)...\n`);
            
            const history = await this.safeConfirmer.getTransactionHistory(limit);
            
            if (history.length === 0) {
                console.log('✅ No transaction history found.\n');
                return [];
            }
            
            console.log(`📊 Found ${history.length} historical transactions:\n`);
            
            history.forEach((tx, index) => {
                console.log(`${index + 1}. Transaction Hash: ${tx.safeTxHash}`);
                console.log(`   To: ${tx.to}`);
                console.log(`   Value: ${tx.value} wei`);
                console.log(`   Executed: ${tx.isExecuted}`);
                console.log(`   Timestamp: ${new Date(tx.submissionDate).toLocaleString()}`);
                console.log('');
            });
            
            return history;
            
        } catch (error) {
            console.error('❌ Failed to fetch transaction history:', error);
            throw error;
        }
    }

    /**
     * Interactive menu for Safe operations
     */
    async showMenu() {
        console.log('🏦 Safe HSM Integration Menu\n');
        console.log('1. List pending transactions');
        console.log('2. Confirm transaction by hash');
        console.log('3. View transaction history');
        console.log('4. Exit\n');
        
        // In a real application, you would implement interactive input here
        // For this example, we'll just demonstrate the functionality
        console.log('📝 Note: This is a demonstration. In a real application,');
        console.log('   you would implement interactive input to select options.\n');
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        console.log('🧹 Cleaning up resources...');
        
        if (this.hsmSession) {
            try {
                this.hsmSession.logout();
                this.hsmSession.close();
                console.log('✅ HSM session closed');
            } catch (error) {
                console.error('❌ Error closing HSM session:', error);
            }
        }
        
        if (this.hsmModule) {
            try {
                this.hsmModule.finalize();
                console.log('✅ HSM module finalized');
            } catch (error) {
                console.error('❌ Error finalizing HSM module:', error);
            }
        }
    }
}

/**
 * Example usage function
 */
async function runExample() {
    const integration = new HSMSafeIntegration(CONFIG);
    
    try {
        // Initialize the integration
        await integration.initialize();
        
        // Show menu
        await integration.showMenu();
        
        // Example 1: List pending transactions
        console.log('📋 Example 1: Listing pending transactions...');
        await integration.listPendingTransactions();
        
        // Example 2: Get transaction history
        console.log('📜 Example 2: Getting transaction history...');
        await integration.getTransactionHistory(5);
        
        // Example 3: Confirm a transaction (commented out - requires actual transaction hash)
        // console.log('🔐 Example 3: Confirming transaction...');
        // await integration.confirmTransaction('0xYourTransactionHash');
        
        console.log('✅ Example completed successfully!');
        
    } catch (error) {
        console.error('❌ Example failed:', error);
    } finally {
        // Cleanup
        integration.cleanup();
    }
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runExample().catch(error => {
        console.error('❌ Example execution failed:', error);
        process.exit(1);
    });
}

export default HSMSafeIntegration;
