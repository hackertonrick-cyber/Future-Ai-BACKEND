// import { CourierClient } from '@trycourier/courier'
import dotenv from "dotenv"

export const sendMail = async (eventId, recipientId, email, emailVCode) => {
  dotenv.config()
  // const courier = CourierClient({
  //   authorizationToken: process.env.COURIER_AUTH_TOKEN,
  // })
  // try {
  //   const { requestId } = await courier.send({
  //     eventId,
  //     recipientId,
  //     profile: {
  //       email,
  //     },
  //     data: { emailVCode },
  //   })
  //   return requestId
  // } catch (error) {
  //   return error
  // }
}
