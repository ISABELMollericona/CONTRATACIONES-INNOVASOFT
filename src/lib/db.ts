import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cache = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cache;

export async function connectDb() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("Missing MONGODB_URI environment variable.");
  // Nombre de la base. Si no se indica aquí ni en la URI (…mongodb.net/<base>), MongoDB usa "test".
  const dbName = process.env.MONGODB_DB?.trim() || undefined;
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, { dbName }).catch((error: unknown) => {
      cache.promise = null;
      throw error;
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
