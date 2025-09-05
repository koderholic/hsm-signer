#!/usr/bin/env node

/**
 * Safe Transaction Confirmation Utility
 * 
 * This module provides functionality to confirm Safe transactions using transaction hashes.
 * It integrates with the Safe SDK to fetch transaction details and confirm them using HSM-signed signatures.
 * 
 * Usage:
 *   import { SafeTransactionConfirmer } from './safe-transaction-confirm.js';
 *   
 *   const confirmer = new SafeTransactionConfirmer({
 *     chainId: 1n, // Ethereum mainnet
 *     rpcUrl: 'https://your-ethereum-node',
 *     safeAddress: '0xYourSafeAddress',
 *     signerAddress: '0xYourSignerAddress'
 *   });
 *   
 *   await confirmer.confirmTransaction('0xTransactionHash');
 */

import SafeApiKit from '@safe-global/api-kit';
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

export class SafeTransactionConfirmer {
    constructor(config) {
        this.chainId = config.chainId;
        this.rpcUrl = config.rpcUrl;
        this.safeAddress = config.safeAddress;
        this.signerAddress = config.signerAddress;
        this.apiKey = config.apiKey || null;
        
        // Initialize Safe API Kit
        this.apiKit = new SafeApiKit({
            chainId: this.chainId,
            apiKey: this.apiKey
        });
        
        // Provider for Protocol Kit
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    }

    /**
     * Initialize the Protocol Kit with HSM signer
     * @param {Object} hsmSigner - HSM-based signer object
     * @returns {Promise<Safe>} Initialized Protocol Kit instance
     */
    async initializeProtocolKit(hsmSigner) {
        try {
            const protocolKit = await Safe.init({
                provider: this.provider,
                signer: hsmSigner,
                safeAddress: this.safeAddress
            });
            
            console.log(`✅ Safe Protocol Kit initialized for Safe: ${this.safeAddress}`);
            return protocolKit;
        } catch (error) {
            console.error('❌ Failed to initialize Protocol Kit:', error);
            throw error;
        }
    }

    /**
     * Get transaction details by hash
     * @param {string} safeTxHash - Safe transaction hash
     * @returns {Promise<Object>} Transaction details
     */
    async getTransaction(safeTxHash) {
        try {
            console.log(`🔍 Fetching transaction details for hash: ${safeTxHash}`);
            
            const transaction = await this.apiKit.getTransaction(safeTxHash);
            
            if (!transaction) {
                throw new Error(`Transaction not found: ${safeTxHash}`);
            }
            
            console.log(`✅ Transaction found:`, {
                safeTxHash: transaction.safeTxHash,
                to: transaction.to,
                value: transaction.value,
                data: transaction.data,
                confirmationsRequired: transaction.confirmationsRequired,
                confirmations: transaction.confirmations?.length || 0,
                isExecuted: transaction.isExecuted
            });
            
            return transaction;
        } catch (error) {
            console.error('❌ Failed to fetch transaction:', error);
            throw error;
        }
    }

    /**
     * Check if transaction can be confirmed
     * @param {Object} transaction - Transaction object from getTransaction
     * @returns {Object} Confirmation status
     */
    canConfirmTransaction(transaction) {
        const canConfirm = {
            canConfirm: false,
            reasons: []
        };

        if (transaction.isExecuted) {
            canConfirm.reasons.push('Transaction is already executed');
            return canConfirm;
        }

        if (!transaction.confirmations) {
            canConfirm.reasons.push('No confirmations found');
            return canConfirm;
        }

        // Check if signer has already confirmed
        const hasConfirmed = transaction.confirmations.some(
            conf => conf.owner.toLowerCase() === this.signerAddress.toLowerCase()
        );

        if (hasConfirmed) {
            canConfirm.reasons.push('Signer has already confirmed this transaction');
            return canConfirm;
        }

        // Check if enough confirmations exist
        const currentConfirmations = transaction.confirmations.length;
        const requiredConfirmations = transaction.confirmationsRequired;

        if (currentConfirmations >= requiredConfirmations) {
            canConfirm.reasons.push('Transaction already has enough confirmations');
            return canConfirm;
        }

        canConfirm.canConfirm = true;
        return canConfirm;
    }

    /**
     * Confirm a Safe transaction using HSM signature
     * @param {string} safeTxHash - Safe transaction hash
     * @param {Object} hsmSigner - HSM-based signer object
     * @returns {Promise<Object>} Confirmation result
     */
    async confirmTransaction(safeTxHash, hsmSigner) {
        try {
            console.log(`🚀 Starting transaction confirmation process for: ${safeTxHash}`);
            
            // Step 1: Get transaction details
            const transaction = await this.getTransaction(safeTxHash);
            
            // Step 2: Check if transaction can be confirmed
            const confirmationCheck = this.canConfirmTransaction(transaction);
            if (!confirmationCheck.canConfirm) {
                return {
                    success: false,
                    error: 'Cannot confirm transaction',
                    reasons: confirmationCheck.reasons,
                    transaction: transaction
                };
            }
            
            // Step 3: Initialize Protocol Kit
            const protocolKit = await this.initializeProtocolKit(hsmSigner);
            
            // Step 4: Sign the transaction hash
            console.log(`🔐 Signing transaction hash with HSM...`);
            const signature = await protocolKit.signHash(safeTxHash);
            
            console.log(`✅ Transaction hash signed successfully`);
            console.log(`📝 Signature: ${signature.data}`);
            
            // Step 5: Confirm the transaction
            console.log(`📤 Submitting confirmation to Safe Transaction Service...`);
            await this.apiKit.confirmTransaction(safeTxHash, signature.data);
            
            console.log(`🎉 Transaction confirmed successfully!`);
            
            return {
                success: true,
                safeTxHash: safeTxHash,
                signature: signature.data,
                transaction: transaction,
                message: 'Transaction confirmed successfully'
            };
            
        } catch (error) {
            console.error('❌ Failed to confirm transaction:', error);
            return {
                success: false,
                error: error.message,
                safeTxHash: safeTxHash
            };
        }
    }

    /**
     * Get pending transactions for the Safe
     * @returns {Promise<Array>} Array of pending transactions
     */
    async getPendingTransactions() {
        try {
            console.log(`🔍 Fetching pending transactions for Safe: ${this.safeAddress}`);
            
            const pendingTransactions = await this.apiKit.getPendingTransactions(this.safeAddress);
            
            console.log(`✅ Found ${pendingTransactions.results.length} pending transactions`);
            
            return pendingTransactions.results;
        } catch (error) {
            console.error('❌ Failed to fetch pending transactions:', error);
            throw error;
        }
    }

    /**
     * Get transaction history for the Safe
     * @param {number} limit - Number of transactions to fetch (default: 20)
     * @returns {Promise<Array>} Array of historical transactions
     */
    async getTransactionHistory(limit = 20) {
        try {
            console.log(`🔍 Fetching transaction history for Safe: ${this.safeAddress}`);
            
            const history = await this.apiKit.getTransactionsBySafe(this.safeAddress, {
                limit: limit
            });
            
            console.log(`✅ Found ${history.results.length} historical transactions`);
            
            return history.results;
        } catch (error) {
            console.error('❌ Failed to fetch transaction history:', error);
            throw error;
        }
    }
}

/**
 * Create an HSM-based signer for Safe transactions
 * This function should be called with your HSM session and keys
 * @param {Object} hsmSession - HSM session object
 * @param {Object} ethereumKeys - Ethereum key pair from HSM
 * @param {string} ethereumAddress - Ethereum address derived from HSM keys
 * @returns {Object} HSM-based signer object
 */
export function createHSMSigner(hsmSession, ethereumKeys, ethereumAddress) {
    return {
        getAddress: () => ethereumAddress,
        signMessage: async (message) => {
            // This would need to be implemented based on your HSM signing logic
            // You can use the signEthereumMessage function from your ethereum-hsm.js
            throw new Error('HSM signer implementation needed - integrate with your HSM signing logic');
        },
        signTransaction: async (transaction) => {
            // This would need to be implemented based on your HSM signing logic
            throw new Error('HSM signer implementation needed - integrate with your HSM signing logic');
        }
    };
}

/**
 * Example usage function
 * This demonstrates how to use the SafeTransactionConfirmer
 */
export async function exampleUsage() {
    // Configuration
    const config = {
        chainId: 1n, // Ethereum mainnet - change to your network
        rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY', // Replace with your RPC URL
        safeAddress: '0xYourSafeAddress', // Replace with your Safe address
        signerAddress: '0xYourSignerAddress', // Replace with your signer address
        apiKey: 'YOUR_SAFE_API_KEY' // Optional: Replace with your Safe API key
    };

    // Initialize confirmer
    const confirmer = new SafeTransactionConfirmer(config);

    try {
        // Example 1: Get pending transactions
        console.log('\n📋 Getting pending transactions...');
        const pendingTxs = await confirmer.getPendingTransactions();
        console.log('Pending transactions:', pendingTxs);

        // Example 2: Get transaction history
        console.log('\n📜 Getting transaction history...');
        const history = await confirmer.getTransactionHistory(10);
        console.log('Recent transactions:', history);

        // Example 3: Confirm a specific transaction (requires HSM signer)
        const safeTxHash = '0xYourTransactionHash'; // Replace with actual hash
        console.log(`\n🔐 Confirming transaction: ${safeTxHash}`);
        
        // Note: You would need to create an HSM signer here
        // const hsmSigner = createHSMSigner(hsmSession, ethereumKeys, ethereumAddress);
        // const result = await confirmer.confirmTransaction(safeTxHash, hsmSigner);
        // console.log('Confirmation result:', result);

    } catch (error) {
        console.error('❌ Example usage failed:', error);
    }
}

// Export default for easy importing
export default SafeTransactionConfirmer;
