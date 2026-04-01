const http = require('http');

const data = JSON.stringify({
  name: 'Unreachable Host',
  ip: '203.0.113.1'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/hosts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
