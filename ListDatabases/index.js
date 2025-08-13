const { DefaultAzureCredential } = require("@azure/identity");
const { SqlManagementClient } = require("@azure/arm-sql");

module.exports = async function (context, req) {
    try {
        const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
        const resourceGroup = process.env.RESOURCE_GROUP;

        const credential = new DefaultAzureCredential();
        const sqlClient = new SqlManagementClient(credential, subscriptionId);

        let result = [];

        // Async iterate over SQL servers in the resource group
        for await (const server of sqlClient.servers.listByResourceGroup(resourceGroup)) {
            let dbList = [];

            for await (const db of sqlClient.databases.listByServer(resourceGroup, server.name)) {
                // Skip the master DB
                if (db.name.toLowerCase() === 'master') continue;

                dbList.push({
                    name: db.name,
                    status: db.status,
                    collation: db.collation,
                    creationDate: db.creationDate
                });
            }

            result.push({
                server: server.name,
                location: server.location,
                databases: dbList
            });
        }

        context.res = {
            status: 200,
            body: result
        };

    } catch (err) {
        context.log.error("Error listing databases:", err);
        context.res = {
            status: 500,
            body: { error: err.message }
        };
    }
};
