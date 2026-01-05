import { Router, Request, Response } from "express";
import { AuthService } from "../services/authService.js";
import { TenantService } from "../services/tenantService.js";
import { TokenService } from "../services/tokenService.js";
import { env } from "../config/env.js";
import { z } from "zod";

const router = Router();

// Validation schemas
const signupSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().min(1, "Company name is required"),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /api/v1/auth/signup
 * Create a new user account
 */
router.post("/signup", async (req: Request, res: Response) => {
  try {
    // Validate input
    const validationResult = signupSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.issues,
      });
    }

    const data = validationResult.data;

    // Create user account
    const result = await AuthService.signup(data);

    res.status(201).json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        tenantId: result.user.tenantId,
      },
      apiKey: result.apiKey,
      sessionToken: result.sessionToken,
      tenantId: result.tenantId,
      projectId: result.projectId,
      message: "Account created successfully",
    });
  } catch (error) {
    console.error("Signup error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    
    if (errorMessage.includes("already exists")) {
      return res.status(409).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/v1/auth/login
 * Login a user
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    // Validate input
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.issues,
      });
    }

    const { email, password } = validationResult.data;

    // Login user
    const result = await AuthService.login(email, password);

    res.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        tenantId: result.user.tenantId,
      },
      sessionToken: result.sessionToken,
      apiKey: result.apiKey,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    
    if (errorMessage.includes("Invalid email or password")) {
      return res.status(401).json({ error: errorMessage });
    }
    
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout a user (revoke session)
 */
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    await AuthService.revokeSession(sessionToken);

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user information
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * GET /api/v1/auth/account
 * Get full account information including tenant, projects, and API key
 */
router.get("/account", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid Authorization header",
      });
    }

    const sessionToken = authHeader.substring(7);
    const user = await AuthService.validateSession(sessionToken);

    if (!user) {
      return res.status(401).json({
        error: "Invalid or expired session",
      });
    }

    // Get tenant information
    const tenant = await TenantService.getTenant(user.tenantId);
    if (!tenant) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    // Get all projects for this tenant
    const projects = await TenantService.getProjectsByTenant(user.tenantId);

    // Get default project (first prod project, or first project)
    const defaultProject = projects.find((p) => p.environment === "prod") || projects[0];

    // Generate API key (JWT token) for default project
    let apiKey: string | null = null;
    if (defaultProject) {
      apiKey = TokenService.generateToken({
        tenantId: user.tenantId,
        projectId: defaultProject.id,
        environment: defaultProject.environment,
      });
    }

    // Get tenant token info (for Tinybird)
    const tenantToken = await TenantService.getTinybirdToken(user.tenantId);

    res.json({
      success: true,
      account: {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          createdAt: tenant.createdAt,
        },
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          environment: p.environment,
          createdAt: p.createdAt,
        })),
        apiKey: apiKey,
        defaultProject: defaultProject
          ? {
              id: defaultProject.id,
              name: defaultProject.name,
              environment: defaultProject.environment,
            }
          : null,
        observaApiUrl: process.env.OBSERVA_API_URL || "https://observa-api.vercel.app",
        hasTinybirdToken: !!tenantToken,
      },
    });
  } catch (error) {
    console.error("Get account error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;

