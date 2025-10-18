import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { OAuth2Client } from "google-auth-library"
import User from "../models/userModel.js"

import generateUserAuthData from "./generateUserAuthData.js"
import { onlineUsers, privateNamespace } from "./socket.js"

const configurePassport = (passport) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    throw new Error("Missing required Google OAuth environment variables.")
  }
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        console.log("Passport GoogleStrategy hit", { profile })
        const { id, emails, name, photos } = profile

        const email = emails?.[0]?.value
        const avatar = photos?.[0]?.value || "https://storage.googleapis.com/heist_members_profile_image/LEP-default.png"
        const { givenName, familyName } = name

        try {
          const oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL)
          oauth2Client.setCredentials({ access_token: accessToken })

          const newUser = {
            googleId: id,
            userName: email ? email.split("@")[0] : `${givenName}_${familyName}`,
            firstName: givenName,
            lastName: familyName,
            avatar,
            email,
          }
          console.log("Checking for user:", id)
          // Check if the user exists
          let user = await User.findOne({ googleId: id })
            .lean()
          console.log("User found:", user)
          if (!user) {
            console.log("No user found, sending REDIRECT_SIGNUP", newUser)
            // No user found,
            // partial signup time
            return done(null, false, {
              message: "REDIRECT_SIGNUP",
              user: newUser,
            })
          }

          if (onlineUsers.has(user._id.toString())) {
            console.log("Online users logout triggered (Google auth flow)")
            privateNamespace.to(user._id.toString()).emit("logoutUser")

            // Give them a moment to breathe before proceeding
            await new Promise((resolve) => setTimeout(resolve, 5000))
          }

          // Return fully authenticated user object
          let authData
          try {
            authData = generateUserAuthData(user)
          } catch (genErr) {
            console.error("Error generating authData:", genErr)
            return done(genErr, null)
          }
          console.log("Returning existing user, generating authData...")
          return done(null, {
            authData,
          })
        } catch (error) {
          console.error("Google Authentication Error:", error)
          return done(error, null)
        }
      }
    )
  )

  passport.serializeUser((sessionUser, done) => {
    // sessionUser can be custom object now
    done(null, sessionUser)
  })

  passport.deserializeUser((sessionUser, done) => {
    done(null, sessionUser)
  })
}

export default configurePassport
