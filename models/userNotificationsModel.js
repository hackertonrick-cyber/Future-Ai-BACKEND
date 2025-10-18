import mongoose from "mongoose"

const userNotificationsSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    subject: {
      type: String,
      required: [true, "Notification subject is required."],
    },
    from: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      userName: {
        type: String,
      },
      avatar: {
        type: String,
      },
    },
    message: {
      type: String,
      required: [true, "Notification message is required."],
    },
    action_url: [
      {
        text: {
          type: String,
          required: [true, "Action URL text is required."],
        },
        url: {
          type: String,
          required: [true, "Action URL is required."],
        },
        params: {
          type: Object,
          required: false,
        },
        _id: {
          type: String,
        },
      },
    ],
    status: {
      type: String,
      enum: ["viewed", "not_viewed"],
      default: "not_viewed",
    },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
)

userNotificationsSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const UserNotifications = mongoose.model("UserNotifications", userNotificationsSchema)
export default UserNotifications
