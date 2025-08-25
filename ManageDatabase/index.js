const sql = require("mssql");

module.exports = async function (context, req) {
  try {
    const dbName = req.query.dbName || req.body?.dbName;

    if (!dbName) {
      context.res = {
        status: 400,
        body: "❌ Missing dbName parameter",
      };
      return;
    }

    const containerUrl = process.env.STORAGE_CONTAINER_URL; // e.g. https://mystorageacct.blob.core.windows.net/backups
    const sasToken = process.env.STORAGE_SAS;               // only the SAS token (without leading ?)

    if (!containerUrl || !sasToken) {
      context.res = {
        status: 500,
        body: "❌ Storage configuration is missing. Please set STORAGE_CONTAINER_URL and STORAGE_SAS.",
      };
      return;
    }

    const backupFile = `${dbName}_${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    const backupUrl = `${containerUrl}/${backupFile}`;
    const credentialName = containerUrl; // must exactly match the container URL

    // SQL MI connection
    const pool = await sql.connect({
      user: process.env.SQL_MI_USER,
      password: process.env.SQL_MI_PASSWORD,
      server: process.env.SQL_MI_FQDN,
      database: "master",
      options: {
        encrypt: true,
        trustServerCertificate: false,
        port: 1433, // ✅ SQL MI default port
      },
    });

    // Create credential if not exists
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
      TO URL = '${backupUrl}'
      WITH COPY_ONLY, COMPRESSION, STATS = 10, CREDENTIAL = '${credentialName}';
    `;

    context.log(`📦 Running backup for database [${dbName}] -> ${backupUrl}`);
    await pool.request().batch(backupSql);

    context.res = {
      status: 200,
      body: `✅ Backup completed successfully.\nFile: ${backupUrl}`,
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
