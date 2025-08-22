# 🚀 Quick Start Guide - Ethereum HSM Signing Service

Get your Ethereum HSM signing service running in 5 minutes!

## ⚡ What You'll Get

- ✅ Ethereum message signing with HSM security
- ✅ RESTful API endpoints
- ✅ Signature verification
- ✅ Production-ready deployment scripts

## 🎯 Prerequisites

- AWS CloudHSM cluster configured
- EC2 instance with CloudHSM client installed
- Node.js 18+ (will be installed automatically)

## 🚀 Quick Deployment

### 1. **Clone and Setup**
```bash
git clone <your-repo>
cd ethereum-hsm-signing-service
```

### 2. **Run Deployment Script**
```bash
./deploy-ec2.sh
```

This script will:
- Install Node.js 18+
- Install dependencies
- Create systemd service
- Configure firewall
- Set up monitoring scripts

### 3. **Configure Credentials**
```bash
nano .env
# Set your CloudHSM credentials:
# PIN=your_username:your_password
# PORT=3756
```

### 4. **Start the Service**
```bash
./start.sh
```

### 5. **Test It Works**
```bash
# Check health
curl http://localhost:3756/health

# Get account info
curl http://localhost:3756/account

# Sign a message
curl -X POST http://localhost:3756/sign \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Ethereum!"}'
```

## 🔍 Quick Testing

### **Run Full Test Suite**
```bash
node test-client.js http://localhost:3756
```

### **Verify Signatures Anywhere**
```bash
# Copy the signature from the sign response
node verify-signature.js "Hello, Ethereum!" 0x... 0x...
```

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/account` | GET | Get Ethereum address |
| `/sign` | POST | Sign a message |
| `/verify` | POST | Verify a signature |
| `/test` | GET | Show help and examples |

## 🔐 Example Usage

### **Sign a Message**
```bash
curl -X POST http://localhost:3756/sign \
  -H "Content-Type: application/json" \
  -d '{"message": "My important message"}'
```

**Response:**
```json
{
  "success": true,
  "message": "My important message",
  "signature": "0x1234...",
  "address": "0xabcd..."
}
```

### **Verify a Signature**
```bash
curl -X POST http://localhost:3756/verify \
  -H "Content-Type: application/json" \
  -d '{
    "message": "My important message",
    "signature": "0x1234...",
    "address": "0xabcd..."
  }'
```

## 🛠️ Management Commands

### **Service Control**
```bash
# Start service
sudo systemctl start ethereum-hsm

# Stop service
sudo systemctl stop ethereum-hsm

# Restart service
sudo systemctl restart ethereum-hsm

# Check status
sudo systemctl status ethereum-hsm
```

### **Monitoring**
```bash
# View logs
sudo journalctl -u ethereum-hsm -f

# Check service status
./monitor.sh

# Check network
sudo netstat -tlnp | grep :3756
```

## 🔒 Security Notes

- **Private keys never leave the HSM**
- **All crypto operations happen in hardware**
- **Service runs on port 3756 by default**
- **Firewall rules are automatically configured**

## 🐛 Quick Troubleshooting

### **Service Won't Start**
```bash
# Check logs
sudo journalctl -u ethereum-hsm -f

# Check HSM status
sudo systemctl status cloudhsm-client

# Verify environment
cat .env
```

### **HSM Connection Issues**
```bash
# Check HSM client
sudo systemctl status cloudhsm-client

# Verify library path
ls -la /opt/cloudhsm/lib/libcloudhsm_pkcs11.so

# Test HSM connectivity
/opt/cloudhsm/bin/cloudhsm_mgmt_util
```

## 📚 What's Next?

1. **Customize**: Modify the service for your needs
2. **Scale**: Deploy to multiple EC2 instances
3. **Monitor**: Add monitoring and alerting
4. **Secure**: Set up HTTPS and load balancer
5. **Integrate**: Connect to your applications

## 🆘 Need Help?

- Check the full `README.md` for detailed documentation
- Review `SYSTEM_OVERVIEW.md` for architecture details
- Use the test scripts to verify functionality
- Check system logs for error details

---

**🎉 You now have a production-ready Ethereum HSM signing service!**

Your private keys are secure in hardware, and you can sign messages with enterprise-grade security.
