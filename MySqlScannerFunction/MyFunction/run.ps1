param($req)

Write-Output "Running MySqlScannerFunction..."

try {
    # Connect to Azure using managed identity (recommended) or Az module
    # If testing locally, you must be logged in with Connect-AzAccount
    
    # Get all resource groups in the subscription
    $resourceGroups = Get-AzResourceGroup

    $results = @()

    foreach ($rg in $resourceGroups) {
        # Get all SQL servers in the resource group
        $servers = Get-AzSqlServer -ResourceGroupName $rg.ResourceGroupName

        foreach ($server in $servers) {
            # Get all databases in the server
            $databases = Get-AzSqlDatabase -ResourceGroupName $rg.ResourceGroupName -ServerName $server.ServerName

            foreach ($db in $databases) {
                $results += [PSCustomObject]@{
                    ResourceGroup = $rg.ResourceGroupName
                    ServerName    = $server.ServerName
                    FQDN          = $server.FullyQualifiedDomainName
                    DatabaseName  = $db.DatabaseName
                    Status        = $db.Status
                }
            }
        }
    }

    $response = @{
        status = "OK"
        data   = $results
    }

    return @{
        statusCode = 200
        body       = $response
    }

} catch {
    $errorMessage = $_.Exception.Message
    Write-Error $errorMessage

    return @{
        statusCode = 500
        body = @{
            status  = "Error"
            message = $errorMessage
        }
    }
}
