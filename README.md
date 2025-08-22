# Ethereum HSM Signing Service

A secure Ethereum message signing service that uses AWS CloudHSM for key management. Your private keys never leave the HSM, ensuring maximum security for your Ethereum operations.

## 🚀 Features

- **Secure Key Management**: Private keys are stored and used exclusively within AWS CloudHSM
- **Ethereum Message Signing**: Sign messages using the Ethereum personal_sign format
- **Signature Verification**: Verify signatures without needing the private key
- **RESTful API**: Simple HTTP endpoints for all operations
- **Production Ready**: Designed for deployment on EC2 instances

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client App    │    │  EC2 Instance    │    │   AWS CloudHSM  │
│                 │    │                  │    │                 │
│ - Send message  │───▶│ - Express server │───▶│ - Store keys    │
│ - Get signature │◀───│ - HSM client     │◀───│ - Sign messages │
│ - Verify sig    │    │ - Key management │    │ - Never export  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- AWS CloudHSM cluster configured and running
- EC2 instance with CloudHSM client software installed
- Node.js 18+ installed on EC2
- Proper IAM roles and security groups configured

## 🛠️ Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd ethereum-hsm-signing-service
npm install
```

### 2. Configure Environment Variables

Create a `.env` file or set environment variables:

```bash
export PIN="<CU_username>:<password>"
export PORT=3756
```

The PIN format follows AWS CloudHSM convention: `username:password`

### 3. Ensure CloudHSM Client is Ready

Make sure the CloudHSM client is properly configured on your EC2 instance:

```bash
# Check if CloudHSM client is running
sudo systemctl status cloudhsm-client

# Verify the PKCS#11 library path
ls -la /opt/cloudhsm/lib/libcloudhsm_pkcs11.so
```

## 🚀 Running the Service

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Using PM2 (Recommended for Production)
```bash
npm install -g pm2
pm2 start index.js --name "ethereum-hsm-service"
pm2 startup
pm2 save
```

## 📡 API Endpoints

### Health Check
```http
GET /health
```
Returns service status and HSM connection status.

### Get Account Info
```http
GET /account
```
Returns the Ethereum address derived from the HSM-stored public key.

### Sign Message
```http
POST /sign
Content-Type: application/json

{
  "message": "Hello, Ethereum!"
}
```
Returns the signature and related components (r, s, v values).

### Verify Signature
```http
POST /verify
Content-Type: application/json

{
  "message": "Hello, Ethereum!",
  "signature": "0x...",
  "address": "0x..."
}
```
Returns whether the signature is valid for the given message and address.

### Help & Examples
```http
GET /test
```
Shows available endpoints and usage examples.

## 🔐 How It Works

### 1. HSM Initialization
- Service starts and connects to CloudHSM
- Generates or retrieves existing EC key pair (secp256k1 curve)
- Derives Ethereum address from public key
- Maintains persistent HSM session

### 2. Message Signing
- Client sends message to `/sign` endpoint
- Service creates Ethereum personal message format
- Hashes message using Keccak-256
- HSM signs the hash using stored private key
- Returns signature in standard Ethereum format

### 3. Signature Verification
- Client sends message, signature, and address to `/verify`
- Service recovers public key from signature
- Derives address from recovered public key
- Compares with provided address

## 🚀 EC2 Deployment

### 1. Launch EC2 Instance
- Use Amazon Linux 2 or Ubuntu 20.04+
- Ensure security group allows inbound traffic on your service port
- Attach IAM role with CloudHSM permissions

### 2. Install Dependencies
```bash
# Update system
sudo yum update -y  # Amazon Linux
# or
sudo apt update && sudo apt upgrade -y  # Ubuntu

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install CloudHSM client
# Follow AWS documentation for your specific setup
```

### 3. Deploy Application
```bash
# Clone your repository
git clone <your-repo>
cd ethereum-hsm-signing-service

# Install dependencies
npm install

# Set environment variables
export PIN="<username>:<password>"
export PORT=3756

# Start service
npm start
```

### 4. Configure as System Service
Create `/etc/systemd/system/ethereum-hsm.service`:

```ini
[Unit]
Description=Ethereum HSM Signing Service
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/path/to/your/app
Environment=PIN=<username>:<password>
Environment=PORT=3756
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ethereum-hsm
sudo systemctl start ethereum-hsm
sudo systemctl status ethereum-hsm
```

## 🔍 Testing the Service

### 1. Check Health
```bash
curl http://your-ec2-ip:3756/health
```

### 2. Get Account Info
```bash
curl http://your-ec2-ip:3756/account
```

### 3. Sign a Message
```bash
curl -X POST http://your-ec2-ip:3756/sign \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from EC2!"}'
```

### 4. Verify Signature
```bash
# Use the signature from the previous response
curl -X POST http://your-ec2-ip:3756/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello from EC2!",
    "signature": "0x...",
    "address": "0x..."
  }'
```

## 🔒 Security Considerations

- **Private keys never leave the HSM**
- **HSM session is maintained securely**
- **All cryptographic operations happen in hardware**
- **Network access should be restricted to trusted sources**
- **Use HTTPS in production (behind load balancer)**
- **Regular security updates and monitoring**

## 🐛 Troubleshooting

### Common Issues

1. **HSM Connection Failed**
   - Verify CloudHSM client is running
   - Check PIN format and credentials
   - Ensure EC2 has proper IAM permissions

2. **Key Generation Failed**
   - Verify HSM has sufficient resources
   - Check HSM user permissions
   - Ensure secp256k1 curve is supported

3. **Service Won't Start**
   - Check environment variables
   - Verify port availability
   - Check Node.js version compatibility

### Logs
```bash
# System service logs
sudo journalctl -u ethereum-hsm -f

# Application logs (if using PM2)
pm2 logs ethereum-hsm-service
```

## 📚 Additional Resources

- [AWS CloudHSM Documentation](https://docs.aws.amazon.com/cloudhsm/)
- [Ethereum Signing Standards](https://eips.ethereum.org/EIPS/eip-191)
- [PKCS#11 Standard](https://docs.oasis-open.org/pkcs11/pkcs11-base/v2.40/os/pkcs11-base-v2.40-os.html)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.
