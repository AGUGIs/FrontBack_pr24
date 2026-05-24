const { createProxyMiddleware } = require('http-proxy-middleware');

const target = process.env.REACT_APP_PROXY_TARGET || 'https://localhost:3000';

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
    })
  );

  app.use(
    '/socket.io',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      ws: true,
    })
  );
};
