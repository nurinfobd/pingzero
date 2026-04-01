# PingZero – Ubuntu 22.04 Installation (Step‑by‑Step)

Use these steps to deploy PingZero on a fresh Ubuntu 22.04 server.

## 1) System Update and Prerequisites
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl build-essential python3 python3-pip
```

## 2) Install Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v
npm -v
```

## 3) Choose Install Path and Clone
```bash
sudo mkdir -p /var/www/pingzero
sudo chown -R $USER:$USER /var/www/pingzero
cd /var/www
git clone https://github.com/nurexbt/pingzero.git pingzero
cd pingzero
```

## 4) Install Dependencies
```bash
# Python SNMP library
pip3 install pysnmp

# Node dependencies (creates node_modules automatically)
npm install
```

## 5) Build
```bash
npm run build
```

## 6) Start the App
Temporary (foreground):
```bash
npm start
```

Recommended (background with PM2):
```bash
sudo npm install -g pm2
pm2 start npm --name pingzero -- start
pm2 save
pm2 startup
```

## 7) First‑Time Setup (Installer)
Open in your browser:
```
http://YOUR_SERVER_IP:3000/install
```
- Set admin username and password.
- Optionally set portal name and upload a small logo (auto‑resized).
- After completion you will be redirected to the login page.

## 8) Firewall (Optional)
```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

## 9) Reverse Proxy (Optional – Nginx)
Example Nginx server block:
```
server {
  listen 80;
  server_name your.domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```
Then:
```bash
sudo systemctl reload nginx
```

## 10) Fresh Start / Reset (Optional)
To reset data and run installer again:
```bash
cd /var/www/pingzero
rm -f hosts.db hosts.db-wal hosts.db-shm
pm2 restart pingzero || npm start
# Open http://YOUR_SERVER_IP:3000/install again
```

## Notes
- Do not push `node_modules` or any `*.db*` files to Git. `npm install` recreates dependencies on the server.
- On HTTP (no TLS), login cookies are handled automatically via proxy detection; HTTPS is recommended for production.
