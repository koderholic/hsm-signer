import graphene from "graphene-pk11";
import keccak256 from 'keccak';
import secp256k1Pkg from "secp256k1";
const { secp256k1 } = secp256k1Pkg;
import {
    ecrecover,
    fromRpcSig,
    keccak256 as etherKeccak,
  } from 'ethereumjs-util';

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
    let privateKeys = session.find({
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
        var keys = session.generateKeyPair(graphene.KeyGenMechanism.EC, {
            keyType: graphene.KeyType.EC,
            id: Buffer.from(KEY_ID),
            token: false,
            verify: true,
            // derive: true,
            paramsECDSA: graphene.NamedCurve.getByName("secp256k1").value,
            // private: false
        }, {
            keyType: graphene.KeyType.EC,
            id: Buffer.from(KEY_ID),
            token: false,
            sign: true,
            // derive: true
            // private: true,
            // sensitive: true
        });

        // console.log("The keys => ", keys);

        // return keys

        privateKeys = session.find({
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

}

export function deriveEthereumAddress(publicKey) {
 
    // 1. Extract EC point from HSM
    const ecPoint =  publicKey.getAttribute({pointEC: null}).pointEC
    // const ecPoint = publicKey.getAttribute("ecPoint");

    // 2. Decode ASN.1 OCTET STRING
    const rawPoint = decodeEcPoint(ecPoint); // [0x04 || X || Y]

    if (rawPoint[0] !== 0x04) {
        throw new Error("Only uncompressed EC points are supported");
    }

    // 3. Drop 0x04 prefix and get the 64-byte public key
    const keyBytes = rawPoint.slice(1);

    // 4. Console log the public key in hex format
    console.log("Public Key (uncompressed): 0x" + keyBytes.toString("hex"));

    // 5. Hash with Keccak-256
    const hash = keccak256('keccak256').update(keyBytes).digest();

    // 6. Last 20 bytes → Ethereum address
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
    const messageHash = keccak256('keccak256').update(Buffer.from(personalMessage, 'utf8')).digest();
    
    // var sign = session.createSign("ECDSA_SHA256", privateKey);
    // sign.update("simple text 1");
    // sign.update("simple text 2");
    // var signature = sign.final();

    // Sign the hash using HSM - try different ECDSA mechanisms
    let signer;
    try {
        signer = session.createSign(graphene.Mechanism.ECDSA_SHA256, privateKey);
    } catch (e) {
        try {
            signer = session.createSign(graphene.Mechanism.ECDSA, privateKey);
        } catch (e2) {
            // Use a basic mechanism object
            signer = session.createSign({ name: 'ECDSA' }, privateKey);
        }
    }
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
        // Check what functions are available in secp256k1
        console.log('Available secp256k1 functions:', Object.keys(secp256k1));
        
        // Try different function names that might exist
        let recoveredPubKey;
        if (secp256k1.recover) {
            recoveredPubKey = secp256k1.recover(messageHash, { r, s, v: v - 27 }, false);
        } else if (secp256k1.recoverPublicKey) {
            recoveredPubKey = secp256k1.recoverPublicKey(messageHash, { r, s, v: v - 27 }, false);
        } else if (secp256k1.ecdsaRecover) {
            recoveredPubKey = secp256k1.ecdsaRecover(messageHash, { r, s, v: v - 27 }, false);
        } else {
            console.log('No recovery function found in secp256k1');
            v = 28;
            return;
        }
        
        const recoveredAddress = deriveEthereumAddress({ getAttribute: () => recoveredPubKey });
        // If this doesn't match, try v = 28
        if (!recoveredAddress) {
            v = 28;
        }
    } catch (e) {
        console.log('Recovery error:', e);
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
    // Create the Ethereum personal message format
    const personalMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
    
    // Hash the personal message
    const messageHash = keccak256('keccak256').update(Buffer.from(personalMessage, 'utf8')).digest();
      
      // Parse the signature string into r, s, and v
      const sig = fromRpcSig(signature);
      
      // Recover public key
      const publicKey = ecrecover(messageHash, sig.v, sig.r, sig.s);
      
      // Derive address
      const recoveredAddress = '0x' + etherKeccak(publicKey).toString('hex').slice(-40);
      console.log("recoveredAddress => ", recoveredAddress)
      console.log("expectedAddress => ", expectedAddress)

      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }
