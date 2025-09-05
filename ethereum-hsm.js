import graphene from "graphene-pk11";
import keccak256 from 'keccak';
import {
    ecrecover,
    fromRpcSig,
    keccak256 as etherKeccak,
} from 'ethereumjs-util';
import { Buffer } from 'buffer'; // Node.js Buffer is often implicitly available, but good to be explicit
import pkg from '@ethersproject/rlp';
const { encode: rlpEncode } = pkg;


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
    const KEY_LABEL = "Ethereum Key Pair";

    // 1. Correctly find the key pair using a common ID
    let privateKeys = session.find({
        class: graphene.ObjectClass.PRIVATE_KEY,
        keyType: graphene.KeyType.EC,
        id: Buffer.from(KEY_ID)
    });

    if (privateKeys.length > 0) {
        console.log("Found exisiting keys ");

        const privateKey = privateKeys.items(0);
        // Find the public key with the same ID
        const publicKey = session.find({
            class: graphene.ObjectClass.PUBLIC_KEY,
            keyType: graphene.KeyType.EC,
            id: Buffer.from(KEY_ID)
        }).items(0);

        return {
            privateKey,
            publicKey
        };
    }

        // generate ECDSA key pair
        console.log("generating new address")
        var keys = session.generateKeyPair(graphene.KeyGenMechanism.EC, {
            keyType: graphene.KeyType.EC,
            id: Buffer.from(KEY_ID),
            token: true,
            verify: true,
            paramsEC: graphene.NamedCurve.getByName("secp256k1").value,
        }, {
            keyType: graphene.KeyType.EC,
            id: Buffer.from(KEY_ID),
            token: true,
            sign: true,
        });

        return keys;

}

export function deriveEthereumAddress(publicKey) {
 
    // 1. Extract EC point from HSM
    const ecPoint =  publicKey.getAttribute({pointEC: null}).pointEC

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


/**
 * Signs an Ethereum personal message using a PKCS#11 private key
 * and returns the signature in the Ethereum (r, s, v) format.
 *
 * @param {graphene.Session} session The PKCS#11 session.
 * @param {graphene.NativeKey} privateKey The PKCS#11 private key object for signing.
 * @param {graphene.NativeKey} publicKey The PKCS#11 public key object associated with the private key.
 * @param {string} message The message to be signed.
 * @returns {object} An object containing the r, s, v components and the full 0x-prefixed signature.
 */
export function signEthereumMessage(session, privateKey, publicKey, message) {
    // 1. Create the Ethereum personal message format
    // const personalMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;
    
    // 2. Hash the personal message using Keccak-256
    // const messageHash = keccak256('keccak256').update(Buffer.from(personalMessage, 'utf8')).digest();
    
    // 3. Sign the message hash using the HSM
    // Ensure the mechanism is 'ECDSA' for raw secp256k1 signatures
    const sign = session.createSign("ECDSA", privateKey);
    const signatureRS = sign.once(Buffer.from(message, 'hex')); // signatureRS will be a Buffer (r || s)
    // keccak256Hash(Buffer.from(rlpUnsigned.slice(2), 'hex'))
    console.log("Raw ECDSA signature (r || s):", signatureRS.toString("hex"));

    // 4. Extract r and s components (each 32 bytes for secp256k1)
    const r = signatureRS.subarray(0, 32);
    const s = signatureRS.subarray(32, 64);

    // 5. Get the raw uncompressed public key bytes from the HSM's publicKey object
    const ecPoint = publicKey.getAttribute({ pointEC: null }).pointEC; // [0x04 || X || Y]
    const rawPoint = decodeEcPoint(ecPoint); // [0x04 || X || Y]
    if (rawPoint[0] !== 0x04) {
        throw new Error("Only uncompressed EC points are supported from the HSM public key.");
    }
    const rawPublicKeyBytes = rawPoint.slice(1); // X || Y (64 bytes)
    
    let v; // Recovery ID
    let recoveredPub;

    // 6. Determine the v (recovery ID) value
    // Iterate through possible v values (0 and 1, which map to 27 and 28)
    for (let i = 0; i < 2; i++) {
        try {
            // ethUtil.ecrecover expects the message hash, v, r, and s
            // The v value in ecrecover is 0 or 1, which internally gets converted to 27 or 28.
            recoveredPub = ecrecover(messageHash, i, r, s);
            // Compare the recovered public key with the actual public key from the HSM
            if (recoveredPub.toString('hex') === rawPublicKeyBytes.toString('hex')) {
                console.log("recoveredPub == > ", recoveredPub)
                console.log("rawPublicKeyBytes == > ", rawPublicKeyBytes.toString('hex'))

               v = i + 27 + 4; // Ethereum's v values are typically 27 or 28
            //    v = i; // Ethereum's v values are typically 27 or 28
            //  v = BigInt(chainId) * 2n + 35n + BigInt(v);
            
                break;
            }
        } catch (e) {
            // Handle potential errors during recovery (e.g., invalid signature components)
            console.warn(`Attempted recovery with v_candidate=${i} failed: ${e.message}`);
        }
    }

    if (v === undefined) {
        throw new Error("Could not determine the correct recovery ID (v) for the signature.");
    }
    
    // 7. Format the output as an Ethereum signature
    // The final signature is r (32 bytes) + s (32 bytes) + v (1 byte)
    // s must be padded to 64 hex characters (32 bytes)
    const finalSignatureBuffer = Buffer.concat([r, s, Buffer.from([v])]);
    const fullEthSignature = '0x' + finalSignatureBuffer.toString('hex');

    console.log("Ethereum Signature (r, s, v components):", {
        r: '0x' + r.toString('hex'),
        s: '0x' + s.toString('hex'),
        v: v
    });
    console.log("Full Ethereum Signature String:", fullEthSignature);

    return {
        r: '0x' + r.toString('hex'),
        s: '0x' + s.toString('hex'),
        v: v,
        signature: fullEthSignature // This is the full 65-byte R, S, V signature as a hex string
    };
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


      return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

// --------------------------
// Transaction signing helpers
// --------------------------

function toBufferFromHexOrNumber(value) {
    if (value === undefined || value === null) return Buffer.alloc(0);
    if (typeof value === 'string') {
        const hex = value.startsWith('0x') ? value.slice(2) : value;
        if (hex.length === 0) return Buffer.alloc(0);
        const buf = Buffer.from(hex.length % 2 === 0 ? hex : '0' + hex, 'hex');
        // strip leading zero bytes for RLP minimal encoding; zero => empty buffer
        let i = 0;
        while (i < buf.length && buf[i] === 0) i++;
        return i === buf.length ? Buffer.alloc(0) : buf.subarray(i);
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
        let bn = BigInt(value);
        if (bn === 0n) return Buffer.alloc(0);
        const bytes = [];
        while (bn > 0n) {
            bytes.push(Number(bn & 0xffn));
            bn >>= 8n;
        }
        return Buffer.from(bytes.reverse());
    }
    if (Buffer.isBuffer(value)) return value;
    throw new Error('Unsupported value type for buffer conversion');
}


function keccak256Hash(buf) {
    return keccak256('keccak256').update(buf).digest();
}

// secp256k1 order and half-order for low-S normalization
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const SECP256K1_N_DIV_2 = SECP256K1_N >> 1n;

function signHashWithHsmAndComputeV(session, privateKey, publicKey, hash32) {
    const sign = session.createSign("ECDSA", privateKey);
    const sig = sign.once(hash32);
    let r = sig.subarray(0, 32);
    let s = sig.subarray(32, 64);

    const ecPoint = publicKey.getAttribute({ pointEC: null }).pointEC;
    const rawPoint = decodeEcPoint(ecPoint);
    if (rawPoint[0] !== 0x04) throw new Error("Only uncompressed EC points are supported from the HSM public key.");
    const pubXY = rawPoint.subarray(1);

    // Normalize S to low-S; if flipped, toggle recovery id later
    const sBig = BigInt('0x' + s.toString('hex'));
    let sWasHigh = false;
    if (sBig > SECP256K1_N_DIV_2) {
        const sNorm = SECP256K1_N - sBig;
        // write back normalized s as 32-byte big-endian
        const sHex = sNorm.toString(16).padStart(64, '0');
        s = Buffer.from(sHex, 'hex');
        sWasHigh = true;
    }

    let v;

    for (let i = 0; i < 2; i++) {
        try {
            // ethUtil.ecrecover expects the message hash, v, r, and s
            // The v value in ecrecover is 0 or 1, which internally gets converted to 27 or 28.
            const recoveredPub = ecrecover(hash32, i, r, s);
            // Compare the recovered public key with the actual public key from the HSM
            if (recoveredPub.toString('hex') === pubXY.toString('hex')) {
                console.log("Pubkey => ", pubXY.toString('hex'))

                v = i ; // Ethereum's v values are typically 27 or 28
                break;
            }
        } catch (e) {
            // Handle potential errors during recovery (e.g., invalid signature components)
            console.warn(`Attempted recovery with v_candidate=${i} failed: ${e.message}`);
        }
    }

    if (v === undefined) throw new Error('Could not determine recovery id (v)');

    
    console.log({ r, s, v });
    return { r, s, v };
}

// You will need to import these functions from wherever they are defined
// import { signHashWithHsmAndComputeV } from './hsm-signer'; 

export async function signAndSendEtherTransaction(session, privateKey, publicKey, params) {
    const rpcUrl = process.env.RPC_URL;
    const chainId = params.chainId ?? 11155111;

    // Fetch and log sender balance
    if (!params.from) {
        throw new Error('Missing params.from (sender address)');
    }
    // Fetch the current gas price from the network
    const gasPriceRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_gasPrice',
            params: []
        })
    });
    const gasPriceJson = await gasPriceRes.json();
    if (gasPriceJson.error) {
        throw new Error(`RPC error fetching gas price: ${gasPriceJson.error.code} ${gasPriceJson.error.message}`);
    }
    const gasPriceWei = BigInt(gasPriceJson.result);

    // Fetch the transaction count (nonce) for the sender
    // Fetch the transaction count (nonce) for the sender
    const nonceRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getTransactionCount',
            params: [params.from, 'latest']
        })
    });

    const nonceJson = await nonceRes.json();
    if (nonceJson.error) {
        throw new Error(`RPC error fetching nonce: ${nonceJson.error.code} ${nonceJson.error.message}`);
    }
    const nonce = parseInt(nonceJson.result, 16);

    const nonceBuf = toBufferFromHexOrNumber(nonce);
    const gasPriceBuf = toBufferFromHexOrNumber(gasPriceWei);
    const gasLimitBuf = toBufferFromHexOrNumber(params.gasLimit);
    const toBuf = params.to ? toBufferFromHexOrNumber(params.to) : Buffer.alloc(0);
    const valueBuf = toBufferFromHexOrNumber(params.valueWei ?? 0);
    const dataBuf = params.data ? toBufferFromHexOrNumber(params.data) : Buffer.alloc(0);
    const chainIdBuf = toBufferFromHexOrNumber(chainId);

    const unsignedForSig = [
        nonceBuf,
        gasPriceBuf,
        gasLimitBuf,
        toBuf,
        valueBuf,
        dataBuf,
        chainIdBuf,
        Buffer.alloc(0),
        Buffer.alloc(0)
    ];

    const rlpUnsigned = rlpEncode(unsignedForSig);
    const msgHash = keccak256Hash(Buffer.from(rlpUnsigned.slice(2), 'hex'));

    // Your signing function should return a recovery ID (recId)
    const { r, s, v } = signHashWithHsmAndComputeV(session, privateKey, publicKey, msgHash);
    
    let finalSignatureBuffer = Buffer.concat([r, s, Buffer.from([v])]);
    let fullEthSignature = '0x' + finalSignatureBuffer.toString('hex');


    // Correctly calculate v using EIP-155
    const vFinal = BigInt(chainId) * 2n + 35n + BigInt(v);

    const signed = [
        nonceBuf,
        gasPriceBuf,
        gasLimitBuf,
        toBuf,
        valueBuf,
        dataBuf,
        toBufferFromHexOrNumber(vFinal),
        stripLeadingZeros(r),
        stripLeadingZeros(s)
    ];

    const rawTx = rlpEncode(signed).toString('hex');


    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_sendRawTransaction',
            params: [rawTx]
        })
    });
    const json = await res.json();
    if (json.error) {
        throw new Error(`RPC error: ${json.error.code} ${json.error.message}`);
    }
    return json.result;
}

function stripLeadingZeros(buf) {
    let i = 0;
    while (i < buf.length && buf[i] === 0) i++;
    return i === 0 ? buf : buf.subarray(i);
}
