# syntax=docker/dockerfile:1

# Base with Node 18 LTS (needed for pkcs11 native builds)
FROM node:18-bullseye

WORKDIR /app

# Install build prerequisites for node-gyp and pkcs11js
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install deps
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

# Set environment (override at runtime as needed)
ENV NODE_ENV=production \
    PORT=3756 \
    RPC_URL=https://gateway.tenderly.co/public/sepolia

# Expose the service port
EXPOSE 3756

# Start app
CMD ["npm", "start"]


