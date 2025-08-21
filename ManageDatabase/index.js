const sql = require('mssql');

module.exports = async function (context, req) {
  const server = process.env.SQL_MI_FQDN;
  const user = process.env.SQL_MI_USER;
  const password = process.env.SQL_MI_PASSWORD;
  const containerUrl = process.env.BACKUP_CONTAINER_URL; // Base container URL (with SAS removed)
  const credentialName = process.env.SQL_CREDENTIAL_NAME;
  const sasToken = process.env.STORAGE_SAS_TOKEN; // only SAS value (without leading ?)

  const dbName = req.body?.database;

  if (!dbName || !containerUrl || !credentialName || !sasToken) {
    context.res = {
      status: 400,
      body: "Missing required inputs: 'database' in request body, or environment variables for BACKUP_CONTAINER_URL / SQL_CREDENTIAL_NAME / STORAGE_SAS_TOKEN."
    };
    return;
  }

  // Generate timestamped filename: MyDatabase_20250821_133045.bak
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const blobUrl = `${containerUrl}/${dbName}_${timestamp}.bak`;

  const config = {
  user: process.env.SQL_MI_USER,
  password: process.env.SQL_MI_PASSWORD,
  server: process.env.SQL_MI_FQDN,  // e.g. free-sql-mi-7475199.1e12b8583323.public.database.windows.net
  database: process.env.SQL_MI_DB,  // optional for backup
  port: 3342,   // 👈 must use 3342 for MI public endpoint
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

  try {
    await sql.connect(config);

    // 1. Ensure credential exists (or create it if missing)
    const credentialQuery = `
      IF NOT EXISTS (SELECT * FROM sys.credentials WHERE name = '${credentialName}')
      BEGIN
        CREATE CREDENTIAL [${credentialName}]
        WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
        SECRET = '${sasToken}';
      END
    `;
    await sql.query(credentialQuery);

    // 2. Perform the backup
    const backupQuery = `
      BACKUP DATABASE [${dbName}]
      TO URL = N'${blobUrl}'
      WITH CREDENTIAL = '${credentialName}',
      INIT, COMPRESSION, STATS = 10;
    `;
    await sql.query(backupQuery);

    context.res = {
      status: 200,
      body: `✅ Backup of '${dbName}' started successfully. File: ${blobUrl}`
    };

  } catch (err) {
    context.log.error('❌ Backup failed', err);
    context.res = {
      status: 500,
      body: `Backup failed: ${err.message}`
    };
  } finally {
    await sql.close();
  }
};
