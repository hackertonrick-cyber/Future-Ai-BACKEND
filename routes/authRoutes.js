import express from "express"
import jwt from "jsonwebtoken"
import { authOrgUser, authPatient, authSuperAdmin } from "../controllers/userController.js"
import passport from "passport"
import RedisTemp from "../models/redis_temp.js"

const router = express.Router()

router.post("/org/login", authOrgUser)
router.post("/login", authPatient)
router.post("/admin/login", authSuperAdmin)

// @desc    Google auth callback
// @route   GET /auth/google/callback
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
  })
)

// @desc    Google auth callback
// @route   GET /api/auth/google/callback
router.get("/google/callback", async (req, res, next) => {
  console.log("Google Auth Callback Started");
  
  passport.authenticate("google", async (err, user, info) => {
    if (err) {
      console.error("Authentication Error:", err);
      return res.redirect(`${process.env.GOOGLE_AUTH_FAIL_URL}`);
    }

    // Check if the user is new and needs to sign up
    if (!user && info && info.message === "REDIRECT_SIGNUP") {
      const newUser = info.user;
      console.log("New user detected:", newUser.email);

      try {
        const tempUserData = {
          key: `signup:${newUser.email}`, 
          value: newUser,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60000), // Expires in 1 minute
        };

        const existingData = await RedisTemp.findOne({ key: `signup:${newUser.email}` }).lean();
        console.log("Existing Data Check:", existingData);

        if (!existingData) {
          console.log("No existing data found, saving new user data to RedisTemp");
          await RedisTemp.create(tempUserData);
        } else {
          console.log("Existing data found in RedisTemp, skipping saving");
        }

        const token = jwt.sign({ email: newUser.email }, process.env.JWT_SECRET, { expiresIn: "1m" });
        console.log("Generated Token for New User:", token);

        // Redirect to the signup page with the token in the query string
        return res.redirect(`${process.env.GOOGLE_AUTH_SUCCESS_URL}/signup?token=${token}`);
      } catch (error) {
        console.error("Error saving new user data in RedisTemp-like model:", error);
        return res.redirect(`${process.env.GOOGLE_AUTH_FAIL_URL}`);
      }
    }

    // If the user is found, process login
    if (user) {
      console.log("User logged in:", user.email);

      try {
        const tempUserData = {
          key: `sign_in:${user.email}`,
          value: user,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60000), // Expires in 1 minute
        };
        await RedisTemp.create(tempUserData);
        console.log("User data saved to RedisTemp");

        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: "1m" });
        console.log("Generated Token for Existing User:", token);

        return res.redirect(`${process.env.GOOGLE_AUTH_SUCCESS_URL}?token=${token}`);
      } catch (error) {
        console.error("Error saving user data in RedisTemp-like model:", error);
        return res.redirect(`${process.env.GOOGLE_AUTH_FAIL_URL}`);
      }
    }

    // If no user and no signup, redirect to fail URL
    console.log("No user or info, redirecting to fail URL");
    return res.redirect(`${process.env.GOOGLE_AUTH_FAIL_URL}`);
  })(req, res, next);
});

export default router
