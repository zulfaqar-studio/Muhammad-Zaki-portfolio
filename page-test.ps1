param(
    [string]$RepositoryPath = (Get-Location).Path,
    [string]$Remote = 'origin',
    [string]$SourceZip = '',
    [string]$Branch = 'page-test',
    [string]$BasePath = '/something/something/test/',
    [string]$SiteUrl = '',
    [switch]$ForcePush,
    [switch]$RunWorkflow
)

$ErrorActionPreference = 'Stop'

function Normalize-BasePath([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return '/' }
    $p = $Value.Trim()
    if (-not $p.StartsWith('/')) { $p = '/' + $p }
    if (-not $p.EndsWith('/')) { $p += '/' }
    return $p
}

function Write-FileUtf8([string]$Path, [string]$Content) {
    $parent = Split-Path -Parent $Path
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

$RepositoryPath = (Resolve-Path $RepositoryPath).Path
$BasePath = Normalize-BasePath $BasePath

if ([string]::IsNullOrWhiteSpace($SiteUrl)) {
    $SiteUrl = 'https://yourdomain.com' + $BasePath
} else {
    $SiteUrl = $SiteUrl.TrimEnd('/') + $BasePath
}

Set-Location $RepositoryPath

git rev-parse --is-inside-work-tree | Out-Null
git remote get-url $Remote | Out-Null

git fetch $Remote --prune

if ($SourceZip) {
    $SourceZip = (Resolve-Path $SourceZip).Path
    if (-not (Test-Path $SourceZip)) { throw "Source ZIP not found: $SourceZip" }
}

# The test branch is deliberately replaced with the supplied updated source.
# Production branches are not touched by this script.
$tmpRoot = Join-Path $env:TEMP ("zaki-page-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
$tmpSource = Join-Path $tmpRoot 'source'
New-Item -ItemType Directory -Force -Path $tmpSource | Out-Null

try {
    if ($SourceZip) {
        Expand-Archive -LiteralPath $SourceZip -DestinationPath $tmpSource -Force
        $sourceRoot = $tmpSource
        $children = @(Get-ChildItem -LiteralPath $tmpSource -Force)
        if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
            $sourceRoot = $children[0].FullName
        }
    } else {
        # Without a ZIP, use the current working tree as the source, excluding Git metadata.
        $sourceRoot = Join-Path $tmpRoot 'current'
        New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null
        robocopy $RepositoryPath $sourceRoot /E /XD .git node_modules client\dist _site | Out-Null
        if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }
    }

    # Add a test-only Pages workflow to the source tree.
    $workflow = @'
name: Deploy portfolio page-test

on:
  push:
    branches:
      - page-test
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: portfolio-page-test
  cancel-in-progress: true

env:
  DEEPSEEK_MODEL: ${{ vars.DEEPSEEK_MODEL || secrets.DEEPSEEK_MODEL || 'deepseek-flash' }}
  DRIVE_CHATBOT_FOLDER_ID: ${{ vars.DRIVE_CHATBOT_FOLDER_ID || secrets.DRIVE_CHATBOT_FOLDER_ID }}
  DRIVE_MAX_CONTEXT_CHARS: ${{ vars.DRIVE_MAX_CONTEXT_CHARS || secrets.DRIVE_MAX_CONTEXT_CHARS || '30000' }}
  DRIVE_MEDIA_FOLDER_ID: ${{ vars.DRIVE_MEDIA_FOLDER_ID || secrets.DRIVE_MEDIA_FOLDER_ID }}
  DRIVE_OVERALL_FOLDER_ID: ${{ vars.DRIVE_OVERALL_FOLDER_ID || secrets.DRIVE_OVERALL_FOLDER_ID }}
  DRIVE_OVERALL_MANIFEST_NAME: ${{ vars.DRIVE_OVERALL_MANIFEST_NAME || secrets.DRIVE_OVERALL_MANIFEST_NAME || 'drive-media.json' }}
  GOOGLE_DRIVE_PUBLIC_API_KEY: ${{ vars.GOOGLE_DRIVE_PUBLIC_API_KEY || secrets.GOOGLE_DRIVE_PUBLIC_API_KEY }}
  GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID: ${{ vars.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID || secrets.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID }}
  GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID: ${{ vars.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID || secrets.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID }}
  GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || vars.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL }}
  GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY || vars.GOOGLE_SERVICE_ACCOUNT_KEY }}
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || vars.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY }}
  VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL || secrets.VITE_API_BASE_URL }}
  VITE_BASE_PATH: '__BASE_PATH__'
  VITE_PUBLIC_SITE_URL: '__SITE_URL__'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: global
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install dependencies
        run: npm install

      - name: Validate configuration
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
        run: |
          test -n "$DEEPSEEK_API_KEY" || { echo "DEEPSEEK_API_KEY is missing."; exit 1; }
          test -n "$DRIVE_CHATBOT_FOLDER_ID" || { echo "DRIVE_CHATBOT_FOLDER_ID is missing."; exit 1; }
          test -n "$DRIVE_MEDIA_FOLDER_ID" || { echo "DRIVE_MEDIA_FOLDER_ID is missing."; exit 1; }
          test -n "$GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL" || { echo "GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL is missing."; exit 1; }
          test -n "$GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" || { echo "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is missing."; exit 1; }

      - name: Generate static repository media manifest
        run: node scripts/generate-static-media-manifest.mjs

      - name: Generate chatbot knowledge
        run: node scripts/generate-deepseek-data.mjs
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          DEEPSEEK_MODEL: ${{ env.DEEPSEEK_MODEL }}
          DRIVE_CHATBOT_FOLDER_ID: ${{ env.DRIVE_CHATBOT_FOLDER_ID }}
          DRIVE_MAX_CONTEXT_CHARS: ${{ env.DRIVE_MAX_CONTEXT_CHARS }}
          GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: ${{ env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL }}
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ env.GOOGLE_SERVICE_ACCOUNT_KEY }}
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: ${{ env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY }}
          DEEPSEEK_DRIVE_MAX_FILES: '120'
          DEEPSEEK_DRIVE_MAX_DEPTH: '5'
          DEEPSEEK_KNOWLEDGE_MAX_TOKENS: '12000'

      - name: Generate public Drive media manifest
        run: node scripts/generate-drive-media-manifest.mjs
        env:
          GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: ${{ env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL }}
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ env.GOOGLE_SERVICE_ACCOUNT_KEY }}
          GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: ${{ env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY }}
          GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID: ${{ env.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID || env.DRIVE_MEDIA_FOLDER_ID }}
          GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID: ${{ env.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID }}
          PUBLIC_DRIVE_MAX_FILES: '500'
          PUBLIC_DRIVE_MAX_DEPTH: '6'

      - name: Build public client
        run: npm run build:client
        env:
          NODE_ENV: production
          VITE_API_BASE_URL: ${{ env.VITE_API_BASE_URL }}
          VITE_BASE_PATH: '__BASE_PATH__'
          VITE_PUBLIC_SITE_URL: '__SITE_URL__'

      - name: Prepare nested test site
        shell: bash
        env:
          DEPLOY_BASE_PATH: '__BASE_PATH__'
        run: |
          set -euo pipefail
          rm -rf _site
          mkdir -p "_site${DEPLOY_BASE_PATH}"
          cp -R client/dist/. "_site${DEPLOY_BASE_PATH}"
          touch _site/.nojekyll
          cat > _site/index.html <<HTML
          <!doctype html>
          <html><head><meta http-equiv="refresh" content="0; url=${DEPLOY_BASE_PATH}"></head><body><a href="${DEPLOY_BASE_PATH}">Open page-test</a></body></html>
          HTML

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: _site

      - name: Deploy page-test
        id: deployment
        uses: actions/deploy-pages@v4
'@

    $workflow = $workflow.Replace('__BASE_PATH__', $BasePath).Replace('__SITE_URL__', $SiteUrl)
    Write-FileUtf8 (Join-Path $sourceRoot '.github/workflows/page-test.yml') $workflow

    # Add a small config note so the branch clearly documents the public test URL.
    $testInfo = @"
# PAGE-TEST

This branch is a disposable GitHub Pages test deployment.

Base path: $BasePath
Test URL:  $SiteUrl

The base path is injected into Astro as VITE_BASE_PATH and the built files are placed
under the same nested path in the Pages artifact.

IMPORTANT: GitHub Pages has one active Pages deployment per repository. Deploying this
branch replaces the currently deployed Pages artifact. Use a separate repository if
you need production and page-test online simultaneously.
"@
    Write-FileUtf8 (Join-Path $sourceRoot 'PAGE-TEST.txt') $testInfo

    # Start from an orphan branch and replace its contents with the updated source.
    $tmpBranch = "__page_test_reset_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    git checkout --orphan $tmpBranch
    if ((git show-ref --verify --quiet "refs/heads/$Branch")) {
        git branch -D $Branch
    }
    git rm -rf . 2>$null
    if ($LASTEXITCODE -ne 0) { $LASTEXITCODE = 0 }

    robocopy $sourceRoot $RepositoryPath /E /XD .git node_modules client\dist _site | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }

    git add -A
    git commit -m "test: reset page-test with current portfolio"

    if ($ForcePush) {
        git push $Remote "+HEAD:$Branch"
    } else {
        git push $Remote "HEAD:$Branch"
    }

    git branch -M $Branch
    git branch --set-upstream-to="$Remote/$Branch" $Branch 2>$null

    if ($RunWorkflow) {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            throw 'GitHub CLI (gh) is required for -RunWorkflow.'
        }
        gh workflow run page-test.yml --ref $Branch
    }

    Write-Host ''
    Write-Host 'PAGE-TEST RESET COMPLETE' -ForegroundColor Green
    Write-Host "Branch:    $Branch"
    Write-Host "Base path: $BasePath"
    Write-Host "URL:       $SiteUrl"
    Write-Host "Force push: $ForcePush"
    if ($RunWorkflow) { Write-Host 'Workflow:  dispatched' }
    Write-Host ''
    Write-Host 'Note: GitHub Pages is a single deployment per repository; page-test replaces the current Pages artifact.' -ForegroundColor Yellow
}
finally {
    Set-Location $RepositoryPath
    if (Test-Path $tmpRoot) { Remove-Item -Recurse -Force $tmpRoot }
}
