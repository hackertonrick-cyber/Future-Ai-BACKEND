import asyncHandler from "express-async-handler"
import Appointment from "../models/appointmentModel.js"

// 🟢 Create Appointment
// 🟢 Create Appointment (OrgUser booking for a patient)
// 🟢 Create Appointment (OrgUser booking for a patient)
const createAppointment = asyncHandler(async (req, res) => {
  const { patientId, appointmentDate, reasonForVisit, visitType, priority } = req.body

  // 🔹 Extract OrgUser context from token/session
  const { companyCode, branchCode, _id } = req.user || {}

  // Basic validation
  if (!patientId || !appointmentDate) {
    return res.status(400).json({
      message: "Missing required fields: patientId, requesterProfessionalId, appointmentDate",
    })
  }

  if (!companyCode) {
    return res.status(400).json({ message: "Invalid organization context (companyCode missing)" })
  }

  // 🔹 Create appointment with org context automatically filled
  const appointment = await Appointment.create({
    patientId,
    requesterProfessionalId: _id,
    appointmentDate,
    reasonForVisit,
    visitType,
    orgCode: companyCode,
    branchCode,
    priority,
    createdBy: _id,
  })

  res.status(201).json({
    message: "Appointment booked successfully",
    appointment,
  })
})

// 🟢 Get All Appointments (with filters)
const getAppointments = asyncHandler(async (req, res) => {
  const { status, date } = req.query
  const { role, companyCode, branchCode, _id } = req.user || {}

  // Base query: always scoped to org
  const query = { orgCode: companyCode }

  // Role-based access control
  switch (role) {
    case "doctor":
      // Doctors only see their own appointments
      query.requesterProfessionalId = orgUserId
      break

    case "nurse":
      // Nurses see appointments in their branch only
      query.branchCode = branchCode
      break

    case "admin":
      // Admins see the whole organization (all branches)
      break

    case "super-admin":
      // Super-admins can view everything across the company
      delete query.orgCode // optional: super-admin may see all orgs
      break

    default:
      return res.status(403).json({ message: "Unauthorized role" })
  }

  // Optional filters
  if (status) query.status = status

  if (date) {
    const start = new Date(date)
    const end = new Date(date)
    end.setHours(23, 59, 59)
    query.appointmentDate = { $gte: start, $lte: end }
  }

  // Fetch with relational details
  const appointments = await Appointment.find(query)
    .populate("patientId", "firstName lastName email phone")
    .populate("requesterProfessionalId", "firstName lastName specialization")
    .populate("createdBy", "username role branchCode")
    .sort({ appointmentDate: 1 })

  res.status(200).json({
    total: appointments.length,
    appointments,
  })
})

// 🟢 Get Single Appointment
const getAppointmentById = asyncHandler(async (req, res) => {
  const { role, companyCode, branchCode, _id } = req.user || {}

  const appointment = await Appointment.findById(req.params.id)
    .populate("patientId", "firstName lastName email phone")
    .populate("requesterProfessionalId", "firstName lastName specialization")
    .populate("createdBy", "username role branchCode")
    .populate("updatedBy", "username role branchCode")

  if (!appointment) {
    return res.status(404).json({ message: "Appointment not found" })
  }

  // 🔒 Role-based access control
  switch (role) {
    case "doctor":
      if (appointment.requesterProfessionalId?._id.toString() !== _id.toString()) {
        return res.status(403).json({ message: "Access denied: not your patient appointment" })
      }
      break

    case "nurse":
      if (appointment.branchCode !== branchCode) {
        return res.status(403).json({ message: "Access denied: outside your branch" })
      }
      break

    case "admin":
      if (appointment.orgCode !== companyCode) {
        return res.status(403).json({ message: "Access denied: outside your organization" })
      }
      break

    case "super-admin":
      // Full access to everything
      break

    default:
      return res.status(403).json({ message: "Unauthorized role" })
  }

  res.status(200).json(appointment)
})

// 🟠 Update Appointment
const updateAppointment = asyncHandler(async (req, res) => {
  const { role, companyCode, branchCode, _id: orgUserId } = req.user || {}

  const appointment = await Appointment.findById(req.params.id)
  if (!appointment) {
    return res.status(404).json({ message: "Appointment not found" })
  }

  // 🔒 Access Control by Role
  switch (role) {
    case "doctor":
      // Doctor can only update their own appointments and limited fields
      if (appointment.requesterProfessionalId.toString() !== orgUserId.toString()) {
        return res.status(403).json({ message: "Access denied: not your appointment" })
      }
      // Restrict updates to progress/status/notes
      const allowedDoctorFields = ["status", "reasonForVisit", "durationMinutes"]
      Object.keys(req.body).forEach((key) => {
        if (!allowedDoctorFields.includes(key)) delete req.body[key]
      })
      break

    case "nurse":
      // Nurse can only modify within same branch
      if (appointment.branchCode !== branchCode) {
        return res.status(403).json({ message: "Access denied: outside your branch" })
      }
      // Nurses may adjust schedule/status but not change doctor or patient
      const allowedNurseFields = ["status", "appointmentDate", "durationMinutes", "priority"]
      Object.keys(req.body).forEach((key) => {
        if (!allowedNurseFields.includes(key)) delete req.body[key]
      })
      break

    case "admin":
      // Admins can update any appointment in their org
      if (appointment.orgCode !== companyCode) {
        return res.status(403).json({ message: "Access denied: outside your organization" })
      }
      break

    case "super-admin":
      // Full access — no restrictions
      break

    default:
      return res.status(403).json({ message: "Unauthorized role" })
  }

  // 🔐 Prevent sensitive fields from being tampered with
  const forbiddenFields = ["orgCode", "branchCode", "createdBy", "patientId"]
  forbiddenFields.forEach((field) => delete req.body[field])

  // 🔄 Apply safe updates
  Object.assign(appointment, req.body, { updatedBy: orgUserId })
  await appointment.save()

  res.status(200).json({
    message: "Appointment updated successfully",
    appointment,
  })
})

// 🔴 Cancel Appointment
const cancelAppointment = asyncHandler(async (req, res) => {
  const { reason, cancelledBy } = req.body
  const appointment = await Appointment.findById(req.params.id)
  if (!appointment) return res.status(404).json({ message: "Appointment not found" })

  appointment.status = "cancelled"
  appointment.cancellation = {
    cancelledBy,
    reason,
    cancelledAt: new Date(),
  }

  await appointment.save()
  res.json({ message: "Appointment cancelled", appointment })
})

// 🔁 Reschedule Appointment
const rescheduleAppointment = asyncHandler(async (req, res) => {
  const { newDate, rescheduledBy } = req.body
  const appointment = await Appointment.findById(req.params.id)
  if (!appointment) return res.status(404).json({ message: "Appointment not found" })

  appointment.rescheduled = {
    previousDate: appointment.appointmentDate,
    rescheduledBy,
    rescheduledAt: new Date(),
  }
  appointment.appointmentDate = newDate
  appointment.status = "scheduled"

  await appointment.save()
  res.json({ message: "Appointment rescheduled", appointment })
})

// 🟣 Delete Appointment (admin use)
const deleteAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id)
  if (!appointment) return res.status(404).json({ message: "Appointment not found" })

  await appointment.deleteOne()
  res.json({ message: "Appointment deleted" })
})

export { createAppointment, getAppointments, getAppointmentById, updateAppointment, cancelAppointment, rescheduleAppointment, deleteAppointment }
