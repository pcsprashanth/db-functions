const { DefaultAzureCredential } = require("@azure/identity");
const { SqlManagementClient } = require("@azure/arm-sql");
const { ResourceManagementClient } = require("@azure/arm-resources");

module.exports = async function (context, req) {
    try {
        const credential = new DefaultAzureCredential();
        const subscriptionId = process.env["AZURE_SUBSCRIPTION_ID"];

        if (!subscriptionId) {
            throw new Error("AZURE_SUBSCRIPTION_ID environment variable is not set.");
        }

        const resourceClient = new ResourceManagementClient(credential, subscriptionId);
        const sqlClient = new SqlManagementClient(credential, subscriptionId);

        context.log("🔹 Testing SP / Credential access to subscription...");

        try {
            const token = await credential.getToken("https://management.azure.com/.default");
            context.log("✅ Token acquired successfully (SP credentials working).");
        } catch (err) {
            context.log.error("❌ Failed to acquire token with SP:", err.message);
        }

        // Fetch all resource groups
        const rgList = [];
        for await (const rg of resourceClient.resourceGroups.list()) {
            rgList.push(rg.name);
        }
        context.log(`✅ Resource Groups fetched: ${rgList.length} -> ${rgList}`);

        const results = [];

        for (const rgName of rgList) {
            context.log(`🔍 Checking resource group: ${rgName}`);

            try {
                // List all Managed Instances in the resource group
                const miIterator = sqlClient.managedInstances.listByResourceGroup(rgName);
                let foundMI = false;

                for await (const mi of miIterator) {
                    foundMI = true;
                    context.log(`🔹 Found Managed Instance: ${mi.name}`);

                    // FIX: Correct method for Managed Instance databases
                    const dbIterator = sqlClient.managedDatabases.listByInstance(rgName, mi.name);
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

                if (!foundMI) {
                    context.log(`ℹ No Managed Instances found in RG "${rgName}"`);
                }

            } catch (err) {
                context.log.error(`❌ Error fetching Managed Instances from RG "${rgName}": ${err.message}`);
            }
        }

        context.log(`✅ Final Results: ${results.length} Managed Instances found`);
        context.res = { status: 200, body: results };

    } catch (error) {
        context.log.error("💥 Function failed:", error);
        context.res = { status: 500, body: error.message };
    }
};
