import { SessionModel } from '../models/index.js'
import { SignalingCore } from '../core/signaling.js'
import { MessageModel }  from '../models/index.js'

export const initSocket = (io) => {

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token

            if (!token) return next(new Error('Token tidak ditemukan'))

            const session = await SessionModel.findByToken(token)
            if (!session)  return next(new Error('Session tidak valid'))

            socket.userId = session.user_id
            socket.user   = { id: session.user_id, data: session.user_data }

            next()
        } catch (err) {
            next(new Error('Auth gagal'))
        }
    })

    io.on('connection', async (socket) => {
        const userId = socket.userId

        SignalingCore.register(userId, socket.id)
        await SignalingCore.notifyPartnerOnline(io, userId)

        console.log(`[socket] ${userId} connected`)


        socket.on('webrtc:offer', ({ offer }) => {
            SignalingCore.handleOffer(io, userId, offer)
        })

        socket.on('webrtc:answer', ({ answer }) => {
            SignalingCore.handleAnswer(io, userId, answer)
        })

        socket.on('webrtc:ice', ({ candidate }) => {
            SignalingCore.handleIceCandidate(io, userId, candidate)
        })


        socket.on('message:send', async ({ messageId }) => {
            try {
                const partner = await SignalingCore.getPartnerSocketId(userId)
                if (!partner?.socketId) return

                await MessageModel.updateStatus(messageId, 'delivered')
                io.to(partner.socketId).emit('message:new', { messageId })
            } catch {}
        })

        socket.on('message:read', async ({ messageId }) => {
            try {
                await MessageModel.updateStatus(messageId, 'read')

                const partner = await SignalingCore.getPartnerSocketId(userId)
                if (partner?.socketId) {
                    io.to(partner.socketId).emit('message:read', { messageId })
                }
            } catch {}
        })


        socket.on('pair:complete', async ({ pairData }) => {
            try {
                const partner = await SignalingCore.getPartnerSocketId(userId)
                if (partner?.socketId) {
                    io.to(partner.socketId).emit('pair:success', { pair: pairData })
                }
            } catch {}
        })


        socket.on('typing:start', async () => {
            const partner = await SignalingCore.getPartnerSocketId(userId)
            if (partner?.socketId) {
                io.to(partner.socketId).emit('typing:start', { userId })
            }
        })

        socket.on('typing:stop', async () => {
            const partner = await SignalingCore.getPartnerSocketId(userId)
            if (partner?.socketId) {
                io.to(partner.socketId).emit('typing:stop', { userId })
            }
        })


        socket.on('disconnect', async () => {
            await SignalingCore.notifyPartnerOffline(io, userId)
            SignalingCore.unregister(userId)
            console.log(`[socket] ${userId} disconnected`)
        })
    })
}