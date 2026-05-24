const mongoose = require('mongoose');

let isConnected = false;

async function connectMongo() {
  if (isConnected) return mongoose.connection;

  const uri = process.env.MONGO_URI
    || process.env.MONGODB_URI
    || 'mongodb://localhost:27017/kastryula_market';

  await mongoose.connect(uri);
  isConnected = true;
  return mongoose.connection;
}

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectMongo, isMongoReady, mongoose };
