const { DefaultAzureCredential } = require("@azure/identity");
const { SqlManagementClient } = require("@azure/arm-sql");
const { ResourceManagementClient } = require("@azure/arm-resources");

module.exports = async function (context, req) {
    try {
        const credential = new DefaultAzureCredential();
        const subscriptionId = process.env["AZURE_SUBSCRIPTION_ID"];

        const resourceClient = new ResourceManagementClient(credential, subscriptionId);
        const sqlClient = new SqlManagementClient(credential, subscriptionId);

        // Get all resource groups
        const rgList = [];
        for await (const rg of resourceClient.resourceGroups.list()) {
            rgList.push(rg.name);
        }

        const results = [];

        for (const rgName of rgList) {
            context.log(`🔍 Checking RG: ${rgName}`);

            try {
                // List all Managed Instances in the RG
                const miIterator = sqlClient.managedInstances.listByResourceGroup(rgName);
                const managedInstances = [];
                for await (const mi of miIterator) {
                    managedInstances.push(mi);
                }

                if (managedInstances.length === 0) {
                    context.log(`ℹ No Managed Instances found in RG "${rgName}"`);
                    continue;
                }

                for (const mi of managedInstances) {
                    const dbIterator = sqlClient.managedDatabases.listByManagedInstance(rgName, mi.name);
                    const dbList = [];

                    for await (const db of dbIterator) {
                        if (db.name.toLowerCase() !== "master") {
                            dbList.push(db.name);
                        }
                    }

                    results.push({
                        resourceGroup: rgName,
                        managedInstance: mi.name,
                        fqdn: mi.fullyQualifiedDomainName,
                        databases: dbList
                    });
                }

            } catch (err) {
                context.log(`❌ Error fetching MIs from RG "${rgName}": ${err.message}`);
            }
        }

        context.log(`✅ Final Results:`, results);
        context.res = { status: 200, body: results };

    } catch (error) {
        context.log.error(error);
        context.res = { status: 500, body: error.message };
    }
};
