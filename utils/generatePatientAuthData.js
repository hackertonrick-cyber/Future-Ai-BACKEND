import generateToken from "./generateToken.js"

const generatePatientAuthData = (patient) => {
  if (!patient) return null

  return {
    _id: patient._id,
    username: patient.username,
    firstName: patient.firstName,
    lastName: patient.lastName,
    gender: patient.gender,
    dob: patient.dob,
    email: patient.email,
    phone: patient.phone,
    country: patient.country,
    address: patient.address,
    nextOfKin: patient.nextOfKin,
    emergencyContacts: patient.emergencyContacts || [],
    verified: patient.verified || false,
    active: patient.active || true,
    consentGiven: patient.consentGiven || false,
    publicMedicalProfile: patient.publicMedicalProfile || {},
    createdByOrg: patient.createdByOrg || null,
    lastLogin: patient.lastLogin || null,
    accountCreated: patient.createdAt,
    accountUpdated: patient.updatedAt,
    token: generateToken(patient._id),
  }
}

export default generatePatientAuthData
