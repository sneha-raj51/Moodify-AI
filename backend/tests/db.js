import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import path from 'path';
import fs from 'fs';

let mongoServer;
let currentDbPath;

export const connectTestDB = async () => {
  const scratchDir = path.resolve(process.cwd(), '../scratch/mongo_db_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
  fs.mkdirSync(scratchDir, { recursive: true });
  currentDbPath = scratchDir;

  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbPath: scratchDir
    }
  });
  const uri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  await mongoose.connect(uri);
};

export const closeTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
  if (currentDbPath && fs.existsSync(currentDbPath)) {
    try {
      fs.rmSync(currentDbPath, { recursive: true, force: true });
    } catch (e) {}
  }
};

export const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
};
