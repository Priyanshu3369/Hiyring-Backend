// controllers/authController.js
// Business logic for authentication endpoints.
// Controllers call the model for DB work and utils for token generation.
// They never touch Supabase directly.

import bcrypt from "bcryptjs";
import User from "../models/User.js";
import generateToken from "../utils/generateToken.js";

// ---------------------------------------------------------------------------
// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
// ---------------------------------------------------------------------------
export const signup = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // --- Input validation ---
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email and password are all required.",
      });
    }

    if (firstName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "First name must be at least 2 characters.",
      });
    }

    if (lastName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Last name must be at least 2 characters.",
      });
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    // --- Check for existing user ---
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // --- Hash password ---
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // --- Persist user ---
    const newUser = await User.create({
      email,
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });

    // --- Issue JWT ---
    const token = generateToken(newUser.id);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error during signup. Please try again.",
    });
  }
};

// ---------------------------------------------------------------------------
// @desc    Login existing user
// @route   POST /api/auth/login
// @access  Public
// ---------------------------------------------------------------------------
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // --- Input validation ---
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // --- Find user ---
    const user = await User.findByEmail(email);

    // Use a generic error to avoid leaking which field is wrong (security best practice)
    if (!user || !user.password_hash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // --- Compare password ---
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // --- Check account status ---
    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Contact support.",
      });
    }

    // --- Update last login (fire-and-forget) ---
    User.updateLastLogin(user.id);

    // --- Issue JWT ---
    const token = generateToken(user.id);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error during login. Please try again.",
    });
  }
};

// ---------------------------------------------------------------------------
// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Public
// ---------------------------------------------------------------------------
// JWT is stateless — the server doesn't store tokens, so "logout" on the
// backend simply means: acknowledge the request.
// True invalidation requires a server-side token blacklist (Redis, DB table).
// For this implementation, logout is handled client-side by deleting the token
// from localStorage. The token will naturally expire per JWT_EXPIRES_IN.
// ---------------------------------------------------------------------------
export const logout = async (req, res) => {
  return res.status(200).json({
    success: true,
    message:
      "Logged out successfully. Please remove the token on the client side.",
  });
};

// ---------------------------------------------------------------------------
// @desc    Get protected dashboard data
// @route   GET /api/dashboard
// @access  Private (requires valid JWT via authMiddleware)
// ---------------------------------------------------------------------------
export const getDashboard = async (req, res) => {
  try {
    // req.user is attached by authMiddleware after token verification
    return res.status(200).json({
      success: true,
      message: "Welcome to your dashboard!",
      user: {
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.first_name,
        lastName: req.user.last_name,
        memberSince: req.user.created_at,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error fetching dashboard data.",
    });
  }
};