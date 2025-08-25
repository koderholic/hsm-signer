import cors from "cors";
import express from "express";
import graphene from "graphene-pk11";
import { 
    initHSM, 
    loginHSMCU, 
    getEthereumKeyPair, 
    deriveEthereumAddress,
    signEthereumMessage,
    verifyEthereumSignature,
    signAndSendEtherTransaction
} from "./ethereum-hsm.js";

const app = express();
const PORT = process.env.PORT || 3756;

// Global variables to store HSM session and keys
let hsmModule = null;
let hsmSession = null;
let ethereumKeys = null;
let ethereumAddress = null;

app.use(cors());
app.use(express.json());

// Initialize HSM and get Ethereum keys
async function initializeHSM() {
    try {
        console.log("Initializing HSM...");
        hsmModule = initHSM();
        const slot = hsmModule.getSlots(0);

        if (slot.flags & graphene.SlotFlag.TOKEN_PRESENT) {
            console.log("HSM slot found, logging in...");
            hsmSession = loginHSMCU(slot);
            
            console.log("Getting Ethereum key pair...");
            ethereumKeys = getEthereumKeyPair(hsmSession);

            console.log("Finished getting keys")
            
            console.log("Deriving Ethereum address...");
            ethereumAddress = deriveEthereumAddress(ethereumKeys.publicKey);
            
            console.log(`✅ HSM initialized successfully!`);
            console.log(`📝 Ethereum address: ${ethereumAddress}`);
            console.log(`🔑 Keys stored securely in HSM`);
            
            return true;
        } else {
            console.error("❌ No HSM token found in slot");
            return false;
        }
    } catch (error) {
        console.error("❌ Failed to initialize HSM:", error);
        return false;
    }
}

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ 
        status: "healthy", 
        hsmConnected: hsmSession !== null,
        ethereumAddress: ethereumAddress || null
    });
});

// Get account information
app.get("/account", (req, res) => {
    if (!ethereumAddress) {
        return res.status(503).json({ 
            error: "HSM not initialized", 
            message: "Please wait for HSM initialization to complete" 
        });
    }
    
    res.json({
        address: ethereumAddress,
        hsmConnected: true,
        message: "Ethereum account ready for signing"
    });
});

// Sign Ethereum message
app.post("/sign", (req, res) => {
    if (!hsmSession || !ethereumKeys) {
        return res.status(503).json({ 
            error: "HSM not ready", 
            message: "HSM is still initializing or not connected" 
        });
    }

    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ 
            error: "Missing message", 
            message: "Please provide a message to sign" 
        });
    }

    try {
        console.log(`📝 Signing message: "${message}"`);
        
        const signature = signEthereumMessage(hsmSession, ethereumKeys.privateKey, ethereumKeys.publicKey, message);
        
        console.log(`✅ Message signed successfully`);
        console.log(`🔐 Signature: ${signature.signature}`);
        
        res.json({
            success: true,
            message: message,
            signature: signature.signature,
            r: signature.r,
            s: signature.s,
            v: signature.v,
            address: ethereumAddress
        });
        
    } catch (error) {
        console.error("❌ Failed to sign message:", error);
        res.status(500).json({ 
            error: "Signing failed", 
            message: error.message 
        });
    }
});

// Verify signature
app.post("/verify", (req, res) => {
    const { message, signature, address } = req.body;
    
    if (!message || !signature || !address) {
        return res.status(400).json({ 
            error: "Missing parameters", 
            message: "Please provide message, signature, and address" 
        });
    }

    try {
        console.log(`🔍 Verifying signature for message: "${message}"`);
        console.log(`📝 Signature: ${signature}`);
        console.log(`📍 Address: ${address}`);
        
        const isValid = verifyEthereumSignature(message, signature, address);
        
        if (isValid) {
            console.log(`✅ Signature verification successful!`);
            res.json({
                success: true,
                message: "Signature is valid",
                verified: true,
                message: message,
                signature: signature,
                address: address
            });
        } else {
            console.log(`❌ Signature verification failed!`);
            res.json({
                success: false,
                message: "Signature is invalid",
                verified: false,
                message: message,
                signature: signature,
                address: address
            });
        }
        
    } catch (error) {
        console.error("❌ Signature verification error:", error);
        res.status(500).json({ 
            error: "Verification failed", 
            message: error.message 
        });
    }
});

// Send ETH (legacy type-0) via HSM-signed transaction
app.post("/send-eth", async (req, res) => {
    if (!hsmSession || !ethereumKeys) {
        return res.status(503).json({ 
            error: "HSM not ready", 
            message: "HSM is still initializing or not connected" 
        });
    }

    const { to, valueEth, gasLimit, data, chainId } = req.body || {};
    if (!to || (!valueWei && !valueEth) || !gasPriceWei || !gasLimit || nonce === undefined) {
        return res.status(400).json({
            error: "Missing parameters",
            message: "Required: to, (valueWei or valueEth), gasPriceWei, gasLimit, nonce"
        });
    }

    try {
        // Convert valueEth to valueWei if provided
        let valueToUse = valueWei;
        if (!valueWei && valueEth) {
            valueToUse = ethToWeiHex(valueEth);
        }
        const txHash = await signAndSendEtherTransaction(
            hsmSession,
            ethereumKeys.privateKey,
            ethereumKeys.publicKey,
            { to, from: ethereumAddress, valueWei: valueToUse, gasLimit, data, chainId }
        );
        res.json({ success: true, txHash });
    } catch (error) {
        console.error("❌ send-eth failed:", error);
        res.status(500).json({ error: "send-eth failed", message: error.message });
    }
});

function ethToWeiHex(ethStr) {
    // Convert a decimal string (e.g., "0.122") to a 0x-prefixed wei hex string
    const [intPart, fracPartRaw] = String(ethStr).split('.')
    const fracPart = (fracPartRaw || '').slice(0, 18) // max 18 decimals
    const paddedFrac = (fracPart + '0'.repeat(18)).slice(0, 18)
    const weiStr = BigInt(intPart || '0') * 10n**18n + BigInt(paddedFrac || '0')
    return '0x' + weiStr.toString(16)
}

// Test endpoint for development
app.get("/test", (req, res) => {
    res.json({
        message: "Ethereum HSM Signing Service is running!",
        endpoints: {
            "GET /health": "Check service health and HSM status",
            "GET /account": "Get Ethereum account information",
            "POST /sign": "Sign a message with HSM",
            "POST /verify": "Verify a signature",
            "GET /test": "This help message"
        },
        example: {
            sign: {
                method: "POST",
                url: "/sign",
                body: { message: "Hello, Ethereum!" }
            },
            verify: {
                method: "POST", 
                url: "/verify",
                body: { 
                    message: "Hello, Ethereum!", 
                    signature: "0x...", 
                    address: "0x..." 
                }
            }
        }
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (hsmSession) {
        try {
            hsmSession.logout();
            hsmSession.close();
            console.log('✅ HSM session closed');
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
    process.exit(0);
});

// Start server
app.listen(PORT, async () => {
    console.log(`🚀 Ethereum HSM Signing Service starting on port ${PORT}`);
    console.log(`🔧 Initializing HSM...`);
    
    const hsmReady = await initializeHSM();
    
    if (hsmReady) {
        console.log(`🎉 Service ready! Available endpoints:`);
        console.log(`   GET  /health   - Service health check`);
        console.log(`   GET  /account  - Get Ethereum account info`);
        console.log(`   POST /sign     - Sign a message`);
        console.log(`   POST /verify   - Verify a signature`);
        console.log(`   POST /send-eth - Send ETH (legacy txn)`);
        console.log(`   GET  /test     - Show help and examples`);
    } else {
        console.log(`⚠️  Service started but HSM is not ready`);
        console.log(`   Check HSM configuration and try again`);
    }
});
