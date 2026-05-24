const { Sequelize } = require('sequelize');

let sequelize = null;

function getSequelize() {
  if (sequelize) return sequelize;

  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    sequelize = new Sequelize(connectionString, {
      dialect: 'postgres',
      logging: process.env.SEQ_LOGGING === 'true' ? console.log : false,
      dialectOptions: process.env.PG_SSL === 'true'
        ? { ssl: { rejectUnauthorized: false } }
        : {},
    });
    return sequelize;
  }

  sequelize = new Sequelize(
    process.env.PG_DATABASE || 'kastryula_market',
    process.env.PG_USER || 'postgres',
    process.env.PG_PASSWORD || 'postgres',
    {
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT) || 5432,
      dialect: 'postgres',
      logging: process.env.SEQ_LOGGING === 'true' ? console.log : false,
    }
  );
  return sequelize;
}

async function connectPostgres() {
  const db = getSequelize();
  await db.authenticate();
  return db;
}

module.exports = { getSequelize, connectPostgres };
