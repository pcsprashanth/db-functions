const { DefaultAzureCredential } = require("@azure/identity");
const { SqlManagementClient } = require("@azure/arm-sql");

module.exports = async function (context, req) {
    const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    const resourceGroup = req.query.resource_group || process.env.RESOURCE_GROUP;
    const serverName = req.query.server;
    const databaseName = req.query.database;
    const action = req.query.action;
    const restorePointInTime = req.query.restore_time;

    if (!subscriptionId || !resourceGroup || !serverName || !databaseName || !action) {
        context.res = {
            status: 400,
            body: "Missing required parameters: server, database, action"
        };
        return;
    }

    try {
        const credential = new DefaultAzureCredential();
        const sqlClient = new SqlManagementClient(credential, subscriptionId);

        if (action === "delete") {
            await sqlClient.databases.beginDeleteAndWait(resourceGroup, serverName, databaseName);
            context.res = { status: 200, body: `Database '${databaseName}' deleted.` };
        }
        else if (action === "restore") {
            if (!restorePointInTime) {
                context.res = { status: 400, body: "Please provide restore_time in ISO format" };
                return;
            }

            const restoreParams = {
                location: (await sqlClient.servers.get(resourceGroup, serverName)).location,
                createMode: "PointInTimeRestore",
                sourceDatabaseId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Sql/servers/${serverName}/databases/${databaseName}`,
                restorePointInTime: restorePointInTime
            };

            const restoreDbName = `${databaseName}_restored_${Date.now()}`;
            await sqlClient.databases.beginCreateOrUpdateAndWait(resourceGroup, serverName, restoreDbName, restoreParams);
            context.res = { status: 200, body: `Database restored as '${restoreDbName}'.` };
        }
        else if (action === "backup") {
            const db = await sqlClient.databases.get(resourceGroup, serverName, databaseName);
            context.res = { status: 200, body: `Latest backup info: ${JSON.stringify(db, null, 2)}` };
        }
        else {
            context.res = { status: 400, body: "Invalid action. Use delete | restore | backup" };
        }
    } catch (err) {
        context.res = { status: 500, body: err.message || String(err) };
    }
};
