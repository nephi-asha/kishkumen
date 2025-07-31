const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Deseret Bakery Management API', // Your API title
      version: '1.0.0', // Your API version
      description: 'API documentation for the Deseret Bakery Management System backend, supporting multi-tenant operations for various bakeries.',
      contact: {
        name: 'Deseret Support',
        url: 'https://kishkumen.onrender.com/', 
        email: 'deseret@support.com', 
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api', // Base URL for local development
        description: 'Development Server',
      },
      // We can add more servers for production here okay, staging etc.
      // {
      //   url: 'https://our-render-app.onrender.com/api',
      //   description: 'Production Server',
      // },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer <token>'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  // Paths to files containing OpenAPI documentation in JSDoc format
  apis: [
    './router/auth-routes.js',
    './router/user-routes.js',
    './router/products-routes.js',
    './router/ingredients-routes.js',
    './router/recipe-routes.js',
    './router/sales-routes.js',
    './router/purchase-request-routes.js'
    // Add any other route files here as you create them
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
