# Get all directories recursively
$directories = Get-ChildItem -Recurse -Directory

foreach ($dir in $directories) {
    # Check if the directory is a git repository by looking for the .git folder
    if (Test-Path "$($dir.FullName)\.git") {
        Write-Host "Updating repository in: $($dir.FullName)"
        
        # Change directory to the repository
        Set-Location $dir.FullName

        # Run git commands
        & "C:\Program Files\Git\cmd\git.exe" fetch --all
        & "C:\Program Files\Git\cmd\git.exe" reset --hard origin/main
        
        # Return to the parent directory
        Set-Location ..
    }
}
