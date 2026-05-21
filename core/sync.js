import { MessageModel, MediaModel } from '../models/index.js'

export const SyncCore = {

    async syncMessages(pairId, messages) {
        if (!messages?.length) return { synced: 0, failed: 0 }

        let synced = 0
        let failed = 0

        for (const msg of messages) {
            try {
                const exists = await MessageModel.findById?.(msg.id)
                if (exists) {
                    synced++
                    continue
                }

                await MessageModel.create({
                    pairId   : pairId,
                    senderId : msg.sender_id,
                    data     : {
                        type      : msg.type,
                        content   : msg.content,
                        reply_to  : msg.reply_to || null,
                        is_deleted: false,
                        status    : 'delivered'
                    },
                    ip: msg.ip || null
                })

                if (msg.media && (msg.type === 'image' || msg.type === 'video' || msg.type === 'file')) {
                    await MediaModel.create({
                        messageId: msg.id,
                        userId   : msg.sender_id,
                        data     : {
                            type      : msg.type,
                            filename  : msg.media.filename,
                            mimetype  : msg.media.mimetype,
                            size_bytes: msg.media.size_bytes,
                            blob      : msg.media.blob
                        },
                        ip: msg.ip || null
                    })
                }

                synced++
            } catch {
                failed++
            }
        }

        return { synced, failed }
    },

    async getMessagesSince(pairId, since, limit = 100) {
        const messages = await MessageModel.findByPairId(pairId, limit, null)
        if (!since) return messages

        return messages.filter(m => new Date(m.created_at) > new Date(since))
    },

    buildOfflinePayload(messages) {
        return messages.map(m => ({
            id        : m.id,
            pair_id   : m.pair_id,
            sender_id : m.sender_id,
            type      : m.data.type,
            content   : m.data.content,
            reply_to  : m.data.reply_to,
            status    : m.data.status,
            created_at: m.created_at
        }))
    }
}