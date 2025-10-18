import asyncHandler from "express-async-handler"
import OrderTypes from "../models/orderTypesModel.js"
import Order from "../models/orderModel.js"
import User from "../models/userModel.js"
import moment from "moment"
import { ERROR_RESPONSE } from "../utils/constants.js"
import { Types, startSession } from "mongoose"
import Stripe from "stripe"
import { privateNamespace } from "../utils/socket.js"
import { sendNotification } from "../utils/notificationService.js"

//#region @desc Register new order
// @route POST /api/order
// @access Private*/
const placeOrder = asyncHandler(async (req, res) => {
  const mongoSession = await startSession()
  mongoSession.startTransaction()

  const stripe = new Stripe(process.env.STRIPE_SECRET)
  const item = req.body.item
  const quantity = 1

  try {
    const orderType = await OrderTypes.findById(item._id).lean()
    if (!orderType) {
      throw new Error(ERROR_RESPONSE.INVALID_DATA)
    }

    // Calculate total with tax if applicable
    const costBeforeTax = quantity * orderType.cost
    const total = costBeforeTax

    let customer

    if (!req.user.customerId) {
      customer = await stripe.customers.create({
        description: "project user",
        email: req.user.email,
        customer: req.user.email,
        name: `${req.user.firstName} ${req.user.lastName}`,
        metadata: { CustomerReferenceId: req.user._id.toString() },
      })

      if (!customer) {
        throw new Error(ERROR_RESPONSE.USER_NOT_CREATED)
      }

      const updateUser = await User.updateOne({ _id: req.user._id }, { $set: { customerId: customer.id } }).session(mongoSession)

      if (!updateUser) {
        await stripe.customers.del(customer.id) // rollback on Stripe side
        throw new Error(ERROR_RESPONSE.USER_NOT_CREATED)
      }
    } else {
      customer = await stripe.customers.retrieve(req.user.customerId)
    }

    const lineItems = [
      {
        price: orderType.API_ID, //this is a Stripe price ID
        quantity,
      },
    ]

    const stripeSession = await stripe.checkout.sessions.create({
      line_items: lineItems,
      customer_email: req.user.email,
      mode: "payment",
      success_url: `${process.env.FRONT_URL}/success`,
      cancel_url: `${process.env.FRONT_URL}/cancel`,
      billing_address_collection: "required",
      automatic_tax: { enabled: true },
      metadata: {
        userId: req.user._id.toString(),
        orderType: orderType._id.toString(),
        quantity,
      },
    })

    const month = moment().format("YYYY-MM")
    const newOrder = {
      user: req.user._id,
      quantity,
      cost: orderType.cost,
      taxPrice: orderType.taxPrice,
      orderType: orderType._id,
      currency: stripeSession.currency || "usd",
      costBeforeTax,
      totalPrice: total,
      paymentMethod: "pending",
      sessionId: stripeSession.id,
    }

    const directoryExists = await Order.exists({ month, orderType: orderType._id }).session(mongoSession)

    if (!directoryExists) {
      await Order.create([{ month, orderType: orderType._id, quarterlyOrder: [newOrder] }], { session: mongoSession })
    } else {
      await Order.updateOne(
        { month, orderType: orderType._id },
        { $push: { quarterlyOrder: newOrder } },
        { runValidators: true, session: mongoSession }
      )
    }

    await mongoSession.commitTransaction()
    await mongoSession.endSession()
    res.json({
      url: stripeSession.url,
      newOrder,
    })
  } catch (error) {
    await mongoSession.abortTransaction()
    await mongoSession.endSession()

    console.error(`❌ placeOrder error: ${error.message}`)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: error.message || "An unexpected error occurred.",
    })
  }
})
//#endregion

//#region @desc Cancel order
// @route PUT /api/order/cancel
// @access Private*/
const cancelOrder = asyncHandler(async (req, res) => {
  const { sessionId, orderType } = req.body
  const stripe = new Stripe(process.env.STRIPE_SECRET)

  try {
    await stripe.checkout.sessions.expire(sessionId)
    const deleteOrder = await Order.updateOne(
      {
        month: moment().format("YYYY-MM"),
        orderType: orderType,
      },
      {
        $pull: {
          quarterlyOrder: { sessionId },
        },
      }
    )

    if (!deleteOrder) {
      res.status(500)
      throw new Error(ERROR_RESPONSE.INVALID_DATA)
    }
    res.json({
      message: "order canceled. success!",
    })
  } catch (error) {
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: `${error}`,
    })
  }
})
//#endregion

const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"]
  const stripe = new Stripe(process.env.STRIPE_SECRET)

  console.log("📩 Incoming Stripe Webhook...")
  console.log("➡️ Signature Header:", sig)

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error("❌ Webhook Construction Error:", err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object

    try {
      const userId = session.metadata.userId
      const orderType = session.metadata.orderType
      const lpgQuantity = parseFloat(session.metadata.lpgQuantity)
      const sessionId = session.id

      await confirmOrderByWebhook(userId, orderType, lpgQuantity, sessionId, stripe)
    } catch (err) {
      console.error("❌ Failed to confirm order via webhook:", err.message)
      return res.status(500).send("Failed to confirm order")
    }
  }
  res.status(200).send("Webhook received")
}

// --- Main -----------------------------------------------------------
const confirmOrderByWebhook = async (userId, orderType, lpgQuantity, sessionId) => {
  const session = await startSession()
  session.startTransaction()
  const stripe = new Stripe(process.env.STRIPE_SECRET)

  try {
    // 1) Validate Stripe state
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
    if (stripeSession.payment_status !== "paid") throw new Error("Payment not completed.")

    const paymentIntentId = stripeSession.payment_intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["charges"] })
    const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url || "n/a"

    // 2) Find the pending quarterly order slice by sessionId (idempotency guard)
    const existingOrder = await Order.findOne(
      {
        month: moment().format("YYYY-MM"),
        orderType,
        "quarterlyOrder.sessionId": sessionId,
      },
      { "quarterlyOrder.$": 1 }
    ).lean()

    if (!existingOrder || !existingOrder.quarterlyOrder?.length) throw new Error("Order not found.")

    const quarterly = existingOrder.quarterlyOrder[0]
    if (quarterly.isPaid) throw new Error("SERVICE already added.")

    // 3) Load User
    const user = await User.findById(userId).session(session)
    if (!user) throw new Error("User not found.")

    // 4) Resolve perks from OrderType.description
    const oType = await OrderTypes.findById(orderType).lean()
    if (!oType) throw new Error("Order type not found.")

    
    const desc = oType?.description || ""

    await user.save({ session })

    // 7) Build snapshot + admin tags
    const userSnapshot = {
      userId: user._id,
      userName: user.userName,
      email: user.email,
      accountTier: user.accountTier || "standard",
    }

    // 8) Tax info from Stripe session
    const taxAmount = stripeSession.total_details?.amount_tax ?? 0

    // 9) Mark the quarterly order paid + attach metadata
    await Order.findOneAndUpdate(
      {
        month: moment().format("YYYY-MM"),
        orderType: new Types.ObjectId(orderType),
        "quarterlyOrder.sessionId": sessionId,
      },
      {
        $set: {
          "quarterlyOrder.$.isPaid": true,
          "quarterlyOrder.$.paidAt": new Date(),
          "quarterlyOrder.$.userSnapshot": userSnapshot,
          "quarterlyOrder.$.adminTags": adminTags,
          "quarterlyOrder.$.taxAmount": taxAmount,
          "quarterlyOrder.$.receiptUrl": receiptUrl,
          "quarterlyOrder.$.status": "expired", // if you expire the slot after payment
        },
      },
      { new: true, runValidators: true, session }
    )

    setTimeout(async () => {
      try {
        privateNamespace.to(userId.toString()).emit("PURCHASE DONE")
      } catch (e) {
        console.error("⚠️ PURCHASE emit failed:", e?.message || e)
      }
    }, 3000)

    // 11) Commit
    await session.commitTransaction()
    session.endSession()


    await sendNotification({
      userId,
      type: "deposit_status",
      subject: "Deposit Success",
      message: `${oType.displayName || oType.name || "SERVICE"} have been acquired successfully!`,
      from: {
        _id: process.env.SYSTEM_ADMIN,
        userName: "PROJECT",
        avatar: process.env.ADMIN_IMAGE,
      }
    })
  } catch (err) {
    try {
      await session.abortTransaction()
    } catch (_) {}
    session.endSession()
    console.error("❌ confirmOrderByWebhook:failed", err?.message || err)
    throw err
  }
}

export {
  placeOrder,
  cancelOrder,
  handleStripeWebhook,
}
