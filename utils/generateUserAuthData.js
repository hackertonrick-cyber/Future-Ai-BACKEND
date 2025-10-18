import generateToken from "./generateToken.js"

const generateUserAuthData = (user) => {
  return {
    _id: user._id,
    userName: user.userName,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    dob: user.dob,
    email: user.email,
    country: user.country,
    location: user.location,
    accountTier: user.accountTier,
    emailVerified: user.emailVerified,
    heistWin: user.heistWin,
    riddleWin: user.riddleWin,
    avatar: user.avatar,
    customerId: user.customerId,
    activeHeists: user.activeHeists,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    hasBucket: user.hasBucket,
    kycVerification: user.kycVerification,
    token: generateToken(user._id),
  }
}

export default generateUserAuthData
