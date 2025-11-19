# IRL Task Manager - Server Setup

This server handles Firebase Admin SDK operations (like deleting users) that can't be done from the client side.

## Prerequisites

- Node.js v18+ (already installed on your droplet)
- Firebase project with Admin access
- Apache web server (for reverse proxy)

## Step 1: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `task-management-7b3a2`
3. Click the gear icon ⚙️ > **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Download the JSON file (keep this file safe and NEVER commit it to git!)

## Step 2: Setup Server on Droplet

SSH into your droplet and navigate to your project directory:

```bash
cd /path/to/irl-task-manager/server
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```bash
nano .env
```

Add the following (replace with your service account key):

```env
PORT=3000
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"task-management-7b3a2",...paste entire JSON here...}
```

**Important**: The `FIREBASE_SERVICE_ACCOUNT_KEY` should be the entire contents of the downloaded JSON file as a single line.

Save and exit (`Ctrl+X`, then `Y`, then `Enter`)

## Step 3: Test the Server Locally

Start the server:

```bash
npm start
```

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

You should see: `{"status":"ok","timestamp":"..."}`

If it works, press `Ctrl+C` to stop.

## Step 4: Run Server with PM2 (Process Manager)

Install PM2 globally:

```bash
npm install -g pm2
```

Start the server with PM2:

```bash
pm2 start server.js --name irl-api
```

Make PM2 start on system boot:

```bash
pm2 startup
pm2 save
```

Check server status:

```bash
pm2 status
pm2 logs irl-api
```

## Step 5: Configure Apache Reverse Proxy

Create Apache config for the API endpoint:

```bash
sudo nano /etc/apache2/sites-available/irl-api.conf
```

Add this configuration:

```apache
<VirtualHost *:80>
    ServerName your-domain.com

    # Serve static files from the root
    DocumentRoot /path/to/irl-task-manager

    <Directory /path/to/irl-task-manager>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Proxy API requests to Node.js server
    ProxyPreserveHost On
    ProxyPass /api http://localhost:3000/api
    ProxyPassReverse /api http://localhost:3000/api
</VirtualHost>
```

Enable required Apache modules:

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2ensite irl-api
sudo systemctl restart apache2
```

## Step 6: Test Everything

1. Visit your site in a browser
2. Log in as a manager
3. Go to Manager Dashboard > Team tab
4. Try to delete a test user
5. Check PM2 logs: `pm2 logs irl-api`

## Troubleshooting

### Server won't start
```bash
# Check logs
pm2 logs irl-api

# Make sure .env file exists and has the service account key
cat .env
```

### "Permission denied" errors
Make sure the user running PM2 has read access to the `.env` file and the server directory.

### API endpoint returns 404
- Check Apache config is correct
- Make sure proxy modules are enabled: `sudo a2enmod proxy proxy_http`
- Restart Apache: `sudo systemctl restart apache2`

### "Invalid token" errors
The Firebase ID token may have expired. Try logging out and back in.

## Security Notes

- ✅ `.env` file is in `.gitignore` (never commit it!)
- ✅ Service account key should only be on the server
- ✅ Server validates Firebase ID tokens before processing requests
- ✅ Only managers can delete users (verified on server-side)

## Managing the Server

```bash
# View logs
pm2 logs irl-api

# Restart server
pm2 restart irl-api

# Stop server
pm2 stop irl-api

# Delete from PM2
pm2 delete irl-api
```

## Updating the Server

When you make changes to `server.js`:

```bash
cd /path/to/irl-task-manager/server
git pull  # or upload the new file
pm2 restart irl-api
```
