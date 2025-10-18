import generateToken from "./generateToken.js"

const generateOrgAuthData = (orgUser) => {
  if (!orgUser) return null

  return {
    _id: orgUser._id,
    username: orgUser.username,
    role: orgUser.role,
    companyCode: orgUser.companyCode,
    branchCode: orgUser.branchCode,
    active: orgUser.active,
    createdAt: orgUser.createdAt,
    updatedAt: orgUser.updatedAt,
    token: generateToken({
      id: orgUser._id,
      companyCode: orgUser.companyCode,
      branchCode: orgUser.branchCode,
      role: orgUser.role,
      type: "org", // helps distinguish between patient/org sessions in middleware
    }),
  }
}

export default generateOrgAuthData