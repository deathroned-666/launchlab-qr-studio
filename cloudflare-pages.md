# Cloudflare Pages Setup

## Recommended path

Use the manual upload first, then move to GitHub-connected deploys once the first version is live.

## Step 1: Upload the first version

1. Sign in to Cloudflare.
2. Open **Workers & Pages**.
3. Choose **Create application**.
4. Choose **Pages**.
5. Choose **Upload assets**.
6. Upload `launchlab-qr-studio-cloudflare.zip`.
7. Name the project something like `launchlab-qr-studio`.
8. Deploy.

## Step 2: Connect GitHub for future changes

1. Create a new GitHub repository named `launchlab-qr-studio`.
2. Upload the files from this folder to that repository.
3. In Cloudflare, open **Workers & Pages**.
4. Create a new Pages project or update the existing one to connect to Git.
5. Choose the GitHub repository.
6. Set the build settings:
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `/`
7. Deploy from the `main` branch.

## Step 3: Before AdSense

1. Confirm the public contact details on `contact.html` are still current.
2. Add at least five focused content/tool pages.
3. Add a real domain.
4. Add a complete Privacy Policy with any analytics or ad providers you use.
5. Avoid ads near the generator tabs, download buttons, or live QR preview.

## Future update workflow

After GitHub is connected, edits can be made locally, pushed to GitHub, and Cloudflare Pages will publish the new version automatically.
