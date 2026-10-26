# Complete AWS Setup & Cloud Monitor Deployment Guide

> **Project:** Cloud Monitor (Cloud Resource & Application Monitoring Platform)  
> **Target Cloud Environment:** Amazon Web Services (AWS)  
> **Architecture Pattern:** AWS EC2 (Compute) + EBS (Storage) + ECR (Container Registry) + VPC / Security Groups + IAM (Instance Profile) + CloudWatch

---

## Table of Contents
1. [Prerequisites & AWS Free Tier Account Creation](#1-prerequisites--aws-free-tier-account-creation)
2. [What to Download & Install on Your Local Computer](#2-what-to-download--install-on-your-local-computer)
3. [Local Machine Authentication (`aws configure`)](#3-local-machine-authentication-aws-configure)
4. [Step-by-Step AWS Cloud Resources Configuration](#4-step-by-step-aws-cloud-resources-configuration)
   - 4.1 Create IAM User for Local CLI
   - 4.2 Create IAM Role for EC2 Instance Profile
   - 4.3 Create Amazon ECR Repositories
   - 4.4 Configure VPC Security Group (Firewall)
   - 4.5 Generate EC2 Key Pair (`.pem`)
5. [Launching the AWS EC2 Instance](#5-launching-the-aws-ec2-instance)
6. [Connecting to EC2 via SSH from Windows PowerShell](#6-connecting-to-ec2-via-ssh-from-windows-powershell)
7. [Configuring EC2 & Deploying the 7-Container Stack](#7-configuring-ec2--deploying-the-7-container-stack)
8. [Configuring CloudWatch Alarms & Monitoring](#8-configuring-cloudwatch-alarms--monitoring)
9. [Verification & Live Endpoints Checklist](#9-verification--live-endpoints-checklist)
10. [Cost Management, Free-Tier Safety & Cleanup](#10-cost-management-free-tier-safety--cleanup)
11. [Troubleshooting & Common Gotchas](#11-troubleshooting--common-gotchas)

---

## 1. Prerequisites & AWS Free Tier Account Creation

### 1.1 Requirements
* **Valid Email Address** (not previously registered on AWS).
* **Phone Number** (for SMS or automated voice call OTP verification).
* **Payment Method**:
  * International Visa, Mastercard, or RuPay (with international online transactions enabled).
  * AWS will charge a temporary authorization fee of **~₹2 (India) or $1.00 (Global)**, which is refunded automatically within 2–5 business days.

### 1.2 Step-by-Step Account Registration
1. Navigate to **[https://aws.amazon.com/free/](https://aws.amazon.com/free/)** in your browser.
2. Click **Create a Free Account**.
3. **Root User Email**: Enter your primary email and an **AWS account name** (e.g., `cloudmonitor-admin`).
4. **Email Verification**: Check your email for the verification code and enter it.
5. **Root Password**: Create a strong password (minimum 12 characters with uppercase, lowercase, numbers, and symbols).
6. **Contact Information**:
   * Select **Personal** (for your own projects/studies).
   * Enter your name, phone number, and address accurately.
7. **Billing Information**:
   * Enter your debit/credit card details. Complete the bank OTP authentication.
8. **Identity Verification**:
   * Choose SMS or Voice Call, enter the verification code received on your phone.
9. **Select a Support Plan**:
   * Choose **Basic Support - Free** (Do NOT choose Developer or Business support).
10. Click **Complete sign up**. Wait 5–15 minutes for your account to become fully active.

---

## 2. What to Download & Install on Your Local Computer

To manage, push, and deploy your project from your Windows computer to AWS, install the following tools:

### Tool 1: AWS CLI v2 (Command Line Interface)
* **What it does:** Allows your computer to interact with AWS services, authenticate Docker with ECR, and manage cloud infrastructure.
* **Download link:** [https://awscli.amazonaws.com/AWSCLIV2.msi](https://awscli.amazonaws.com/AWSCLIV2.msi)
* **Installation via PowerShell (Alternative):**
  ```powershell
  winget install Amazon.AWSCLI
  ```
* **Verify:**
  ```powershell
  aws --version
  # Expected output: aws-cli/2.x.x Python/3.x.x Windows/...
  ```

### Tool 2: OpenSSH Client (Built-in)
* **What it does:** Connects your local terminal directly to the remote AWS EC2 Linux shell.
* Windows 10 and 11 have OpenSSH pre-installed. Verify in PowerShell:
  ```powershell
  ssh -V
  # Expected output: OpenSSH_for_Windows_...
  ```

### Tool 3: Git & Docker Desktop
* Both tools are already set up on your machine for building and maintaining container images.

---

## 3. Local Machine Authentication (`aws configure`)

### 3.1 Create an IAM User with Programmatic Access
1. Open the **[AWS Management Console](https://console.aws.amazon.com/)** and sign in as the **Root User**.
2. In the top search bar, type **IAM** and press Enter.
3. In the left navigation, click **Users** → **Create user**.
4. **User name**: `local-deployer`.
5. Under permissions, select **Attach policies directly**.
6. Select:
   * `AmazonEC2FullAccess`
   * `AmazonEC2ContainerRegistryFullAccess`
   * `CloudWatchFullAccess`
7. Click **Next** → **Create user**.
8. Click on your newly created user (`local-deployer`).
9. Navigate to the **Security credentials** tab.
10. Scroll down to **Access keys** and click **Create access key**.
11. Select **Command Line Interface (CLI)** → check the confirmation box → click **Next** → **Create access key**.
12. **Download the `.csv` file** or copy both:
    * **Access Key ID** (e.g., `AKIAIOSFODNN7EXAMPLE`)
    * **Secret Access Key** (e.g., `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)

### 3.2 Configure the Credentials in PowerShell
Open Windows PowerShell and run:
```powershell
aws configure
```
Enter the requested details:
```text
AWS Access Key ID [None]: <Paste your Access Key ID>
AWS Secret Access Key [None]: <Paste your Secret Access Key>
Default region name [None]: us-east-1
Default output format [None]: json
```
*(Tip: You can use `us-east-1` (N. Virginia) or `ap-south-1` (Mumbai) depending on your preferred AWS region).*

Test that authentication works:
```powershell
aws sts get-caller-identity
```
If configured correctly, this outputs your User ID, Account Number, and ARN.

---

## 4. Step-by-Step AWS Cloud Resources Configuration

### 4.1 Create an IAM Role for EC2 (Instance Profile)
This allows your EC2 server to communicate with Amazon ECR securely without saving hardcoded passwords on the server.
1. In the AWS Console, search for **IAM** → **Roles** → **Create role**.
2. **Trusted entity type**: Select **AWS service**.
3. **Use case**: Select **EC2**. Click **Next**.
4. **Permissions policies**: Search for `AmazonEC2ContainerRegistryReadOnly` and check the box.
5. Click **Next**.
6. **Role name**: `CloudMonitor-EC2-Role`.
7. Click **Create role**.

---

### 4.2 Create Amazon ECR Repositories
Amazon ECR stores your container images. Run these commands directly in your local PowerShell:
```powershell
# 1. Create Backend Repository
aws ecr create-repository --repository-name cloudmonitor-backend --region us-east-1

# 2. Create Frontend Repository
aws ecr create-repository --repository-name cloudmonitor-frontend --region us-east-1
```

---

### 4.3 Configure the VPC Security Group (Firewall)
1. In the AWS Console, search for **EC2** → click **Security Groups** (under Network & Security in the left sidebar).
2. Click **Create security group**.
3. **Security group name**: `cloudmonitor-production-sg`.
4. **Description**: `Firewall for Cloud Monitor observability and web services`.
5. **VPC**: Leave as default VPC.
6. Under **Inbound rules**, click **Add rule** for each entry:

| Rule # | Type | Port Range | Source | Purpose |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **SSH** | `22` | **My IP** | Secure administrator access to EC2 shell |
| **2** | **HTTP** | `80` | `0.0.0.0/0` | Public web reverse proxy traffic |
| **3** | **Custom TCP** | `8000` | `0.0.0.0/0` | Cloud Monitor FastAPI Backend & `/docs` |
| **4** | **Custom TCP** | `3000` | `0.0.0.0/0` | Grafana Observability Dashboards |
| **5** | **Custom TCP** | `9090` | `0.0.0.0/0` | Prometheus Metrics & PromQL UI |
| **6** | **Custom TCP** | `5173` | `0.0.0.0/0` | React / Vite Frontend UI |

7. **Outbound rules**: Leave default (`All traffic` to `0.0.0.0/0`).
8. Click **Create security group**.

---

### 4.4 Create and Save an EC2 Key Pair
1. In the EC2 Console, click **Key Pairs** (under Network & Security).
2. Click **Create key pair**.
3. **Name**: `cloudmonitor-key`.
4. **Key pair type**: `RSA`.
5. **Private key file format**: `.pem` (for use with OpenSSH).
6. Click **Create key pair**.
7. The file `cloudmonitor-key.pem` will be downloaded to your computer.
8. Move `cloudmonitor-key.pem` to a permanent location, e.g.:
   `C:\Users\sarne\.ssh\cloudmonitor-key.pem` or inside your project folder.

---

## 5. Launching the AWS EC2 Instance

1. In the EC2 Console, click **Instances** → **Launch instances**.
2. **Name and tags**:
   * Name: `CloudMonitor-Production-Server`
3. **Application and OS Images (Amazon Machine Image)**:
   * Select **Amazon Linux 2023 AMI** (Free Tier eligible, Nitro hypervisor enabled).
   * Architecture: `64-bit (x86)`.
4. **Instance type**:
   * `t2.micro` or `t3.micro` (Free Tier eligible: 1 vCPU, 1 GiB RAM).
   * *Note:* For high continuous workload evaluation, `t3.medium` (2 vCPU, 4 GiB RAM) is recommended as noted in your report.
5. **Key pair (login)**:
   * Select `cloudmonitor-key`.
6. **Network settings**:
   * Click **Edit**.
   * Auto-assign Public IP: **Enable**.
   * Firewall: Choose **Select existing security group** → select `cloudmonitor-production-sg`.
7. **Configure storage**:
   * Set root volume: `20 GiB` of `gp3` SSD (AWS Free Tier grants up to 30 GiB of EBS storage free).
8. **Advanced details (Scroll to bottom)**:
   * **IAM instance profile**: Select `CloudMonitor-EC2-Role` (created in Step 4.1).
9. Click **Launch instance**.
10. Wait 1–2 minutes until the Instance state is **Running** and Status check shows **2/2 checks passed**.
11. Note down your instance's **Public IPv4 address** (e.g., `54.210.85.123`).

---

## 6. Connecting to EC2 via SSH from Windows PowerShell

1. Open PowerShell and navigate to the directory where your `.pem` key is stored:
   ```powershell
   cd C:\Users\sarne\Downloads
   ```
2. *(Optional security setting on Windows)* Ensure key permissions are private:
   ```powershell
   icacls.exe cloudmonitor-key.pem /reset
   icacls.exe cloudmonitor-key.pem /grant:r "$($env:USERNAME):(R)"
   icacls.exe cloudmonitor-key.pem /inheritance:r
   ```
3. Connect to your instance via SSH:
   ```powershell
   ssh -i "cloudmonitor-key.pem" ec2-user@<YOUR_EC2_PUBLIC_IP>
   ```
4. When prompted with `Are you sure you want to continue connecting (yes/no/[fingerprint])?`, type:
   ```text
   yes
   ```
5. You are now inside the remote Amazon Linux 2023 terminal!

---

## 7. Configuring EC2 & Deploying the 7-Container Stack

Run the following commands directly inside the EC2 SSH session:

### 7.1 Setup Swap Memory (Crucial for `t2.micro` / `t3.micro`)
Because `t2.micro` has 1 GB RAM and building images requires temporary compilation memory, enable a 2 GB swap file:
```bash
sudo dd if=/dev/zero of=/swapfile bs=128M count=16
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

### 7.2 Install Docker, Docker Compose & Git
```bash
# 1. Update OS packages
sudo dnf update -y

# 2. Install Docker and Git
sudo dnf install -y docker git

# 3. Start Docker daemon and enable at boot
sudo systemctl enable --now docker

# 4. Add ec2-user to docker group (run without sudo)
sudo usermod -aG docker ec2-user
newgrp docker

# 5. Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 6. Verify installations
docker --version
docker compose version
```

### 7.3 Clone Project Repository & Launch Stack
```bash
# Clone the repository
git clone https://github.com/blackpython34/cloud_monitor.git
cd cloud_monitor

# Copy environment variables
cp .env.example .env

# Build and start all 7 services in background
docker compose up -d --build
```

### 7.4 Verify Running Containers
Check that all 7 containers are healthy:
```bash
docker compose ps
```
You should see:
* `cloudmonitor-backend` — Up (healthy)
* `cloudmonitor-prometheus` — Up (healthy)
* `cloudmonitor-grafana` — Up (healthy)
* `cloudmonitor-alertmanager` — Up (healthy)
* `cloudmonitor-node-exporter` — Up
* `cloudmonitor-cadvisor` — Up
* `cloudmonitor-frontend` — Up

---

## 8. Configuring CloudWatch Alarms & Monitoring

To fulfill the AWS monitoring specification in your report:

1. In the AWS Console, search for **CloudWatch** → go to **Alarms** → **All alarms** → **Create alarm**.
2. Click **Select metric** → choose **EC2** → **Per-Instance Metrics**.
3. Find your EC2 instance ID and select metric: `CPUUtilization`. Click **Select metric**.
4. **Metric settings**:
   * Statistic: `Average`
   * Period: `5 minutes`
5. **Conditions**:
   * Threshold type: `Static`
   * Whenever CPUUtilization is: `Greater` than `80`
6. **Actions**:
   * Trigger: `In alarm`
   * Send notification to: `Create new topic` → name: `CloudMonitor-Admin-Alerts`
   * Email address: Enter your email address.
7. Click **Create topic** (Check your email inbox and click **Confirm subscription**).
8. Alarm name: `CloudMonitor-HighCPU-Warning` → Click **Create alarm**.

---

## 9. Verification & Live Endpoints Checklist

Replace `<EC2_PUBLIC_IP>` with the public IP address of your EC2 instance:

| Component | Target URL | Credentials / Verification |
| :--- | :--- | :--- |
| **Backend Health Check** | `http://<EC2_PUBLIC_IP>:8000/health` | Returns `{"status": "healthy"}` |
| **Interactive API Docs** | `http://<EC2_PUBLIC_IP>:8000/docs` | Swagger UI with all APM endpoints |
| **Backend Raw Metrics** | `http://<EC2_PUBLIC_IP>:8000/metrics` | Prometheus metrics scrape target |
| **Prometheus Dashboard** | `http://<EC2_PUBLIC_IP>:9090` | PromQL console & Target health |
| **Grafana Dashboards** | `http://<EC2_PUBLIC_IP>:3000` | Login: `admin` / `admin` |
| **Alertmanager UI** | `http://<EC2_PUBLIC_IP>:9093` | Alert routing console |
| **React Frontend Portal** | `http://<EC2_PUBLIC_IP>:5173` | Unified operator portal |

---

## 10. Cost Management, Free-Tier Safety & Cleanup

To ensure you stay 100% within the AWS Free Tier and incur **$0.00 unexpected charges**:

### Free Tier Limits (First 12 Months):
* **EC2**: 750 hours/month of `t2.micro` or `t3.micro` (Enough to run 1 instance 24/7 all month).
* **EBS Storage**: 30 GB of gp3 SSD storage.
* **CloudWatch**: 10 custom metrics and 10 alarms free.

### When Not In Use:
* If you are not presenting or testing, **Stop** the instance to preserve credits:
  * In the EC2 Console: Select instance → **Instance state** → **Stop instance**.
  * *(Stopping preserves your Docker setup, disk files, and configs; you only restart it with 1 click when you need it).*
* If you want to permanently delete everything after your viva:
  * EC2 Console → Select instance → **Instance state** → **Terminate instance**.
  * ECR Console → Select repositories → **Delete**.

---

## 11. Troubleshooting & Common Gotchas

### Issue 1: Connection timed out when accessing port 8000 / 3000 in browser
* **Cause**: AWS Security Group does not have the custom port opened.
* **Fix**: Go to EC2 → Security Groups → Edit Inbound Rules → Add Custom TCP port (`8000`, `3000`, etc.) with Source `0.0.0.0/0`.

### Issue 2: `Permission denied (publickey)` during SSH
* **Cause**: Wrong username or improper file permissions on the `.pem` key.
* **Fix**: Ensure you use `ec2-user` (for Amazon Linux) or `ubuntu` (for Ubuntu AMI). Never use `root`. Verify path to `cloudmonitor-key.pem`.

### Issue 3: Container killed or build freeze (`Killed: process out of memory`)
* **Cause**: Compiling Python wheels or Node modules exhausted the 1 GB physical memory of a `t2.micro` instance.
* **Fix**: Ensure you added the 2 GB swap file as shown in [Section 7.1](#71-setup-swap-memory-crucial-for-t2micro--t3micro).
