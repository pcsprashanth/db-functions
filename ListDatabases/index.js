const { DefaultAzureCredential } = require("@azure/identity");
const { SqlManagementClient } = require("@azure/arm-sql");
const { ResourceManagementClient } = require("@azure/arm-resources");

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID; // from env or config

async function listSqlServersAndDatabases() {
  const credential = new DefaultAzureCredential();

  // Step 1: List all resource groups
  const resourceClient = new ResourceManagementClient(credential, subscriptionId);
  const sqlClient = new SqlManagementClient(credential, subscriptionId);

  console.log(`Fetching SQL Servers and Databases for subscription: ${subscriptionId}`);

  for await (const rg of resourceClient.resourceGroups.list()) {
    console.log(`\nResource Group: ${rg.name}`);

    // Step 2: List SQL servers in this RG
    for await (const server of sqlClient.servers.listByResourceGroup(rg.name)) {
      console.log(`  SQL Server: ${server.name}`);

      // Step 3: List DBs in this server
      for await (const db of sqlClient.databases.listByServer(rg.name, server.name)) {
        console.log(`    Database: ${db.name}`);
      }
    }
  }
}

listSqlServersAndDatabases().catch((err) => {
  console.error("Error listing SQL resources:", err);
});
