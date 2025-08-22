const sql = require("mssql");

module.exports = async function (context, req) {
  try {
    // Parameters
    const dbName = req.query.dbName || req.body?.dbName;
    const storageAccount = process.env.STORAGE_ACCOUNT; // e.g. mystorageacct
    const containerName = process.env.STORAGE_CONTAINER; // e.g. backups
    const sasToken = process.env.STORAGE_SAS; // without leading '?'
    const backupFile = `${dbName}_${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;

    if (!dbName) {
      context.res = {
        status: 400,
        body: "Missing dbName parameter",
      };
      return;
    }

    // SQL MI connection
    const pool = await sql.connect({
      user: process.env.SQL_MI_USER,
      password: process.env.SQL_MI_PASSWORD,
      server: process.env.SQL_MI_FQDN, // e.g. free-sql-mi-xxxx.database.windows.net
      database: "master",
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
    });

    // Define URL to blob
    const backupUrl = `https://${storageAccount}.blob.core.windows.net/${containerName}/${backupFile}`;

    // Create credential if not exists
    const credentialName = `https://${storageAccount}.blob.core.windows.net/${containerName}`;
    const createCredentialSql = `
      IF NOT EXISTS (
        SELECT * FROM sys.credentials WHERE name = '${credentialName}'
      )
      BEGIN
        CREATE CREDENTIAL [${credentialName}]
        WITH IDENTITY = 'SHARED ACCESS SIGNATURE',
             SECRET = '${sasToken}';
      END
    `;

    await pool.request().batch(createCredentialSql);

    // Run COPY_ONLY backup
    const backupSql = `
      BACKUP DATABASE [${dbName}]
      TO DISK = '${backupUrl}'
      WITH COPY_ONLY, COMPRESSION, STATS = 10, CREDENTIAL = '${credentialName}';
    `;

    context.log(`Running backup for database [${dbName}] -> ${backupUrl}`);
    await pool.request().batch(backupSql);

    context.res = {
      status: 200,
      body: `✅ Backup completed successfully. File: ${backupUrl}`,
    };
  } catch (err) {
    context.log.error("❌ Backup failed", err);
    context.res = {
      status: 500,
      body: `Backup failed: ${err.message}`,
    };
  } finally {
    sql.close();
  }
};
