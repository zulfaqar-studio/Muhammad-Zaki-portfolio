[CmdletBinding()]
param(
    [string]$Branch = "page-test",
    [string]$Remote = "origin",
    [switch]$RunWorkflow
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "git $($Arguments -join ' ')" -ForegroundColor DarkGray

    & git @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }
}

function Invoke-Gh {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Host "gh $($Arguments -join ' ')" -ForegroundColor DarkGray

    & gh @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "GitHub CLI command failed."
    }
}

# ================================================================
# REQUIRE EXISTING REPOSITORY
# ================================================================

if (-not (Test-Path ".git")) {
    throw @"
This is not a Git repository.

Run this script from:
C:\Users\fiyad\Downloads\zaki portfolio statics
"@
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " ZAKI PORTFOLIO - PAGE TEST PUSH" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

# ================================================================
# SAFETY CHECK
# ================================================================

$currentBranch = (git branch --show-current).Trim()

Write-Host "Current branch: $currentBranch" -ForegroundColor White
Write-Host "Target branch : $Branch" -ForegroundColor White
Write-Host ""

if ($currentBranch -ne $Branch) {

    Write-Host "Switching to $Branch..." -ForegroundColor Yellow

    & git show-ref --verify --quiet "refs/heads/$Branch"

    if ($LASTEXITCODE -eq 0) {
        Invoke-Git @("switch", $Branch)
    }
    else {
        throw "Local branch '$Branch' does not exist."
    }
}

# ================================================================
# FETCH REMOTE
# ================================================================

Write-Host ""
Write-Host "Fetching remote information..." -ForegroundColor Cyan

Invoke-Git @("fetch", $Remote, "--prune")

# ================================================================
# SHOW DIVERGENCE
# ================================================================

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " CURRENT PAGE-TEST STATUS" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

git status

Write-Host ""

$localOnly = @(git rev-list "$Remote/$Branch..$Branch")

$remoteOnly = @(git rev-list "$Branch..$Remote/$Branch")

Write-Host "Local-only commits : $($localOnly.Count)" -ForegroundColor Yellow
Write-Host "Remote-only commits: $($remoteOnly.Count)" -ForegroundColor Yellow

if ($localOnly.Count -gt 0) {
    Write-Host ""
    Write-Host "Local commits that will be pushed:" -ForegroundColor Green
    git log --oneline "$Remote/$Branch..$Branch"
}

if ($remoteOnly.Count -gt 0) {
    Write-Host ""
    Write-Host "Remote commits that will be replaced:" -ForegroundColor Red
    git log --oneline "$Branch..$Remote/$Branch"
}

# ================================================================
# CONFIRM FORCE PUSH
# ================================================================

if ($remoteOnly.Count -gt 0) {

    Write-Host ""
    Write-Host "WARNING:" -ForegroundColor Red
    Write-Host "origin/$Branch contains commits that are NOT in your local branch." -ForegroundColor Red
    Write-Host ""
    Write-Host "This script will replace origin/$Branch with your LOCAL $Branch." -ForegroundColor Yellow
    Write-Host "MAIN WILL NOT BE TOUCHED." -ForegroundColor Green
    Write-Host ""

    $answer = Read-Host "Type PAGE-TEST to continue"

    if ($answer -ne "PAGE-TEST") {
        Write-Host "Cancelled. Nothing was pushed." -ForegroundColor Yellow
        exit 0
    }
}

# ================================================================
# ADD PAGE-TEST WORKFLOW
# ================================================================

$workflowPath = ".github/workflows/page-test.yml"

if (Test-Path $workflowPath) {

    Write-Host ""
    Write-Host "Found page-test workflow:" -ForegroundColor Green
    Write-Host $workflowPath -ForegroundColor Gray

    Invoke-Git @("add", $workflowPath)

    $staged = @(git diff --cached --name-only)

    if ($staged.Count -gt 0) {

        Write-Host ""
        Write-Host "Committing page-test workflow..." -ForegroundColor Cyan

        Invoke-Git @(
            "commit",
            "-m",
            "ci(page-test): update test deployment workflow"
        )
    }
}
else {
    Write-Host ""
    Write-Host "No page-test workflow file found." -ForegroundColor Yellow
    Write-Host "Continuing with existing branch contents." -ForegroundColor Gray
}

# ================================================================
# SHOW FINAL LOCAL STATE
# ================================================================

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " FINAL LOCAL PAGE-TEST" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

git status

Write-Host ""
git log --oneline --decorate -8

# ================================================================
# PUSH ONLY PAGE-TEST
# ================================================================

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " PUSHING PAGE-TEST ONLY" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

Invoke-Git @(
    "push",
    "--force-with-lease",
    "-u",
    $Remote,
    "$Branch"
)

# ================================================================
# VERIFY
# ================================================================

Write-Host ""
Write-Host "Fetching again to verify..." -ForegroundColor Cyan

Invoke-Git @("fetch", $Remote, "--prune")

$localHash = (git rev-parse $Branch).Trim()
$remoteHash = (git rev-parse "$Remote/$Branch").Trim()

Write-Host ""
Write-Host "Local page-test : $localHash" -ForegroundColor Gray
Write-Host "Remote page-test: $remoteHash" -ForegroundColor Gray

if ($localHash -ne $remoteHash) {
    throw "Verification failed: local and remote page-test commits do not match."
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host " PAGE-TEST PUSH SUCCESSFUL" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Branch:" -ForegroundColor Cyan
Write-Host "  $Remote/$Branch"

Write-Host ""
Write-Host "Main was NOT changed." -ForegroundColor Green

Write-Host ""
Write-Host "Branch source:" -ForegroundColor Cyan
Write-Host "  https://github.com/zulfaqar-studio/Muhammad-Zaki-portfolio/tree/$Branch"

Write-Host ""
Write-Host "Test Pages URL:" -ForegroundColor Cyan
Write-Host "  https://zulfaqar-studio.github.io/Muhammad-Zaki-portfolio/test/"

# ================================================================
# OPTIONAL WORKFLOW DISPATCH
# ================================================================

if ($RunWorkflow) {

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw @"
GitHub CLI (gh) was not found.

Install GitHub CLI or run without -RunWorkflow.
"@
    }

    Write-Host ""
    Write-Host "Checking GitHub authentication..." -ForegroundColor Cyan

    Invoke-Gh @("auth", "status")

    Write-Host ""
    Write-Host "Starting page-test GitHub Actions workflow..." -ForegroundColor Cyan

    Invoke-Gh @(
        "workflow",
        "run",
        "page-test.yml",
        "--ref",
        $Branch
    )

    Write-Host ""
    Write-Host "page-test workflow dispatched." -ForegroundColor Green
}

Write-Host ""