# 🏥 Techastra-HMS: Master Production Deployment Guide
> **Target Audience**: DevOps Engineers, Developers, and AI Coding Assistants.  
> **Architecture**: Frontend on **Vercel** (Admin + Client) | Backend on **AWS EC2** (Node/Express) | Storage on **AWS S3** | Email on **AWS SES** | Database on **MongoDB (Atlas or Self-Hosted EC2)**.

---

## 🤖 AI Assistant Context Prompt
> *If you are an AI assistant reading this file to assist the user, here is the quick project summary:*
> - **Repository**: `https://github.com/surajorg48/Techastra-HMS`
> - **Sub-applications**:
>   1. `server/`: Express 5.x REST API (`PORT=5000`), connects to MongoDB via Mongoose, handles AWS S3 uploads and AWS SES emails.
>   2. `Admin/`: React 19 + Vite 7 + Tailwind CSS management portal for Admins, Doctors, and Receptionists (`VITE_API_URL` environment variable).
>   3. `Client/`: React 18 + Vite 5 + Tailwind CSS public patient portal for online appointment booking (`VITE_API_URL` environment variable).
> - **Default credentials created by `server/seed.js`**:
>   - Admin: `admin@hospital.com` / `admin123` (or phone `1234567890`)
>   - Receptionist: `receptionist@hospital.com` / `receptionist123` (or phone `1234567891`)
>   - Doctor: `doctor@hospital.com` / `doctor123` (or phone `1234567892`)

---

## 📑 Table of Contents
1. [Project Overview & Production Topology](#1-project-overview--production-topology)
2. [MongoDB Setup: Free Atlas vs. Self-Hosted on AWS EC2](#2-mongodb-setup-free-atlas-vs-self-hosted-on-aws-ec2)
3. [AWS S3 Bucket Setup (File & Document Storage)](#3-aws-s3-bucket-setup-file--document-storage)
4. [AWS SES Setup (Transactional Emails)](#4-aws-ses-setup-transactional-emails)
5. [AWS EC2 Backend Deployment (Express API)](#5-aws-ec2-backend-deployment-express-api)
6. [Nginx Reverse Proxy & Free SSL (Let's Encrypt)](#6-nginx-reverse-proxy--free-ssl-lets-encrypt)
7. [Vercel Deployment (Admin & Client Portals)](#7-vercel-deployment-admin--client-portals)
8. [Master Environment Variable Matrix](#8-master-environment-variable-matrix)
9. [Database Seeding & Verification Checklist](#9-database-seeding--verification-checklist)

---

## 1. Project Overview & Production Topology

```
                              ┌───────────────────────────────────┐
                              │           Users / Web             │
                              └─────────┬───────────────┬─────────┘
                                        │               │
                     https://client.yourdomain.com      https://admin.yourdomain.com
                                        │               │
                                        ▼               ▼
                        ┌───────────────────┐   ┌───────────────────┐
                        │   Vercel: Client  │   │   Vercel: Admin   │
                        │  (Public Portal)  │   │  (Staff Portal)   │
                        └─────────┬─────────┘   └─────────┬─────────┘
                                  │                       │
                                  │   REST API Requests   │
                                  └───────────┬───────────┘
                                              │
                                   https://api.yourdomain.com (Port 443/80)
                                              │
                                              ▼
                        ┌───────────────────────────────────────────┐
                        │           AWS EC2 (Ubuntu Linux)          │
                        │  ┌─────────────────────────────────────┐  │
                        │  │        Nginx (Reverse Proxy)        │  │
                        │  └──────────────────┬──────────────────┘  │
                        │                     ▼                     │
                        │  ┌─────────────────────────────────────┐  │
                        │  │      Node.js / PM2 (Port 5000)      │  │
                        │  └───────┬──────────────┬──────────────┘  │
                        └──────────┼──────────────┼─────────────────┘
                                   │              │
                   ┌───────────────┴────┐   ┌─────┴──────────────┐
                   │                    │   │                    │
                   ▼                    ▼   ▼                    ▼
        ┌─────────────────────┐      ┌──────────────┐     ┌──────────────┐
        │  MongoDB Database   │      │    AWS S3    │     │   AWS SES    │
        │  (Atlas or Local)   │      │ (Doc/Images) │     │ (Email/OTPs) │
        └─────────────────────┘      └──────────────┘     └──────────────┘
```

---

## 2. MongoDB Setup: Free Atlas vs. Self-Hosted on AWS EC2

### Do you need a paid MongoDB subscription?
**NO.** You have two completely free choices:

| Feature | Option A: MongoDB Atlas (Recommended) | Option B: Self-Hosted on EC2 | Option C: AWS DocumentDB |
| :--- | :--- | :--- | :--- |
| **Cost** | **100% Free Forever** (M0 cluster, 512 MB) | **$0** (Runs on your EC2 instance) | Paid (~$50-$100/month, only 30-day trial) |
| **Maintenance** | Zero (Automated backups, managed TLS) | You manage updates, backups & storage | AWS managed |
| **Setup Time** | ~5 minutes via web UI | ~5 minutes via terminal commands | Complex VPC peering |
| **Best For** | Production & easy maintenance | Single-server all-in-one setup | Large enterprise clusters |

---

### Choice A: MongoDB Atlas Setup (Recommended)
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) and register for a free account.
2. Create a **Shared Cluster (M0 Free)**:
   - Cloud Provider: **AWS**
   - Region: Select the region nearest to your users (e.g. `ap-south-1` Mumbai, `us-east-1` N. Virginia).
3. Under **Security → Quickstart**:
   - Create a database user (e.g. `hms_admin`) with a strong password.
   - In **Network Access / IP Access List**, click **Add IP Address** → choose **Allow Access From Anywhere (`0.0.0.0/0`)** so your AWS EC2 instance and your local tools can connect.
4. Go to **Database → Connect → Drivers (Node.js)**.
5. Copy your connection string:
   ```env
   MONGO_URI=mongodb+srv://hms_admin:<password>@cluster0.abcde.mongodb.net/hms_db?retryWrites=true&w=majority
   ```

---

### Choice B: Self-Hosted MongoDB on the same AWS EC2
If you do not want an external database provider, run MongoDB directly on your EC2 instance:
```bash
# 1. Import MongoDB 7.0 GPG key and add repository
sudo apt-get install gnupg curl -y
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 2. Install and start MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod

# 3. Connection string in server/.env
MONGO_URI=mongodb://127.0.0.1:27017/hms_db
```

---

## 3. AWS S3 Bucket Setup (File & Document Storage)

Techastra-HMS stores doctor profile pictures, clinic logos, invoice stamps, and medical documents in an S3 bucket.

### Step 1: Create the S3 Bucket
1. Open the [AWS S3 Console](https://s3.console.aws.amazon.com/).
2. Click **Create bucket**.
3. **Bucket name**: `techastra-hms-storage-prod` (must be globally unique).
4. **Region**: e.g., `ap-south-1` (Asia Pacific - Mumbai) or your preferred region.
5. **Object Ownership**: ACLs disabled (recommended).
6. **Block Public Access**: 
   - If documents are served via presigned URLs (already implemented in backend): Keep "Block all public access" **ON**.
   - If images are public: uncheck "Block all public access" and add public read policy.

### Step 2: Configure CORS (Crucial for Client Uploads)
In bucket **Permissions** → **Cross-origin resource sharing (CORS)**, paste:
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": [
            "https://*.vercel.app",
            "http://localhost:5173",
            "http://localhost:3001"
        ],
        "ExposeHeaders": ["ETag"]
    }
]
```

### Step 3: Create an IAM User for the Backend
1. Go to AWS [IAM Console](https://us-east-1.console.aws.amazon.com/iam/) → **Users** → **Create user** (e.g. `techastra-hms-api`).
2. Select **Attach policies directly** → **Create policy** (JSON):
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3Access",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::techastra-hms-storage-prod",
                "arn:aws:s3:::techastra-hms-storage-prod/*"
            ]
        },
        {
            "Sid": "SESAccess",
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```
3. Attach this policy to the user.
4. Go to **Security credentials** tab → **Create access key** (Application running outside AWS or on EC2).
5. Save the **Access Key ID** and **Secret Access Key**.

---

## 4. AWS SES Setup (Transactional Emails)

Techastra-HMS sends booking confirmations and OTPs via AWS SES (`server/src/services/awsSesService.js`).

1. Open [AWS SES Console](https://console.aws.amazon.com/ses/).
2. In **Identities**, click **Create identity**:
   - If you have a custom domain: Select **Domain** (e.g. `yourhospital.com`) and add the generated DNS CNAME records to your DNS provider (Cloudflare, GoDaddy, Route53).
   - If you do not have a domain yet: Select **Email address** and verify `noreply@yourhospital.com` or your personal email by clicking the confirmation link sent to your inbox.
3. Note: In SES Sandbox, you can only send to verified recipient emails. When ready for production, click **Request production access** in the SES dashboard.

---

## 5. AWS EC2 Backend Deployment (Express API)

### Step 1: Launch EC2 Instance
- **OS**: Ubuntu Server 22.04 LTS or 24.04 LTS (64-bit x86).
- **Instance Type**: `t2.micro` or `t3.micro` (eligible for AWS Free Tier; `t3.small` recommended if hosting MongoDB on the same instance).
- **Key Pair**: Download `.pem` key (e.g. `hms-key.pem`).
- **Network Security Group**: Open the following incoming ports:
  - `SSH` (Port 22) from your IP.
  - `HTTP` (Port 80) from Anywhere (`0.0.0.0/0`).
  - `HTTPS` (Port 443) from Anywhere (`0.0.0.0/0`).
  - `Custom TCP` (Port 5000) from Anywhere (`0.0.0.0/0`) *[optional if proxying via Nginx]*.

### Step 2: Connect and Install Prerequisites
```bash
# Connect to EC2
ssh -i "hms-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP>

# Update server
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS & Git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

### Step 3: Clone Code & Configure Environment
```bash
# Clone the repository
git clone https://github.com/surajorg48/Techastra-HMS.git
cd Techastra-HMS/server

# Install backend dependencies
npm install --production

# Create production environment file
nano .env
```
Paste your production values into `server/.env`:
```env
PORT=5000
NODE_ENV=production
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=generate_a_64_char_random_jwt_secret_here
ENABLE_CAPTCHA=false

# AWS S3 Storage
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_S3_BUCKET_NAME=techastra-hms-storage-prod

# AWS SES Email
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
```

### Step 4: Seed the Database & Start Server with PM2
```bash
# Seed initial admin, doctor & receptionist accounts
node seed.js

# Start backend application with PM2
pm2 start src/server.js --name "hms-api"

# Configure PM2 to start on system boot
pm2 startup
# (Run the sudo env PATH... command printed in terminal)
pm2 save
```

Check API status:
```bash
curl http://localhost:5000/
# Should return: "API is running..."
```

---

## 6. Nginx Reverse Proxy & Free SSL (Let's Encrypt)

Exposing port 5000 directly is insecure. Nginx provides SSL termination, rate limiting, and forwards traffic securely.

### Step 1: Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

### Step 2: Configure Nginx Site
Edit configuration:
```bash
sudo nano /etc/nginx/sites-available/hms-api
```
Add:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com; # Or your EC2 Public IP if you have no domain yet

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/hms-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### Step 3: Install Free HTTPS Certificate (Let's Encrypt)
*(Requires your domain `api.yourdomain.com` pointing to the EC2 Elastic IP)*:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

---

## 7. Vercel Deployment (Admin & Client Portals)

Because this repository is a monorepo containing `Client/` and `Admin/`, you will create **TWO separate projects** in the Vercel Dashboard.

### Project 1: Patient Public Site (`Client`)
1. Log into [vercel.com](https://vercel.com) and click **Add New → Project**.
2. Import `surajorg48/Techastra-HMS`.
3. In Project Settings:
   - **Project Name**: `techastra-hms-client`
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `Client`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In **Environment Variables**:
   | Variable Name | Production Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://api.yourdomain.com/api` (or `http://<EC2-IP>:5000/api`) |
5. Click **Deploy**.

---

### Project 2: Staff & Admin Portal (`Admin`)
1. In Vercel, click **Add New → Project**.
2. Select the same repository: `surajorg48/Techastra-HMS`.
3. In Project Settings:
   - **Project Name**: `techastra-hms-admin`
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `Admin`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In **Environment Variables**:
   | Variable Name | Production Value |
   | :--- | :--- |
   | `VITE_API_URL` | `https://api.yourdomain.com/api` (or `http://<EC2-IP>:5000/api`) |
   | `VITE_APP_NAME` | `Techastra HMS Portal` |
   | `VITE_APP_VERSION` | `1.0.0` |
   | `VITE_ENABLE_NOTIFICATIONS` | `true` |
   | `VITE_ENABLE_ANALYTICS` | `false` |
5. Click **Deploy**.

---

## 8. Master Environment Variable Matrix

| App | Location | Key | Description | Example Production Value |
| :--- | :--- | :--- | :--- | :--- |
| **Server** | `server/.env` | `PORT` | Node server listen port | `5000` |
| **Server** | `server/.env` | `NODE_ENV` | Runtime environment | `production` |
| **Server** | `server/.env` | `MONGO_URI` | MongoDB Connection URI | `mongodb+srv://user:pass@cluster.mongodb.net/hms_db` |
| **Server** | `server/.env` | `JWT_SECRET` | Token signing secret | `8f94d0c1b37e89a4215f9e8024d29...` |
| **Server** | `server/.env` | `ENABLE_CAPTCHA` | Captcha toggle | `false` (or `true`) |
| **Server** | `server/.env` | `AWS_REGION` | AWS Data center region | `ap-south-1` |
| **Server** | `server/.env` | `AWS_ACCESS_KEY_ID` | IAM User access key | `AKIAIOSFODNN7EXAMPLE` |
| **Server** | `server/.env` | `AWS_SECRET_ACCESS_KEY` | IAM User secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| **Server** | `server/.env` | `AWS_S3_BUCKET_NAME` | S3 bucket for uploads | `techastra-hms-storage-prod` |
| **Server** | `server/.env` | `AWS_SES_FROM_EMAIL` | Verified sender email | `noreply@yourhospital.com` |
| **Admin** | Vercel Env | `VITE_API_URL` | Backend API URL | `https://api.yourdomain.com/api` |
| **Admin** | Vercel Env | `VITE_APP_NAME` | Portal Title | `Techastra HMS Portal` |
| **Client** | Vercel Env | `VITE_API_URL` | Backend API URL | `https://api.yourdomain.com/api` |

---

## 9. Database Seeding & Verification Checklist

Once deployed, verify every subsystem using this checklist:

### 1. Backend Verification
- [ ] `GET https://api.yourdomain.com/` returns `"API is running..."`.
- [ ] Database contains default seed users:
  ```bash
  cd ~/Techastra-HMS/server && node seed.js
  ```
- [ ] Test auth endpoint:
  ```bash
  curl -X POST https://api.yourdomain.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"admin@hospital.com","password":"admin123"}'
  ```
  *(Should return JSON with user ID, name, role, and JWT token)*.

### 2. Admin Portal Verification (`https://<admin-app>.vercel.app`)
- [ ] Login as **Admin**: `admin@hospital.com` / `admin123` → Full Dashboard displays stats and tabs.
- [ ] Login as **Receptionist**: `receptionist@hospital.com` / `receptionist123` → Slot & billing views.
- [ ] Login as **Doctor**: `doctor@hospital.com` / `doctor123` → Doctor appointment queue.
- [ ] Test file upload (e.g. Doctor photo or Invoice logo) → Verify it uploads to S3 bucket without CORS errors.

### 3. Client Portal Verification (`https://<client-app>.vercel.app`)
- [ ] Landing page renders hospital services and hero banner.
- [ ] Click **"Book Appointment"** → Multi-step form loads available department slots from API.
- [ ] Complete a booking → Confirmation screen generates an appointment ID.
- [ ] Admin portal shows the newly booked appointment in real-time.
