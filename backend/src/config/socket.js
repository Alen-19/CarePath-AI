const socketIO = require('socket.io');
const Appointment = require('../models/Appointment');

let io;

/**
 * Initializes Socket.io with HTTP server
 */
function initSocket(server) {
  io = socketIO(server, {
    cors: {
      origin: '*', // Allow all origins for dev/trial flexibility
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] New client connected: ${socket.id}`);

    // Join Consultation Room
    socket.on('join-room', async (data) => {
      const { appointmentId, userId, userRole, userName } = data || {};
      if (!appointmentId) return;

      const roomName = `room_${appointmentId}`;
      socket.join(roomName);
      socket.data.appointmentId = appointmentId;
      socket.data.userId = userId;
      socket.data.userRole = userRole;
      socket.data.userName = userName;

      console.log(`[Socket.io] User ${userName} (${userRole}) joined room ${roomName} [Socket: ${socket.id}]`);

      // Get list of existing sockets in this room
      const socketsInRoom = await io.in(roomName).fetchSockets();
      const existingUsers = socketsInRoom
        .filter(s => s.id !== socket.id)
        .map(s => ({
          socketId: s.id,
          userId: s.data.userId,
          userRole: s.data.userRole,
          userName: s.data.userName
        }));

      // Notify the joining user about existing peers in the room
      socket.emit('room-users', existingUsers);

      // Notify existing users in the room about the new user
      socket.to(roomName).emit('user-joined', {
        socketId: socket.id,
        userId,
        userRole,
        userName
      });

      // Update appointment status to 'In Progress' if not already started
      try {
        await Appointment.findByIdAndUpdate(appointmentId, {
          callStatus: 'In Progress',
          callStartedAt: new Date()
        });
      } catch (err) {
        console.error('[Socket.io] Error updating appointment call status:', err.message);
      }
    });

    // Relay WebRTC Offer
    socket.on('offer', (data) => {
      const { targetSocketId, sdp, callerId, callerName, callerRole } = data || {};
      if (targetSocketId) {
        io.to(targetSocketId).emit('offer', {
          callerSocketId: socket.id,
          sdp,
          callerId,
          callerName,
          callerRole
        });
      }
    });

    // Relay WebRTC Answer
    socket.on('answer', (data) => {
      const { targetSocketId, sdp } = data || {};
      if (targetSocketId) {
        io.to(targetSocketId).emit('answer', {
          responderSocketId: socket.id,
          sdp
        });
      }
    });

    // Relay ICE Candidate
    socket.on('ice-candidate', (data) => {
      const { targetSocketId, candidate } = data || {};
      if (targetSocketId && candidate) {
        io.to(targetSocketId).emit('ice-candidate', {
          senderSocketId: socket.id,
          candidate
        });
      }
    });

    // Relay Toggle Media (Mute/Unmute Mic or Camera)
    socket.on('toggle-media', (data) => {
      const { appointmentId, mediaType, enabled } = data || {};
      const roomName = `room_${appointmentId}`;
      socket.to(roomName).emit('peer-media-toggled', {
        socketId: socket.id,
        mediaType,
        enabled
      });
    });

    // Relay In-Call Live Chat Messages
    socket.on('send-chat-message', (data) => {
      const { appointmentId, message, senderName, senderRole } = data || {};
      const roomName = `room_${appointmentId}`;
      io.in(roomName).emit('chat-message', {
        message,
        senderName,
        senderRole,
        senderSocketId: socket.id,
        timestamp: new Date()
      });
    });

    // End Call Handler
    socket.on('end-call', async (data) => {
      const { appointmentId } = data || {};
      const roomName = `room_${appointmentId}`;
      
      console.log(`[Socket.io] Call ended for appointment: ${appointmentId}`);
      io.in(roomName).emit('call-ended', { endedBy: socket.data.userName });

      try {
        const appt = await Appointment.findById(appointmentId);
        if (appt && appt.callStatus !== 'Completed') {
          const now = new Date();
          const duration = appt.callStartedAt 
            ? Math.round((now - new Date(appt.callStartedAt)) / 1000)
            : 0;

          appt.callStatus = 'Completed';
          appt.callEndedAt = now;
          appt.callDurationSeconds = duration;
          await appt.save();
        }
      } catch (err) {
        console.error('[Socket.io] Error completing call on DB:', err.message);
      }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      const appointmentId = socket.data.appointmentId;
      if (appointmentId) {
        const roomName = `room_${appointmentId}`;
        socket.to(roomName).emit('user-left', {
          socketId: socket.id,
          userName: socket.data.userName
        });
      }
    });
  });

  return io;
}

/**
 * Returns active Socket.io instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
}

module.exports = {
  initSocket,
  getIO
};
