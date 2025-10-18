import "dotenv/config"

import path from "path"
import express from "express"
import compression from "compression"
import cors from "cors"
import { createServer } from "http"
import helmet from "helmet"
import morgan from "morgan"
import hpp from "hpp"
import colors from "colors"
import passport from "passport"
import connectDB from "./config/db.js"
import { notFound, errorHandler } from "./middleware/errorMiddleware.js"
import { io } from "./utils/socket.js"
import { apiLimiter } from "./middleware/authMiddleware.js"


// Routers
import authRoutes from "./routes/authRoutes.js"
import webhookRoutes from "./routes/webhookRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import configurePassport from "./utils/passport.js"

// ---- DB & auth ----
await connectDB()
// configurePassport(passport)

const app = express()
const httpServer = createServer(app)

app.set("trust proxy", 1)
app.use(helmet())
app.use(hpp())
app.use(compression())

if (process.env.NODE_ENV === "development") app.use(morgan("dev"))
app.use(
  cors({
    origin: process.env.ORIGIN || "*",
    credentials: false, // set true only if you need cookies/auth headers
  })
)

// Webhooks BEFORE body parsers (to preserve raw body if needed)
// app.use("/api/order/webhooks", webhookRoutes)
// app.use("/api/kyc/webhooks", webhookRoutes)

// Rate limiter
app.use(apiLimiter)

// Body parsers AFTER webhook
app.use(express.json({ limit: "1mb" }))
app.use(express.urlencoded({ extended: false, limit: "1mb" }))

// Static assets
const __dirname = path.resolve()
if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"))
} else {
  app.get("/", (_req, res) => res.send("API is running...."))
}

// ---- API routes ----
app.use("/api/auth", authRoutes)
app.use("/api/user", userRoutes)

// Uploads
app.use("/uploads", express.static(path.join(__dirname, "/uploads")))

app.use(notFound)
app.use(errorHandler)

// ---- Socket.IO ----
io.attach(httpServer)

// ---- Server ----
const port = process.env.PORT || 8080
httpServer.listen(port, () => {
  console.log(colors.yellow(`Server running in ${process.env.NODE_ENV} on :${port}`))
})