# Self-Hosted LiveKit Setup on AWS
### Domain: livekit.koushikpanda.online

---

## What You Will Have After This Setup

```
livekit.koushikpanda.online  →  Your LiveKit server (WebRTC + SIP + Agents)
turn.koushikpanda.online     →  TURN server (for NAT traversal in video calls)
```

---

## Architecture Overview

```
Patient/Doctor App
       │
       ▼
livekit.koushikpanda.online (EC2 Ubuntu)
       │
       ├── LiveKit Server  (port 7880 / 443)
       ├── TURN Server     (port 3478 / 5349)
       ├── Nginx           (SSL termination)
       └── Agent Processes (python agent.py start)
```

---

## Step 1 — Launch AWS EC2 Instance

### 1.1 Go to AWS Console → EC2 → Launch Instance

- **Name:** `livekit-server`
- **AMI:** Ubuntu 24.04 LTS (64-bit)
- **Instance type:** `t3.medium` (2 vCPU, 4GB RAM) — good for ~20 doctors
  - For 50+ doctors use `t3.xlarge` (4 vCPU, 16GB RAM)
- **Storage:** 30GB SSD (gp3)
- **Key pair:** Create new → download `.pem` file → keep it safe

### 1.2 Security Group — Open these ports

| Type | Protocol | Port | Source | Purpose |
|---|---|---|---|---|
| SSH | TCP | 22 | Your IP | Server access |
| HTTP | TCP | 80 | 0.0.0.0/0 | SSL cert verification |
| HTTPS | TCP | 443 | 0.0.0.0/0 | LiveKit WebSocket + API |
| Custom TCP | TCP | 7880 | 0.0.0.0/0 | LiveKit HTTP |
| Custom TCP | TCP | 7881 | 0.0.0.0/0 | LiveKit RTC |
| Custom UDP | UDP | 7882 | 0.0.0.0/0 | LiveKit RTC UDP |
| Custom UDP | UDP | 3478 | 0.0.0.0/0 | TURN server |
| Custom TCP | TCP | 5349 | 0.0.0.0/0 | TURN server TLS |
| Custom UDP | UDP | 5060 | 0.0.0.0/0 | SIP |
| Custom TCP | TCP | 5060 | 0.0.0.0/0 | SIP |
| Custom UDP | UDP | 10000-20000 | 0.0.0.0/0 | SIP/RTP media |

### 1.3 Allocate Elastic IP

```
AWS Console → EC2 → Elastic IPs → Allocate
→ Associate with your livekit-server instance
→ Note down the IP (e.g. 13.233.XX.XX)
```

> **Important:** Elastic IP stays the same even if you restart the server.

---

## Step 2 — Point Your Domain to the Server

Go to your domain registrar (where you bought koushikpanda.online) → DNS settings.

Add these DNS records:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | livekit | 13.233.XX.XX (your Elastic IP) | 300 |
| A | turn | 13.233.XX.XX (your Elastic IP) | 300 |

Wait 5-10 minutes for DNS to propagate.

Verify it works:
```bash
ping livekit.koushikpanda.online
# should show your EC2 IP
```

---

## Step 3 — SSH Into Your Server

```bash
# Give your key file correct permissions
chmod 400 your-key.pem

# SSH in
ssh -i your-key.pem ubuntu@livekit.koushikpanda.online
```

---

## Step 4 — Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ubuntu

# Install Nginx
sudo apt install -y nginx

# Install Certbot (SSL certificates)
sudo apt install -y certbot python3-certbot-nginx

# Install LiveKit CLI
curl -sSL https://get.livekit.io/cli | bash

# Logout and login again for docker group to take effect
exit
# SSH back in
ssh -i your-key.pem ubuntu@livekit.koushikpanda.online
```

---

## Step 5 — Get SSL Certificates

```bash
# Stop nginx temporarily
sudo systemctl stop nginx

# Get certificates for both subdomains
 sudo certbot certonly --standalone \
    -d livekit.koushikpanda.online \
    -d turn.koushikpanda.online \
    --email koushikpanda.fs@gmail.com \
    --agree-tos \
    --non-interactive

# Certificates will be saved to:
# /etc/letsencrypt/live/livekit.koushikpanda.online/fullchain.pem
# /etc/letsencrypt/live/livekit.koushikpanda.online/privkey.pem
```

---

## Step 6 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/livekit
```

Paste this config:

```nginx
server {
    listen 80;
    server_name livekit.koushikpanda.online;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name livekit.koushikpanda.online;

    ssl_certificate /etc/letsencrypt/live/livekit.koushikpanda.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/livekit.koushikpanda.online/privkey.pem;

    location / {
        proxy_pass http://localhost:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/livekit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Step 7 — Install and Configure LiveKit Server

### 7.1 Create config directory

```bash
mkdir -p ~/livekit
cd ~/livekit
```

### 7.2 Generate API keys

```bash
# Generate a strong API key and secret
lk generate-keys
# Output example:
# API Key:    APIfxxxxxxxxxxxxxxxx
# API Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Save these — you will use them everywhere
```

### 7.3 Create livekit.yaml config

```bash
nano ~/livekit/livekit.yaml
```

Paste this (replace values with your own):

```yaml
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  tcp_port: 7881
  udp_port: 7882

keys:
  APIfxxxxxxxxxxxxxxxx: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

turn:
  enabled: true
  domain: turn.koushikpanda.online
  tls_port: 5349
  udp_port: 3478
  external_tls: true

logging:
  level: info

sip:
  enabled: true
```

### 7.4 Create Docker Compose file

```bash
nano ~/livekit/docker-compose.yml
```

```yaml
version: "3"
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

### 7.5 Start LiveKit server

```bash
cd ~/livekit
docker compose up -d

# Check it is running
docker compose logs -f
# Should see: "LiveKit server starting"
```

### 7.6 Verify it works

```bash
curl https://livekit.koushikpanda.online
# Should return: {"status":"ok"}
```

---

## Step 8 — Update Your Backend .env

```bash
# backend/.env
LIVEKIT_URL=wss://livekit.koushikpanda.online
LIVEKIT_API_KEY=APIfxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# health-voice-ai/.env
LIVEKIT_URL=wss://livekit.koushikpanda.online
LIVEKIT_API_KEY=APIfxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_REGION=ap-south
```

---

## Step 9 — Running Agents (No lk agent deploy)

Since `lk agent deploy` only works with LiveKit Cloud, you run agents as Docker containers yourself.

### 9.1 Build the agent image

When your Celery task renders `agent.py`, instead of `lk agent create`, run:

```bash
# In your deploy.py — replace run_livekit_deploy logic with:

docker build -t agent-{agent_id} /path/to/rendered/agent/
docker run -d \
  --name agent-{agent_id} \
  --restart unless-stopped \
  -e LIVEKIT_URL=wss://livekit.koushikpanda.online \
  -e LIVEKIT_API_KEY=APIfxxxxxxxxxxxxxxxx \
  -e LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  -e OPENAI_API_KEY=your_key \
  -e DEEPGRAM_API_KEY=your_key \
  -e ELEVENLABS_API_KEY=your_key \
  -e BACKEND_URL=https://api.koushikpanda.online \
  -e BACKEND_INTERNAL_TOKEN=your_token \
  agent-{agent_id}
```

### 9.2 Delete an agent

```bash
docker stop agent-{agent_id}
docker rm agent-{agent_id}
docker rmi agent-{agent_id}
```

### 9.3 List running agents

```bash
docker ps
```

---

## Step 10 — Auto Renew SSL Certificate

```bash
# Test renewal works
sudo certbot renew --dry-run

# Add to crontab (runs every day at 2am)
sudo crontab -e
# Add this line:
0 2 * * * certbot renew --quiet && systemctl reload nginx
```

---

## Step 11 — Verify Everything Works

```bash
# 1. LiveKit server running
curl https://livekit.koushikpanda.online
# → {"status":"ok"}

# 2. Check Docker containers
docker ps
# → livekit container should be UP

# 3. Test API key works
lk --url wss://livekit.koushikpanda.online \
   --api-key APIfxxxxxxxxxxxxxxxx \
   --api-secret xxxxxxxxxxxxxxxx \
   room list
# → empty list (no rooms yet) means it works
```

---

## Summary — What You Have

```
koushikpanda.online
  │
  ├── livekit.koushikpanda.online  (LiveKit server on EC2)
  │     ├── WebRTC video calls     ✅
  │     ├── SIP phone calls        ✅
  │     ├── AI voice agents        ✅ (Docker containers)
  │     └── Unlimited agents       ✅
  │
  └── turn.koushikpanda.online     (TURN server)
        └── NAT traversal for      ✅
            video calls
```

## Cost Estimate (AWS Mumbai)

| Instance | Agents | Monthly Cost |
|---|---|---|
| t3.medium | ~20 doctors | ~$30/month |
| t3.large | ~50 doctors | ~$60/month |
| t3.xlarge | ~100 doctors | ~$120/month |

vs LiveKit Cloud which charges per-minute per-participant.

---

## Troubleshooting

**LiveKit not starting:**
```bash
cd ~/livekit && docker compose logs
```

**SSL certificate issues:**
```bash
sudo certbot certificates
```

**Agent not connecting:**
```bash
docker logs agent-{agent_id}
# Check LIVEKIT_URL is wss:// not ws://
```

**Video call quality issues:**
- Make sure UDP ports 50000-60000 are open in security group
- Make sure TURN server is running
