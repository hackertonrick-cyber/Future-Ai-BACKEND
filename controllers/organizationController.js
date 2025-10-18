import asyncHandler from "express-async-handler"
import Organization from "../models/organizationModel.js"

const listOrganizations = asyncHandler(async (req, res) => {
  try {
    const organizations = await Organization.find({ verified: true, isActive: true })
      .select("companyCode companyName country address contactEmail contactPhone branches verifiedAt")
      .sort({ companyName: 1 })
      .lean()

    if (!organizations.length) {
      return res.status(404).json({ message: "No registered organizations found." })
    }

    res.status(200).json({
      count: organizations.length,
      organizations,
    })
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve organizations list.",
      error: error.message,
    })
  }
})

export { listOrganizations }
