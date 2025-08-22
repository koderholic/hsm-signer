import graphene from "graphene-pk11";
import pkg from 'keccak';
const { keccak256 } = pkg;
import secp256k1Pkg from "secp256k1";
const { secp256k1 } = secp256k1Pkg;

// Register ecParams (CKA_EC_PARAMS = 0x1806)
graphene.registerAttribute("ecParams", 0x1806, "buffer");
graphene.registerAttribute("unwrapTemplate", 0x4000021, "template");
graphene.registerAttribute("wrapTemplate", 0x4000020, "template");
graphene.registerAttribute("ecPoint", 0x180);
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
    const KEY_ID = "ethereum-key-01";
    // const KEY_LABEL = "Ethereum Key Pair";

    // // 1. Correctly find the key pair using a common ID
    const privateKeys = session.find({
        class: graphene.ObjectClass.PRIVATE_KEY,
        keyType: graphene.KeyType.EC,
        id: Buffer.from(KEY_ID)
    });

    if (privateKeys.length > 0) {
        console.log("Existing Ethereum key pair found in the HSM...");
        const privateKey = privateKeys.items(0);
        // Find the public key with the same ID
        const publicKey = session.find({
            class: graphene.ObjectClass.PUBLIC_KEY,
            keyType: graphene.KeyType.EC,
            id: Buffer.from(KEY_ID)
        }).items(0);

        console.log("public key => ", publicKey)
        return {
            privateKey,
            publicKey
        };
    }

    // console.log("No Ethereum key pair found. Will use the HSM to create a new one...");

    //     // 3. Generate new key pair using secp256k1
        
    // const publicKeyTemplate = {
    //     // class: graphene.ObjectClass.PUBLIC_KEY,
    //     // keyType: graphene.KeyType.EC,
    //     // ecParams: Buffer.from("06052B8104000A", "hex"), // secp256k1 OID
    //     // verify: true,
    //     // label: KEY_LABEL,
    //     // id: Buffer.from(KEY_ID),
    //     private: false
    //     // wrap: true, // allow this key to wrap other keys
    //     // // enforce constraints on keys being wrapped
    //     // wrapTemplate: [
    //     //     {
    //     //         type: sensitive, value: true,
    //     //     },
    //     //     {
    //     //         type: extractable, value: true
    //     //     }
    //     // ],
    // };


    // console.log("Came here")


    // const privateKeyTemplate = {
    //     // class: graphene.ObjectClass.PRIVATE_KEY,
    //     // keyType: graphene.KeyType.EC,
    //     // label: KEY_LABEL,
    //     // id: Buffer.from(KEY_ID),
    //     // sign: true,
    //     // extractable: false,
    //     // unwrap: false,
    //     sensitive: true,
    //     // unwrapTemplate: [
    //     //     {
    //     //         type: sensitive, value: true,
    //     //     },
    //     //     {
    //     //         type: extractable, value: false
    //     //     }
    //     // ],
    //     private: true
    // };

    // console.log("Got here")

    // const keyPair = session.generateKeyPair(
    //     graphene.MechanismEnum.EC_KEY_PAIR_GEN,
    //     publicKeyTemplate,
    //     privateKeyTemplate
    // );

    // console.log("Reached here")

    // return keyPair;

        // generate ECDSA key pair
        var keys = session.generateKeyPair(graphene.KeyGenMechanism.ECDSA, {
            keyType: graphene.KeyType.ECDSA,
            token: false,
            verify: true,
            paramsECDSA: graphene.NamedCurve.getByName("secp256k1").value
        }, {
            keyType: graphene.KeyType.ECDSA,
            token: false,
            sign: true
        });

        return keys

}

// Derive Ethereum address from public key
export function deriveEthereumAddress(publicKey) {
    // 1. Extract EC point from HSM
    const ecPoint = publicKey.getAttribute("ecPoint");

    // 2. Decode ASN.1 OCTET STRING
    const rawPoint = decodeEcPoint(ecPoint); // [0x04 || X || Y]

    if (rawPoint[0] !== 0x04) {
        throw new Error("Only uncompressed EC points are supported");
    }

    // 3. Drop 0x04 prefix
    const keyBytes = rawPoint.slice(1);

    // 4. Hash with Keccak-256
    const hash = keccak256(keyBytes);

    // 5. Last 20 bytes → Ethereum address
    return "0x" + hash.slice(-20).toString("hex");
}

function decodeEcPoint(ecPointBuffer) {
    if (ecPointBuffer[0] !== 0x04) throw new Error("Expected OCTET STRING");
    const len = ecPointBuffer[1];
    return ecPointBuffer.slice(2, 2 + len);
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
