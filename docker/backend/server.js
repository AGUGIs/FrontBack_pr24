const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_ID = process.env.SERVER_ID || 'backend-unknown';

app.get('/', (req, res) => {
  res.json({
    message: 'Response from backend server',
    server: SERVER_ID,
    port: PORT,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: SERVER_ID });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${SERVER_ID}] Server started on port ${PORT}`);
});
