// server.js
// Entry point — starts the HTTP server.
// Keeping this minimal means app.js is importable in tests without side effects.

import app from "./app.js";
import dotenv from "dotenv";a

dotenv.config();

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Auth API:     http://localhost:${PORT}/api/auth/signup\n`);
});