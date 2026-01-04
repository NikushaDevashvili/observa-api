/**
 * Swagger/OpenAPI Configuration
 * 
 * API documentation using Swagger UI
 */

import swaggerJsdoc from "swagger-jsdoc";
import { env } from "./config/env.js";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Observa API",
      version: "1.0.0",
      description: "Observa API for AI observability - track traces, sessions, users, issues, and costs",
      contact: {
        name: "Observa Support",
        email: "support@observa.ai",
      },
    },
    servers: [
      {
        url: process.env.API_URL || "http://localhost:3000",
        description: "Development server",
      },
      {
        url: "https://observa-api.vercel.app",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token or API key (sk_ or pk_ prefix)",
        },
        sessionAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Session token for dashboard access",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "UNAUTHORIZED",
                },
                message: {
                  type: "string",
                  example: "Invalid or missing API key",
                },
                details: {
                  type: "object",
                },
                requestId: {
                  type: "string",
                  example: "550e8400-e29b-41d4-a716-446655440000",
                },
              },
            },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Authentication",
        description: "Authentication and account management",
      },
      {
        name: "Events",
        description: "Event ingestion (SDK endpoints)",
      },
      {
        name: "Traces",
        description: "Trace viewing and management",
      },
      {
        name: "Sessions",
        description: "Session management",
      },
      {
        name: "Users",
        description: "User information from AI application",
      },
      {
        name: "Issues",
        description: "Issue detection and timeline",
      },
      {
        name: "Costs",
        description: "Cost analytics and breakdowns",
      },
      {
        name: "Dashboard",
        description: "Dashboard metrics and overview",
      },
      {
        name: "Metrics",
        description: "System and business metrics",
      },
      {
        name: "Health",
        description: "Health check endpoints",
      },
    ],
  },
  apis: ["./src/routes/*.ts"], // Path to the API files
};

export const swaggerSpec = swaggerJsdoc(options);


