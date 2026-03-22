import jwt from 'jsonwebtoken';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const userId = "69a8831ac1e4da33b62382bf"; // From testDB output
const token = jwt.sign({ id: userId, role: 'organizer' }, process.env.JWT_SECRET || 'mysecrettoken');
console.log("Token:", token);

axios.get('http://localhost:5010/v1/users/me/event-registrations', {
  headers: { Authorization: `Bearer ${token}` }
}).then(res => {
  console.log("API Response:", JSON.stringify(res.data, null, 2));
}).catch(err => {
  console.error("API Error:", err.response ? err.response.data : err.message);
});
