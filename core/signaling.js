import { PairModel } from '../models/index.js'

const peers = new Map()

export const SignalingCore = {

    register(userId, socketId) {
        peers.set(userId, socketId)
    },

    unregister(userId) {
        peers.delete(userId)
    },

    getSocketId(userId) {
        return peers.get(userId) || null
    },

    isOnline(userId) {
        return peers.has(userId)
    },

    async getPartnerSocketId(userId) {
        const pair = await PairModel.findByUserId(userId)
        if (!pair) return null

        const partnerId = pair.user_a === userId ? pair.user_b : pair.user_a
        if (!partnerId) return null

        return {
            socketId : peers.get(partnerId) || null,
            partnerId: partnerId
        }
    },

    handleOffer(io, fromUserId, offer) {
        SignalingCore.getPartnerSocketId(fromUserId).then((partner) => {
            if (!partner?.socketId) return
            io.to(partner.socketId).emit('webrtc:offer', {
                offer,
                fromUserId
            })
        })
    },

    handleAnswer(io, fromUserId, answer) {
        SignalingCore.getPartnerSocketId(fromUserId).then((partner) => {
            if (!partner?.socketId) return
            io.to(partner.socketId).emit('webrtc:answer', {
                answer,
                fromUserId
            })
        })
    },

    handleIceCandidate(io, fromUserId, candidate) {
        SignalingCore.getPartnerSocketId(fromUserId).then((partner) => {
            if (!partner?.socketId) return
            io.to(partner.socketId).emit('webrtc:ice', {
                candidate,
                fromUserId
            })
        })
    },

    async notifyPartnerOnline(io, userId) {
        const partner = await SignalingCore.getPartnerSocketId(userId)
        if (!partner?.socketId) return

        io.to(partner.socketId).emit('partner:online', { userId })

        const mySocketId = peers.get(userId)
        if (mySocketId) {
            io.to(mySocketId).emit('partner:online', { userId: partner.partnerId })
        }
    },

    async notifyPartnerOffline(io, userId) {
        const partner = await SignalingCore.getPartnerSocketId(userId)
        if (!partner?.socketId) return
        io.to(partner.socketId).emit('partner:offline', { userId })
    },

    async notifyQrRefresh(io, userId, qr) {
        const socketId = peers.get(userId)
        if (!socketId) return
        io.to(socketId).emit('qr:refreshed', { qr })
    },

    async notifyPaired(io, userAId, userBId, pair) {
        const socketA = peers.get(userAId)
        const socketB = peers.get(userBId)

        if (socketA) io.to(socketA).emit('pair:success', { pair })
        if (socketB) io.to(socketB).emit('pair:success', { pair })
    }
}