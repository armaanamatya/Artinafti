# Google Imagen 4.0 Upscaler Setup Guide

Complete setup instructions for using the Imagen upscaler notebook.

---

## Step 1: Create a Google Cloud Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account or create one
3. Accept the terms of service

---

## Step 2: Create a Project

1. In the Google Cloud Console, click the project dropdown at the top
2. Click **New Project**
3. Enter a project name (e.g., `image-upscaling`)
4. Click **Create**
5. Note your **Project ID** (you'll need this later)

---

## Step 3: Enable Billing

1. Go to [Billing](https://console.cloud.google.com/billing) in Google Cloud Console
2. Click **Link a billing account** or **Create account**
3. Add a payment method (credit/debit card)
4. Link the billing account to your project

> **Note**: New accounts get $300 free credits valid for 90 days.

---

## Step 4: Enable Vertex AI API

### Option A: Via Console
1. Go to [Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)
2. Select your project
3. Click **Enable**

### Option B: Via Command Line
```bash
gcloud services enable aiplatform.googleapis.com
```

---

## Step 5: Install Google Cloud CLI

### Windows
1. Download the installer from [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Run the installer (`GoogleCloudSDKInstaller.exe`)
3. Follow the installation wizard
4. Restart your terminal/command prompt

### macOS
```bash
brew install --cask google-cloud-sdk
```

### Linux
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### Verify Installation
```bash
gcloud --version
```

---

## Step 6: Authenticate with Google Cloud

### Initialize gcloud (first time only)
```bash
gcloud init
```
- Select your Google account
- Select your project
- Choose a default region (us-central1 recommended)

### Set Up Application Default Credentials
```bash
gcloud auth application-default login
```
- A browser window will open
- Sign in with your Google account
- Grant the requested permissions
- You should see "Credentials saved to file"

### Verify Authentication
```bash
gcloud auth list
```
You should see your account with an asterisk (*) indicating it's active.

---

## Step 7: Set Your Project

```bash
gcloud config set project YOUR_PROJECT_ID
```

Replace `YOUR_PROJECT_ID` with your actual project ID.

### Verify Project
```bash
gcloud config get-value project
```

---

## Step 8: Prepare Your Images

1. Place your input images in the `input/` folder in the repository
2. Supported formats: JPG, PNG, WEBP

---

## Step 9: Configure the Notebook

Open `resolution-upscaling/imagen_upscaler.ipynb` and update **Cell 3**:

```python
# Your Google Cloud Project ID
PROJECT_ID = "your-project-id"  # Replace with your project ID

# Region (us-central1 is recommended)
REGION = "us-central1"

# Target DPI for print
DPI = 150

# Your images configuration
IMAGE_CONFIGS = [
    {
        "image_id": "my-image",
        "input_path": "input/my-image.jpg",
        "width_inches": 10,
        "height_inches": 20,
    },
    # Add more images as needed
]

# Upscale factor: "x2", "x3", or "x4"
UPSCALE_FACTOR = "x4"
```

---

## Step 10: Run the Notebook

1. Open the notebook in Jupyter or VS Code
2. Run cells in order:
   - **Cell 1**: Setup environment (installs packages)
   - **Cell 2**: Authenticate (uses your gcloud credentials)
   - **Cell 3**: Configuration (set your options)
   - **Cell 4**: Define functions
   - **Cell 5**: Run batch upscaling

---

## Pricing Information

Imagen 4.0 upscaling costs vary by upscale factor:

| Factor | Approximate Cost |
|--------|------------------|
| x2     | ~$0.02 per image |
| x3     | ~$0.03 per image |
| x4     | ~$0.04 per image |

Check [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing) for current rates.

---

## Troubleshooting

### "Could not get default credentials"
```bash
gcloud auth application-default login
```

### "Permission denied" or "403 Forbidden"
- Ensure billing is enabled
- Ensure Vertex AI API is enabled
- Wait a few minutes after enabling (APIs can take time to propagate)

### "Project not found"
```bash
gcloud config set project YOUR_PROJECT_ID
```

### Check your current configuration
```bash
gcloud config list
```

---

## Quick Reference Commands

```bash
# List projects
gcloud projects list

# Set active project
gcloud config set project PROJECT_ID

# Check authentication
gcloud auth list

# Re-authenticate
gcloud auth application-default login

# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Check enabled APIs
gcloud services list --enabled
```
