const axios = require('axios');

// Test QuestDB connection with the same config as the server
const config = {
  host: process.env.QUESTDB_HOST || '127.0.0.1',
  port: parseInt(process.env.QUESTDB_PORT || '9000'),
  username: process.env.QUESTDB_USER || undefined,
  password: process.env.QUESTDB_PASSWORD || undefined,
  ssl: process.env.QUESTDB_SSL === 'true',
  timeout: parseInt(process.env.QUESTDB_TIMEOUT || '30000'),
};

const protocol = config.ssl ? 'https' : 'http';
const baseUrl = `${protocol}://${config.host}:${config.port}`;

console.log('QuestDB Config:', {
  baseUrl,
  username: config.username,
  password: config.password ? '***' : 'none',
  ssl: config.ssl,
});

async function testConnection() {
  try {
    // Test basic connection
    console.log('\n1. Testing basic connection...');
    const response = await axios.get(`${baseUrl}/exec`, {
      params: { query: 'SELECT 1' },
      timeout: config.timeout,
      ...(config.username && config.password
        ? {
            auth: {
              username: config.username,
              password: config.password,
            },
          }
        : {}),
    });
    console.log('✅ Basic connection successful:', response.data);

    // Test table listing
    console.log('\n2. Testing table listing...');
    const tablesResponse = await axios.get(`${baseUrl}/exec`, {
      params: { query: 'SHOW TABLES' },
      timeout: config.timeout,
      ...(config.username && config.password
        ? {
            auth: {
              username: config.username,
              password: config.password,
            },
          }
        : {}),
    });
    console.log('✅ Tables found:', tablesResponse.data);

    // Test all the tables that the server tries to query
    console.log('\n3. Testing all database stats queries...');
    const tables = ['option_trades'];

    for (const table of tables) {
      try {
        const tableResponse = await axios.get(`${baseUrl}/exec`, {
          params: { query: `SELECT COUNT(*) as count FROM ${table}` },
          timeout: config.timeout,
          ...(config.username && config.password
            ? {
                auth: {
                  username: config.username,
                  password: config.password,
                },
              }
            : {}),
        });
        console.log(`✅ ${table}:`, tableResponse.data.dataset[0][0], 'records');
      } catch (error) {
        console.log(`❌ ${table}:`, error.response?.data?.error || error.message);
      }
    }
  } catch (error) {
    console.error('❌ Connection failed:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
}

testConnection();
