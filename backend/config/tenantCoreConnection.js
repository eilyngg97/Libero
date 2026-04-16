const mongoose = require('mongoose');
const { getMongoUri } = require('./secrets');

let coreConnectionPromise = null;

function getCoreMongoUri() {
  return process.env.CORE_MONGO_URI_CURRENT || process.env.CORE_MONGO_URI || getMongoUri();
}

async function getTenantCoreConnection() {
  if (coreConnectionPromise) return coreConnectionPromise;

  const uri = getCoreMongoUri();
  const maxPoolSize = Number(process.env.CORE_MONGO_MAX_POOL_SIZE || 5);

  const connection = mongoose.createConnection(uri, {
    maxPoolSize: Number.isFinite(maxPoolSize) && maxPoolSize > 0 ? maxPoolSize : 5,
    serverSelectionTimeoutMS: 5000
  });

  coreConnectionPromise = connection.asPromise().catch((err) => {
    coreConnectionPromise = null;
    throw err;
  });

  return coreConnectionPromise;
}

module.exports = {
  getTenantCoreConnection,
  getCoreMongoUri
};
