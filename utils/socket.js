import { Server } from "socket.io"
import { instrument } from "@socket.io/admin-ui"

/**
 * Map<userId: string, Set<socketId: string>>
 * Allows tracking multiple socket connections per user
 */
export const onlinePatients = new Map()

const io = new Server({
  cors: {
    origin: [
      "http://localhost:5173",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
})

// Create a namespace for private chats
const privateNamespace = io.of("/private")

// Socket methods for emitting events
const Socket = {
  emit: function (event, data) {
    privateNamespace.emit(event, data)
  },
  emit_to_one: function (data) {
    if (privateNamespace.sockets?.[0]?.adapter?.rooms?.get(data.room)) {
      privateNamespace.to(data.room.toString()).emit(data.emit, data)
    } else {
      console.warn(`Room ${data.room} does not exist or no sockets are connected`)
    }
  },
  emit_to_many: function (data) {
    if (Array.isArray(data.rooms) && data.rooms.length > 0) {
      privateNamespace.to(data.rooms).emit(data.emit, data)
    } else {
      console.warn("No valid rooms provided for broadcast")
    }
  },
}

// Handle connections to the private chat namespace
privateNamespace.on("connection", (socket) => {
  console.log(`User connected to private namespace: ${socket.id}`)

  let userId = null
  // Handle personal room joining with error handling
  socket.on("joinPersonalRoom", (data) => {
    if (!data?.user) return

    if (data?.user) {
      userId = data.user

      if (!onlinePatients.has(userId)) {
        onlinePatients.set(userId, new Set())
      }
      onlinePatients.get(userId).add(socket.id)
      socket.join(userId)
      console.log(`Socket ${socket.id} joined personal room ${userId}`)
    } else {
      console.warn("No user ID in joinPersonalRoom payload")
    }
  })

  // User disconnects
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`)

    if (userId && onlinePatients.has(userId)) {
      const userSockets = onlinePatients.get(userId)
      userSockets.delete(socket.id)
      if (userSockets.size === 0) {
        onlinePatients.delete(userId)
        console.log(`User ${userId} marked offline`)
      }
    }
  })

socket.on("checkIfOnline", (userId, callback) => {
  const isOnline = onlinePatients.has(userId)
  console.log(onlinePatients)
  console.log(`🧠 [checkIfOnline] User ${userId} is ${isOnline ? 'ONLINE' : 'OFFLINE'}`)
  callback(isOnline)
})

  socket.on("presencePing", ({ userId: senderId, to, pingId }) => {
    if (!senderId || !pingId || !Array.isArray(to)) return

    console.log(`📡 [presencePing] User ${senderId} is pinging:`, to)

    to.forEach((targetUserId) => {
      console.log(`➡️ Sending presenceRequest to ${targetUserId} from ${senderId}`)

      privateNamespace.to(targetUserId.toString()).emit("presenceRequest", {
        from: senderId,
        pingId,
      })
    })
  })

  socket.on("presencePong", ({ sender, to, pingId }) => {
    if (!to || !pingId) return

    console.log(`📨 [presencePong] ${sender} replied to ${to} (pingId: ${pingId})`)

    privateNamespace.to(to.toString()).emit("presencePong", {
      from: sender,
      pingId,
    })
  })

  socket.on("typing", ({ to, from, isTyping }) => {
    if (!to || !from) return

    privateNamespace.to(to).emit("typingStatus", {
      userId: from,
      isTyping,
    })
  })
})

// Instrument admin-ui
instrument(io, {
  auth: false,
})

export { Socket, io, privateNamespace }
