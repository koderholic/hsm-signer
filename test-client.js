#!/usr/bin/env node

/**
 * Test Client for Ethereum HSM Signing Service
 * 
 * This script helps test the signing service endpoints
 * Run with: node test-client.js <base-url>
 * Example: node test-client.js http://localhost:3756
 */

const baseUrl = process.argv[2] || 'http://localhost:3756';

console.log(`🧪 Testing Ethereum HSM Signing Service at: ${baseUrl}\n`);

async function testEndpoint(method, path, body = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(`${baseUrl}${path}`, options);
        const data = await response.json();
        
        console.log(`✅ ${method} ${path} - Status: ${response.status}`);
        console.log(`   Response:`, JSON.stringify(data, null, 2));
        console.log('');
        
        return { success: true, data, status: response.status };
    } catch (error) {
        console.log(`❌ ${method} ${path} - Error: ${error.message}`);
        console.log('');
        return { success: false, error: error.message };
    }
}

async function runTests() {
    console.log('🚀 Starting tests...\n');
    
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const healthResult = await testEndpoint('GET', '/health');
    
    // Test 2: Get account info
    console.log('2️⃣ Testing account endpoint...');
    const accountResult = await testEndpoint('GET', '/account');
    
    // Test 3: Sign a message
    console.log('3️⃣ Testing message signing...');
    const signResult = await testEndpoint('POST', '/sign', {
        message: 'Hello, Ethereum HSM!'
    });
    
    // Test 4: Verify signature (if signing was successful)
    if (signResult.success && signResult.data.signature) {
        console.log('4️⃣ Testing signature verification...');
        const verifyResult = await testEndpoint('POST', '/verify', {
            message: 'Hello, Ethereum HSM!',
            signature: signResult.data.signature,
            address: signResult.data.address
        });
        
        if (verifyResult.success && verifyResult.data.verified) {
            console.log('🎉 All tests passed! Your Ethereum HSM signing service is working correctly.');
        } else {
            console.log('⚠️  Signature verification failed. Check the HSM configuration.');
        }
    } else {
        console.log('⚠️  Skipping signature verification test due to signing failure.');
    }
    
    // Test 5: Show help
    console.log('5️⃣ Testing help endpoint...');
    await testEndpoint('GET', '/test');

    // Test 6: Send 0.122 ETH to given address on Sepolia
    console.log('6️⃣ Testing send-eth endpoint (0.122 ETH to 0x1117...598c)...');
    // Fetch sender address to display balance
    const acctInfo = await testEndpoint('GET', '/account');
    const fromAddress = acctInfo?.data?.address;
    console.log('From address:', fromAddress);
    // You must provide realistic nonce/gas for your account; optionally, you can prefetch via RPC.
    // Here we expect the server to be provided with correct params; adjust as needed.
    const to = '0x229ef326FE08C8b2423B786052D7E1a1AdDaD226';
    // Example: set gas values conservatively; you may adjust based on network
    const sendResult = await testEndpoint('POST', '/send-eth', {
        to,
        // 0.122 ETH (server supports valueEth or valueWei)
        valueEth: '0.122',
        // example gas price and limit; consider fetching from RPC for accuracy
        gasPriceWei: '0x3b9aca00', // 1 gwei
        gasLimit: '0x5208',        // 21000
        // nonce must match the HSM account; set it before running the test
        // replace this placeholder with your actual nonce
        nonce: '0x0'
    });
    if (!sendResult.success) {
        console.log('⚠️  send-eth failed. Ensure nonce/gas params are correct for your account.');
    }
    
    console.log('🏁 Test suite completed!');
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
    console.error('❌ This script requires Node.js 18+ for native fetch support');
    console.error('   Please upgrade Node.js or install node-fetch package');
    process.exit(1);
}

// Run the tests
runTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});
