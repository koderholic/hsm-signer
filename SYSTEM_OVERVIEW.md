# Ethereum HSM Signing Service - Complete System Overview

## 🎯 What This System Does

This is a **complete Ethereum signing service** that uses AWS CloudHSM for secure key management. Here's what it provides:

1. **Secure Key Storage**: Your Ethereum private keys are stored in AWS CloudHSM (hardware security module)
2. **Message Signing**: Sign any message using the Ethereum personal_sign format
3. **Signature Verification**: Verify signatures without needing the private key
4. **RESTful API**: Simple HTTP endpoints for all operations
5. **Production Ready**: Designed for deployment on EC2 instances

## 🏗️ Complete Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT APPLICATIONS                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Web App   │  │ Mobile App  │  │   CLI Tool  │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EC2 INSTANCE                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              EXPRESS.JS SERVER                              │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │ │
│  │  │   /health   │ │  /account   │ │   /sign     │          │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │ │
│  │  ┌─────────────┐ ┌─────────────┐                          │ │
│  │  │  /verify    │ │    /test    │                          │ │
│  │  └─────────────┘ └─────────────┘                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                │                               │
│                                ▼                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              ETHEREUM HSM MODULE                            │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │ │
│  │  │   initHSM   │ │getEthereum  │ │signEthereum │          │ │
│  │  │             │ │  KeyPair    │ │  Message    │          │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │ │
│  │  ┌─────────────┐ ┌─────────────┐                          │ │
│  │  │deriveEthereum│ │verifyEthereum│                        │ │
│  │  │   Address   │ │  Signature  │                          │ │
│  │  └─────────────┘ └─────────────┘                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS CLOUDHSM                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              HARDWARE SECURITY MODULE                       │ │
│  │  ┌─────────────┐ ┌─────────────┐                          │ │
│  │  │ Private Key │ │ Public Key  │                          │ │
│  │  │ (secp256k1) │ │ (secp256k1) │                          │ │
│  │  │             │ │             │                          │ │
│  │  │ NEVER LEAVES│ │  EXTRACTABLE │                          │ │
│  │  │   THE HSM  │ │              │                          │ │
│  │  └─────────────┘ └─────────────┘                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🔑 Key Components Explained

### 1. **Main Server (`index.js`)**
- **Entry Point**: Express.js server that handles HTTP requests
- **Endpoints**: `/health`, `/account`, `/sign`, `/verify`, `/test`
- **HSM Management**: Maintains persistent HSM session
- **Error Handling**: Comprehensive error handling and logging

### 2. **Ethereum HSM Module (`ethereum-hsm.js`)**
- **`initHSM()`**: Connects to AWS CloudHSM using PKCS#11
- **`getEthereumKeyPair()`**: Generates or retrieves EC key pair (secp256k1)
- **`deriveEthereumAddress()`**: Converts public key to Ethereum address
- **`signEthereumMessage()`**: Signs messages using HSM-stored private key
- **`verifyEthereumSignature()`**: Verifies signatures by recovering public key

### 3. **HSM Integration**
- **PKCS#11 Library**: Uses `/opt/cloudhsm/lib/libcloudhsm_pkcs11.so`
- **Session Management**: Maintains secure session with HSM
- **Key Operations**: All cryptographic operations happen in hardware
- **Security**: Private keys never leave the HSM

## 🔐 How Ethereum Signing Works

### 1. **Key Generation**
```javascript
// HSM generates EC key pair on secp256k1 curve
const keys = session.generateKeyPair(graphene.KeyGenMechanism.EC, {
    keyType: graphene.KeyType.EC,
    ecParams: graphene.ECParams.encodeNamedCurve(graphene.NamedCurve.SECP256K1),
    // ... other parameters
});
```

### 2. **Address Derivation**
```javascript
// Get public key from HSM
const rawPublicKey = publicKey.getAttribute(graphene.Attribute.VALUE);

// Remove compression byte if present
const keyBytes = rawPublicKey.length === 65 ? rawPublicKey.slice(1) : rawPublicKey;

// Hash with Keccak-256 and take last 20 bytes
const hash = keccak256(keyBytes);
const address = '0x' + hash.slice(-20).toString('hex');
```

### 3. **Message Signing**
```javascript
// Create Ethereum personal message format
const personalMessage = `\x19Ethereum Signed Message:\n${message.length}${message}`;

// Hash the message
const messageHash = keccak256(Buffer.from(personalMessage, 'utf8'));

// Sign with HSM
const signer = session.createSign(graphene.Mechanism.ECDSA, privateKey);
const signature = signer.once(messageHash);

// Convert to Ethereum format (r, s, v)
```

### 4. **Signature Verification**
```javascript
// Recover public key from signature
const publicKey = secp256k1.recover(messageHash, { r, s, v }, false);

// Derive address from recovered public key
const recoveredAddress = deriveEthereumAddress(publicKey);

// Compare with expected address
const isValid = recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
```

## 🚀 Deployment Flow

### 1. **EC2 Setup**
```bash
# Launch EC2 instance with proper IAM roles
# Install CloudHSM client
# Configure security groups for your service port
```

### 2. **Application Deployment**
```bash
# Clone repository
git clone <your-repo>
cd ethereum-hsm-signing-service

# Install dependencies
npm install

# Configure environment
export PIN="username:password"
export PORT=3756

# Start service
npm start
```

### 3. **Service Management**
```bash
# Use the deployment script
./deploy-ec2.sh

# Or manage manually with systemd
sudo systemctl enable ethereum-hsm
sudo systemctl start ethereum-hsm
sudo systemctl status ethereum-hsm
```

## 📡 API Usage Examples

### **Sign a Message**
```bash
curl -X POST http://your-ec2-ip:3756/sign \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Ethereum!"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Hello, Ethereum!",
  "signature": "0x1234...",
  "r": "0x...",
  "s": "0x...",
  "v": 27,
  "address": "0xabcd..."
}
```

### **Verify a Signature**
```bash
curl -X POST http://your-ec2-ip:3756/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, Ethereum!",
    "signature": "0x1234...",
    "address": "0xabcd..."
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Signature is valid",
  "verified": true,
  "message": "Hello, Ethereum!",
  "signature": "0x1234...",
  "address": "0xabcd..."
}
```

## 🔍 Testing and Verification

### **Local Testing**
```bash
# Test the service endpoints
node test-client.js http://localhost:3756

# Verify signatures anywhere
node verify-signature.js "Hello, Ethereum!" 0x1234... 0xabcd...
```

### **Production Verification**
```bash
# Check service health
curl http://your-ec2-ip:3756/health

# Get account info
curl http://your-ec2-ip:3756/account

# Monitor service
./monitor.sh
```

## 🔒 Security Features

1. **Private Key Protection**: Keys never leave the HSM
2. **Hardware Security**: All crypto operations in tamper-resistant hardware
3. **Session Management**: Secure HSM session handling
4. **Input Validation**: Comprehensive request validation
5. **Error Handling**: Secure error messages (no sensitive info leaked)
6. **Network Security**: Configurable firewall rules

## 🐛 Troubleshooting Guide

### **Common Issues**

1. **HSM Connection Failed**
   - Verify CloudHSM client is running
   - Check PIN format: `username:password`
   - Ensure EC2 has proper IAM permissions

2. **Key Generation Failed**
   - Check HSM user permissions
   - Verify secp256k1 curve support
   - Check HSM resource availability

3. **Service Won't Start**
   - Verify environment variables
   - Check port availability
   - Review system logs

### **Debug Commands**
```bash
# Check HSM status
sudo systemctl status cloudhsm-client

# View service logs
sudo journalctl -u ethereum-hsm -f

# Check network connections
sudo netstat -tlnp | grep :3756

# Test HSM connectivity
/opt/cloudhsm/bin/cloudhsm_mgmt_util
```

## 📚 What You Can Do With This System

1. **Secure Wallet Operations**: Sign transactions without exposing private keys
2. **Message Authentication**: Sign messages for identity verification
3. **Smart Contract Interaction**: Sign contract calls securely
4. **Multi-Signature Wallets**: Part of a larger multi-sig system
5. **Audit Trails**: All signing operations logged in HSM
6. **Compliance**: Meet regulatory requirements for key management

## 🎯 Next Steps

1. **Deploy to EC2**: Use the deployment script
2. **Configure HSM**: Set up CloudHSM cluster and users
3. **Test Endpoints**: Verify all functionality works
4. **Production Setup**: Add monitoring, logging, and security
5. **Integration**: Connect to your applications

This system gives you a **production-ready, enterprise-grade Ethereum signing service** with the security of hardware security modules!
