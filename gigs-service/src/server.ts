import dotenv from 'dotenv';
import connectDB from './config/db';
import app from './app';

dotenv.config();

connectDB();

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => console.log(`Gigs service running on port ${PORT}`));
