import mongoose from "mongoose"

const mediaSchema = mongoose.Schema(
  {
    media: {
      type: String,
      required: [true, "Media is required"],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    content: {
      type: Boolean,
      default: false,
    },
    mediaType: {
      type: String,
      set: (val) => val?.toLowerCase(),
      enum: {
        values: [".jpeg", ".png", ".mp4", ".jpg", ".gif", ".mov", ".wmv", ".mp3", ".wav"],
        message: "Media type must be one of the specified formats",
      },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

// Enable virtuals in JSON output
mediaSchema.set("toObject", { virtuals: true })
mediaSchema.set("toJSON", { virtuals: true })

const Media = mongoose.model("Media", mediaSchema)
export default Media
