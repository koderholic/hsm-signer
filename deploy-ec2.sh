#!/bin/bash

# Ethereum HSM Signing Service - EC2 Deployment Script
# This script helps deploy the service on an EC2 instance

set -e

echo "🚀 Ethereum HSM Signing Service - EC2 Deployment Script"
echo "========================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user."
   exit 1
fi

# Detect OS
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    print_error "Cannot detect OS version"
    exit 1
fi

print_status "Detected OS: $OS $VER"

# Update system
print_status "Updating system packages..."
if [[ "$OS" == *"Amazon Linux"* ]] || [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"RHEL"* ]]; then
    sudo yum update -y
elif [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
    sudo apt update && sudo apt upgrade -y
else
    print_warning "Unsupported OS. Please install dependencies manually."
fi

# Install Node.js
print_status "Installing Node.js 18.x..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Node.js already installed: $NODE_VERSION"
else
    if [[ "$OS" == *"Amazon Linux"* ]] || [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"RHEL"* ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    elif [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
print_success "Node.js $NODE_VERSION and npm $NPM_VERSION installed"

# Install PM2 globally
print_status "Installing PM2 process manager..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_success "PM2 installed successfully"
else
    print_status "PM2 already installed"
fi

# Check if CloudHSM client is installed
print_status "Checking CloudHSM client installation..."
if [[ -f "/opt/cloudhsm/lib/libcloudhsm_pkcs11.so" ]]; then
    print_success "CloudHSM client library found"
else
    print_warning "CloudHSM client library not found at /opt/cloudhsm/lib/libcloudhsm_pkcs11.so"
    print_warning "Please install CloudHSM client following AWS documentation"
fi

# Check CloudHSM client service
if systemctl is-active --quiet cloudhsm-client; then
    print_success "CloudHSM client service is running"
else
    print_warning "CloudHSM client service is not running"
    print_warning "Please start the CloudHSM client service"
fi

# Create application directory
APP_DIR="$HOME/ethereum-hsm-service"
print_status "Setting up application directory: $APP_DIR"

if [[ -d "$APP_DIR" ]]; then
    print_warning "Application directory already exists. Updating..."
    cd "$APP_DIR"
    git pull || print_warning "Could not pull latest changes"
else
    print_status "Creating application directory..."
    mkdir -p "$APP_DIR"
    cd "$APP_DIR"
fi

# Copy application files if they exist in current directory
if [[ -f "../index.js" ]]; then
    print_status "Copying application files..."
    cp ../*.js ../*.json ../*.md . 2>/dev/null || true
    print_success "Application files copied"
else
    print_warning "Application files not found in parent directory"
    print_warning "Please ensure index.js, package.json, and other files are present"
fi

# Install dependencies
if [[ -f "package.json" ]]; then
    print_status "Installing Node.js dependencies..."
    npm install
    print_success "Dependencies installed"
else
    print_error "package.json not found. Cannot install dependencies."
    exit 1
fi

# Create environment file
print_status "Creating environment configuration..."
cat > .env << EOF
# Ethereum HSM Signing Service Configuration
# Replace with your actual CloudHSM credentials
PIN=username:password
PORT=3756
EOF

print_warning "Please edit .env file with your actual CloudHSM credentials:"
print_warning "  PIN=your_username:your_password"
print_warning "  PORT=your_desired_port"

# Create systemd service file
print_status "Creating systemd service file..."
sudo tee /etc/systemd/system/ethereum-hsm.service > /dev/null << EOF
[Unit]
Description=Ethereum HSM Signing Service
After=network.target cloudhsm-client.service
Wants=cloudhsm-client.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

print_success "Systemd service file created"

# Reload systemd and enable service
print_status "Enabling systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable ethereum-hsm

print_success "Service enabled. You can start it with:"
print_success "  sudo systemctl start ethereum-hsm"
print_success "  sudo systemctl status ethereum-hsm"

# Create firewall rules (if ufw is available)
if command -v ufw &> /dev/null; then
    print_status "Configuring firewall rules..."
    sudo ufw allow 3756/tcp
    print_success "Firewall rule added for port 3756"
elif command -v firewall-cmd &> /dev/null; then
    print_status "Configuring firewall rules..."
    sudo firewall-cmd --permanent --add-port=3756/tcp
    sudo firewall-cmd --reload
    print_success "Firewall rule added for port 3756"
else
    print_warning "No supported firewall detected. Please configure manually."
fi

# Create startup script
print_status "Creating startup script..."
cat > start.sh << 'EOF'
#!/bin/bash
# Startup script for Ethereum HSM Service

echo "Starting Ethereum HSM Signing Service..."

# Check if CloudHSM client is running
if ! systemctl is-active --quiet cloudhsm-client; then
    echo "Starting CloudHSM client..."
    sudo systemctl start cloudhsm-client
    sleep 5
fi

# Start the service
sudo systemctl start ethereum-hsm

# Show status
sudo systemctl status ethereum-hsm

echo "Service started. Check logs with: sudo journalctl -u ethereum-hsm -f"
EOF

chmod +x start.sh
print_success "Startup script created: ./start.sh"

# Create monitoring script
print_status "Creating monitoring script..."
cat > monitor.sh << 'EOF'
#!/bin/bash
# Monitoring script for Ethereum HSM Service

echo "=== Ethereum HSM Service Status ==="
echo "Service Status:"
sudo systemctl status ethereum-hsm --no-pager -l

echo -e "\n=== Recent Logs ==="
sudo journalctl -u ethereum-hsm --no-pager -l -n 20

echo -e "\n=== CloudHSM Client Status ==="
sudo systemctl status cloudhsm-client --no-pager -l

echo -e "\n=== Network Connections ==="
sudo netstat -tlnp | grep :3756 || echo "No service listening on port 3756"
EOF

chmod +x monitor.sh
print_success "Monitoring script created: ./monitor.sh"

# Final instructions
echo ""
echo "🎉 Deployment completed successfully!"
echo "====================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your CloudHSM credentials:"
echo "   nano .env"
echo ""
echo "2. Start the service:"
echo "   ./start.sh"
echo ""
echo "3. Check service status:"
echo "   ./monitor.sh"
echo ""
echo "4. Test the service:"
echo "   curl http://localhost:3756/health"
echo ""
echo "5. View logs:"
echo "   sudo journalctl -u ethereum-hsm -f"
echo ""
echo "Service will automatically start on system boot."
echo ""
echo "For production use, consider:"
echo "- Setting up HTTPS with a reverse proxy"
echo "- Configuring monitoring and alerting"
echo "- Setting up log rotation"
echo "- Regular security updates"
