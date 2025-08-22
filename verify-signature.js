#!/usr/bin/env node

/**
 * Standalone Ethereum Signature Verification Script
 * 
 * This script can be used anywhere to verify Ethereum signatures
 * without needing the HSM service running
 * 
 * Usage: node verify-signature.js <message> <signature> <address>
 * Example: node verify-signature.js "Hello, Ethereum!" 0x... 0x...
 */

import { keccak256 } from "keccak";
import { secp256k1 } from "secp256k1";

function deriveEthereumAddress(publicKey) {
    // Remove the first byte (compression indicator) if present
    const keyBytes = publicKey.length === 65 ? publicKey.slice(1) : publicKey;
    
    // Hash the public key with Keccak-256
    const hash = keccak256(keyBytes);
    
    // Take the last 20 bytes and convert to hex
    const address = '0x' + hash.slice(-20).toString('hex');
    
    return address;
}

function verifyEthereumSignature(message, signature, expectedAddress) {
    try {
        console.log(`🔍 Verifying signature...`);
        console.log(`   Message: "${message}"`);
        console.log(`   Signature: ${signature}`);
        console.log(`   Expected Address: ${expectedAddress}`);
        console.log('');
        
        // Create the Ethereum personal message format
        const personalMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
        
        // Hash the personal message
        const messageHash = keccak256(Buffer.from(personalMessage, 'utf8'));
        console.log(`   Message Hash: 0x${messageHash.toString('hex')}`);
        
        // Extract r, s, v from signature
        if (!signature.startsWith('0x') || signature.length !== 132) {
            throw new Error('Invalid signature format. Expected 0x followed by 130 hex characters.');
        }
        
        const r = Buffer.from(signature.slice(2, 66), 'hex');
        const s = Buffer.from(signature.slice(66, 130), 'hex');
        const v = parseInt(signature.slice(130, 132), 'hex');
        
        console.log(`   Signature Components:`);
        console.log(`     r: 0x${r.toString('hex')}`);
        console.log(`     s: 0x${s.toString('hex')}`);
        console.log(`     v: ${v}`);
        console.log('');
        
        // Try to recover public key with v = 27
        let publicKey = null;
        let recoveryBit = 0;
        
        try {
            publicKey = secp256k1.recover(messageHash, { r, s, v: 0 }, false);
            recoveryBit = 0;
        } catch (e) {
            try {
                publicKey = secp256k1.recover(messageHash, { r, s, v: 1 }, false);
                recoveryBit = 1;
            } catch (e2) {
                throw new Error('Could not recover public key from signature');
            }
        }
        
        console.log(`   Recovered Public Key: 0x${publicKey.toString('hex')}`);
        console.log(`   Recovery Bit: ${recoveryBit}`);
        
        // Derive address from recovered public key
        const recoveredAddress = deriveEthereumAddress(publicKey);
        console.log(`   Recovered Address: ${recoveredAddress}`);
        console.log('');
        
        // Compare addresses
        const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
        
        if (isValid) {
            console.log(`✅ Signature verification successful!`);
            console.log(`   The signature is valid for the given message and address.`);
        } else {
            console.log(`❌ Signature verification failed!`);
            console.log(`   Expected: ${expectedAddress}`);
            console.log(`   Recovered: ${recoveredAddress}`);
        }
        
        return isValid;
        
    } catch (error) {
        console.error(`❌ Signature verification error: ${error.message}`);
        return false;
    }
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    
    if (args.length !== 3) {
        console.error('❌ Usage: node verify-signature.js <message> <signature> <address>');
        console.error('');
        console.error('Example:');
        console.error('  node verify-signature.js "Hello, Ethereum!" 0x1234... 0xabcd...');
        console.error('');
        console.error('Note: This script requires the following npm packages:');
        console.error('  npm install keccak secp256k1');
        process.exit(1);
    }
    
    const [message, signature, address] = args;
    
    console.log('🔐 Ethereum Signature Verification Tool');
    console.log('=====================================');
    console.log('');
    
    const isValid = verifyEthereumSignature(message, signature, address);
    
    console.log('');
    if (isValid) {
        console.log('🎉 Verification completed successfully!');
        process.exit(0);
    } else {
        console.log('💥 Verification failed!');
        process.exit(1);
    }
}

// Check if required packages are available
try {
    // Test imports
    keccak256(Buffer.from('test'));
    secp256k1;
} catch (error) {
    console.error('❌ Required packages not found.');
    console.error('');
    console.error('Please install the required packages:');
    console.error('  npm install keccak secp256k1');
    console.error('');
    console.error('Or if you have a package.json, run:');
    console.error('  npm install');
    process.exit(1);
}

// Run the verification
main();
