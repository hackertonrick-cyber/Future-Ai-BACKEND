import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(process.env.MONGO_URI, {});

    console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
  } catch (error) {
    console.error(`Error: ${error.message}`.red.underline.bold);
    process.exit(1);
  }
};


export const copyDatabase = async () => {
  const sourceConn = await mongoose.createConnection(process.env.MONGO_URI).asPromise();
  const targetConn = await mongoose.createConnection(process.env.MONGO_URI_DEV).asPromise();

  const collections = await sourceConn.db.listCollections().toArray();

  for (const { name } of collections) {
    const source = sourceConn.collection(name);
    const target = targetConn.collection(name);

    const docs = await source.find({}).toArray();
    if (docs.length > 0) await target.insertMany(docs);
  }

  console.log("✅ Copy complete");
  process.exit(0);
};
export default connectDB;
