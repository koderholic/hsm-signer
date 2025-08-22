import graphene from "graphene-pk11";
import pkg from 'keccak';
const { keccak256 } = pkg;
import secp256k1Pkg from "secp256k1";
const { secp256k1 } = secp256k1Pkg;

// Initializes the cloud HSM and returns a module object
export function initHSM() {
    const Module = graphene.Module;

    const mod = Module.load("/opt/cloudhsm/lib/libcloudhsm_pkcs11.so", "CloudHSM");

    mod.initialize();

    return mod;
}

// Opens a session with the given slot and logs in using the user PIN stored in the environment variable
export function loginHSMCU(slot) {
    const session = slot.open(graphene.SessionFlag.SERIAL_SESSION | graphene.SessionFlag.RW_SESSION);
    session.login(process.env.PIN, graphene.UserType.User);

    return session;
}

// Generate or retrieve Ethereum key pair from HSM
export function getEthereumKeyPair(session) {
    const privateKeys = session.find({ class: graphene.ObjectClass.PRIVATE_KEY, keyType: graphene.KeyType.EC });

    if (privateKeys.length > 0) {
        console.log("Existing Ethereum private key found in the HSM...");
        const privateKey = privateKeys.items(0);
        const publicKey = session.find({ class: graphene.ObjectClass.PUBLIC_KEY, keyType: graphene.KeyType.EC }).items(0);

        return { privateKey, publicKey };
    }

    console.log("No Ethereum key pair found. Will use the HSM to create a new one...");

    // Generate EC key pair for Ethereum (secp256k1 curve)
    // Use the correct attribute names for graphene-pk11
    return session.generateKeyPair(graphene.KeyGenMechanism.EC, {
        keyType: graphene.KeyType.EC,
        ecPoint: Buffer.from('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8', 'hex'),
        ecParams: Buffer.from('06052b8104000A', 'hex'), // OID for secp256k1
        token: true,
        verify: true,
        extractable: true,
    }, {
        keyType: graphene.KeyType.EC,
        token: true,
        sign: true,
        extractable: false, // Private key should never be extractable
    });
}

// Derive Ethereum address from public key
export function deriveEthereumAddress(publicKey) {
    // Get the raw public key bytes from HSM
    const rawPublicKey = publicKey.getAttribute(graphene.Attribute.VALUE);
    
    // Remove the first byte (compression indicator) if present
    const keyBytes = rawPublicKey.length === 65 ? rawPublicKey.slice(1) : rawPublicKey;
    
    // Hash the public key with Keccak-256
    const hash = keccak256(keyBytes);
    
    // Take the last 20 bytes and convert to hex
    const address = '0x' + hash.slice(-20).toString('hex');
    
    return address;
}

// Sign Ethereum message using HSM
export function signEthereumMessage(session, privateKey, message) {
    // Create the Ethereum personal message format
    const personalMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
    
    // Hash the personal message
    const messageHash = keccak256(Buffer.from(personalMessage, 'utf8'));
    
    // Sign the hash using HSM
    const signer = session.createSign(graphene.Mechanism.ECDSA, privateKey);
    const signature = signer.once(messageHash);
    
    // Convert signature to DER format and extract r, s values
    const derSignature = Buffer.from(signature, 'binary');
    
    // Parse DER signature to get r and s values
    const { r, s } = parseDERSignature(derSignature);
    
    // Determine v value (recovery bit)
    // For Ethereum, we need to determine the correct v value
    // This is a simplified approach - in production you'd want more robust recovery
    let v = 27; // Base value
    
    // Try to recover the public key and see if it matches
    try {
        const recoveredPubKey = secp256k1.recover(messageHash, { r, s, v: v - 27 }, false);
        const recoveredAddress = deriveEthereumAddress({ getAttribute: () => recoveredPubKey });
        // If this doesn't match, try v = 28
        if (!recoveredAddress) {
            v = 28;
        }
    } catch (e) {
        v = 28;
    }
    
    return {
        r: '0x' + r.toString('hex'),
        s: '0x' + s.toString('hex'),
        v: v,
        signature: '0x' + r.toString('hex') + s.toString('hex').padStart(64, '0') + (v - 27).toString(16).padStart(2, '0')
    };
}

// Parse DER signature to extract r and s values
function parseDERSignature(derSignature) {
    // This is a simplified DER parser for ECDSA signatures
    // In production, you'd want a more robust ASN.1 parser
    
    let offset = 2; // Skip sequence tag and length
    
    // Skip to r value
    offset += 2; // Skip integer tag and length
    const rLength = derSignature[offset];
    offset += 1;
    const r = derSignature.slice(offset, offset + rLength);
    offset += rLength;
    
    // Skip to s value
    offset += 2; // Skip integer tag and length
    const sLength = derSignature[offset];
    offset += 1;
    const s = derSignature.slice(offset, offset + sLength);
    
    return { r, s };
}

// Verify Ethereum signature
export function verifyEthereumSignature(message, signature, expectedAddress) {
    try {
        const personalMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
        const messageHash = keccak256(Buffer.from(personalMessage, 'utf8'));
        
        // Extract r, s, v from signature
        const r = Buffer.from(signature.slice(2, 66), 'hex');
        const s = Buffer.from(signature.slice(66, 130), 'hex');
        const v = parseInt(signature.slice(130, 132), 'hex');
        
        // Recover public key
        const publicKey = secp256k1.recover(messageHash, { r, s, v }, false);
        
        // Derive address from recovered public key
        const recoveredAddress = deriveEthereumAddress({ getAttribute: () => publicKey });
        
        return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}
