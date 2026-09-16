<# Start the pinned upstream dsh CLI with project-local data and a deployment patch. #>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Build', 'Start', 'Check')]
    [string]$Action = 'Start',
    [ValidateRange(1024, 65535)]
    [int]$Port = 3080
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$originalPath = $env:PATH
$originalGitExecPath = $env:GIT_EXEC_PATH
$originalDshHome = $env:DSH_HOME
$originalClientCommitHash = $env:DSH_CLIENT_COMMIT_HASH

try {
    foreach ($installed in @('C:\Program Files\nodejs', 'C:\Program Files\Git\cmd')) {
        if (Test-Path -LiteralPath $installed) { $env:PATH += ";$installed" }
    }
    # Use normal installed tools first; the Codex bundle supports this initial Windows checkout.
    foreach ($relative in @('node\bin', 'native\git\cmd', 'bin\fallback')) {
        $candidate = Join-Path $bundledRoot $relative
        if (Test-Path -LiteralPath $candidate) { $env:PATH += ";$candidate" }
    }
    $node = (Get-Command node -ErrorAction Stop).Source
    $git = (Get-Command git -ErrorAction Stop).Source
    if ($git.StartsWith($bundledRoot, [StringComparison]::OrdinalIgnoreCase)) {
        $env:GIT_EXEC_PATH = Join-Path $bundledRoot 'native\git\mingw64\bin'
    }
    Push-Location $projectRoot
    try {
        if ($Action -eq 'Install' -or $Action -eq 'Build') {
            if ($Action -eq 'Build' -and !(Test-Path -LiteralPath (Join-Path $projectRoot '.git')) -and [string]::IsNullOrWhiteSpace($env:DSH_CLIENT_COMMIT_HASH)) {
                $upstream = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'upstream.json') -Raw | ConvertFrom-Json
                if ($upstream.commit -notmatch '^[0-9a-f]{40}$') {
                    throw 'trade\upstream.json does not contain a valid pinned commit hash.'
                }
                $env:DSH_CLIENT_COMMIT_HASH = $upstream.commit
            }
            $pnpm = (Get-Command pnpm -ErrorAction Stop).Source
            if ($Action -eq 'Install') { & $pnpm install --frozen-lockfile }
            else { & $pnpm run build }
            if ($LASTEXITCODE -ne 0) { throw "$Action failed with exit code $LASTEXITCODE" }
            if ($Action -eq 'Install') {
                Push-Location (Join-Path $PSScriptRoot 'enterprise')
                try { & npm ci --workspaces=false --ignore-scripts }
                finally { Pop-Location }
            }
            else { & $node (Join-Path $PSScriptRoot 'enterprise\build.mjs') }
            if ($LASTEXITCODE -ne 0) { throw "Enterprise $Action failed with exit code $LASTEXITCODE" }
            return
        }

        $cli = Join-Path $projectRoot 'apps\cli\lib\bin.js'
        $web = Join-Path $projectRoot 'apps\web\dist\index.html'
        if (!(Test-Path -LiteralPath $cli) -or !(Test-Path -LiteralPath $web)) {
            throw 'Build artifacts are missing. Run trade\dev.ps1 -Action Install, then -Action Build.'
        }
        $env:DSH_HOME = Join-Path $projectRoot '.trade-runtime'
        $workspace = Join-Path $projectRoot '.trade-workspace'
        New-Item -ItemType Directory -Force -Path $workspace | Out-Null
        $cliArgs = @('--profile', 'trade')
        if (!(Test-Path -LiteralPath (Join-Path $env:DSH_HOME 'profiles\trade\package.json'))) {
            $cliArgs += @('--from-default-profile', 'web')
        }
        $cliArgs += @('--patch', (Join-Path $PSScriptRoot 'cordis.patch.yml'))
        if ($Action -eq 'Check') { $cliArgs += '--dump-config' }
        else { $cliArgs += @('--host', '127.0.0.1', '--port', "$Port", '--no-open') }
        Set-Location -LiteralPath $workspace
        & $node $cli @cliArgs
        if ($LASTEXITCODE -ne 0) { throw "dsh exited with code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}
finally {
    $env:PATH = $originalPath
    $env:GIT_EXEC_PATH = $originalGitExecPath
    $env:DSH_HOME = $originalDshHome
    $env:DSH_CLIENT_COMMIT_HASH = $originalClientCommitHash
}
