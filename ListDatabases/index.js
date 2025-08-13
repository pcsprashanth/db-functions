const { DefaultAzureCredential } = require("@azure/identity");
const { SqlManagementClient } = require("@azure/arm-sql");
const { ResourceManagementClient } = require("@azure/arm-resources");

module.exports = async function (context, req) {
    try {
        const credential = new DefaultAzureCredential();
        const subscriptionId = process.env["AZURE_SUBSCRIPTION_ID"];

        const resourceClient = new ResourceManagementClient(credential, subscriptionId);
        const sqlClient = new SqlManagementClient(credential, subscriptionId);

        const rgList = [];
        for await (const rg of resourceClient.resourceGroups.list()) {
            rgList.push(rg.name);
        }

        const results = [];

        for (const rgName of rgList) {
            context.log(`🔍 Checking RG: ${rgName}`);

            try {
                const serverIterator = sqlClient.servers.listByResourceGroup(rgName);
                const servers = [];
                for await (const server of serverIterator) {
                    servers.push(server);
                }

                if (servers.length === 0) {
                    context.log(`ℹ No SQL servers found in RG "${rgName}"`);
                    continue;
                }

                for (const server of servers) {
                    const dbIterator = sqlClient.databases.listByServer(rgName, server.name);
                    const dbList = [];

                    for await (const db of dbIterator) {
                        if (db.name.toLowerCase() !== "master") { // exclude master DB
                            dbList.push(db.name);
                        }
                    }

                    results.push({
                        resourceGroup: rgName,
                        server: server.name,
                        fqdn: server.fullyQualifiedDomainName,
                        databases: dbList
                    });
                }

            } catch (err) {
                context.log(`❌ Error fetching from RG "${rgName}": ${err.message}`);
            }
        }

        context.log(`✅ Final Results:`, results);
        context.res = { status: 200, body: results };

    } catch (error) {
        context.log.error(error);
        context.res = { status: 500, body: error.message };
    }
};
