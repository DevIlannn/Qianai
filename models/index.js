import { db, TABLES, PAIR_STATUS, MESSAGE_STATUS } from '../config/index.js'
import { v4 as uuidv4 } from 'uuid'

const T = TABLES

const run = (query, params = []) => db.query(query, params)


export const UserModel = {

    async create({ id, data, device, ip }) {
        const q = `
            INSERT INTO ${T.users} (id, data, device, ip)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `
        const { rows } = await run(q, [id, data, device, ip])
        return rows[0]
    },

    async findById(id) {
        const { rows } = await run(
            `SELECT * FROM ${T.users} WHERE id = $1`, [id]
        )
        return rows[0] || null
    },

    async updateData(id, data) {
        const { rows } = await run(
            `UPDATE ${T.users} SET data = data || $2 WHERE id = $1 RETURNING *`,
            [id, data]
        )
        return rows[0]
    },

    async updateIp(id, ip) {
        const { rows } = await run(
            `UPDATE ${T.users} SET ip = $2 WHERE id = $1 RETURNING ip`,
            [id, ip]
        )
        return rows[0]
    }
}


export const CredentialModel = {

    async create({ userId, data, ip }) {
        const { rows } = await run(
            `INSERT INTO ${T.credentials} (user_id, data, ip) VALUES ($1, $2, $3) RETURNING *`,
            [userId, data, ip]
        )
        return rows[0]
    },

    async findByUserId(userId) {
        const { rows } = await run(
            `SELECT * FROM ${T.credentials} WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        )
        return rows
    },

    async findByCredentialId(credentialId) {
        const { rows } = await run(
            `SELECT * FROM ${T.credentials} WHERE data->>'credential_id' = $1`,
            [credentialId]
        )
        return rows[0] || null
    },

    async updateSignCount(id, signCount) {
        await run(
            `UPDATE ${T.credentials} SET data = jsonb_set(data, '{sign_count}', $2) WHERE id = $1`,
            [id, JSON.stringify(signCount)]
        )
    }
}


export const SessionModel = {

    async create({ userId, token, device, ip }) {
        const data = { token, is_active: true, device }
        const { rows } = await run(
            `INSERT INTO ${T.sessions} (user_id, data, ip) VALUES ($1, $2, $3) RETURNING *`,
            [userId, data, ip]
        )
        return rows[0]
    },

    async findByToken(token) {
        const { rows } = await run(
            `SELECT s.*, u.data as user_data, u.device as user_device
             FROM ${T.sessions} s
             JOIN ${T.users} u ON u.id = s.user_id
             WHERE s.data->>'token' = $1
             AND s.data->>'is_active' = 'true'`,
            [token]
        )
        return rows[0] || null
    },

    async revoke(token) {
        await run(
            `UPDATE ${T.sessions}
             SET data = jsonb_set(data, '{is_active}', 'false')
             WHERE data->>'token' = $1`,
            [token]
        )
    },

    async revokeAllByUser(userId) {
        await run(
            `UPDATE ${T.sessions}
             SET data = jsonb_set(data, '{is_active}', 'false')
             WHERE user_id = $1`,
            [userId]
        )
    }
}


export const PairModel = {

    async create({ userA, ip }) {
        const data = { status: PAIR_STATUS.pending, paired_at: null }
        const { rows } = await run(
            `INSERT INTO ${T.pairs} (user_a, data, ip) VALUES ($1, $2, $3) RETURNING *`,
            [userA, data, ip]
        )
        return rows[0]
    },

    async findByUserId(userId) {
        const { rows } = await run(
            `SELECT p.*, 
                    ua.data as user_a_data,
                    ub.data as user_b_data
             FROM ${T.pairs} p
             LEFT JOIN ${T.users} ua ON ua.id = p.user_a
             LEFT JOIN ${T.users} ub ON ub.id = p.user_b
             WHERE (p.user_a = $1 OR p.user_b = $1)
             AND p.data->>'status' = 'active'
             LIMIT 1`,
            [userId]
        )
        return rows[0] || null
    },

    async findById(id) {
        const { rows } = await run(
            `SELECT * FROM ${T.pairs} WHERE id = $1`, [id]
        )
        return rows[0] || null
    },

    async activate(id, userB, ip) {
        const { rows } = await run(
            `UPDATE ${T.pairs}
             SET user_b = $2,
                 data   = data || $3,
                 ip     = $4
             WHERE id = $1 RETURNING *`,
            [id, userB, { status: PAIR_STATUS.active, paired_at: new Date().toISOString() }, ip]
        )
        return rows[0]
    }
}


export const PairTokenModel = {

    async create({ userId, token, qrPayload, ip, expiresAt }) {
        const data = { token, qr_payload: qrPayload, is_used: false }
        const { rows } = await run(
            `INSERT INTO ${T.pairTokens} (user_id, data, ip, expires_at)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, data, ip, expiresAt]
        )
        return rows[0]
    },

    async findByToken(token) {
        const { rows } = await run(
            `SELECT * FROM ${T.pairTokens}
             WHERE data->>'token' = $1
             AND data->>'is_used' = 'false'
             AND expires_at > NOW()`,
            [token]
        )
        return rows[0] || null
    },

    async findActiveByUserId(userId) {
        const { rows } = await run(
            `SELECT * FROM ${T.pairTokens}
             WHERE user_id = $1
             AND data->>'is_used' = 'false'
             AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        )
        return rows[0] || null
    },

    async markUsed(id) {
        await run(
            `UPDATE ${T.pairTokens}
             SET data = jsonb_set(data, '{is_used}', 'true')
             WHERE id = $1`,
            [id]
        )
    },

    async updateQr(userId, qrPayload, token, expiresAt, ip) {
        await run(
            `UPDATE ${T.pairTokens}
             SET data       = jsonb_set(jsonb_set(data, '{qr_payload}', $2), '{token}', $3),
                 expires_at = $4,
                 ip         = $5
             WHERE user_id  = $1
             AND data->>'is_used' = 'false'`,
            [userId, JSON.stringify(qrPayload), JSON.stringify(token), expiresAt, ip]
        )
    }
}


export const MessageModel = {

    async create({ pairId, senderId, data, ip }) {
        const payload = {
            ...data,
            status    : MESSAGE_STATUS.sent,
            is_deleted: false
        }
        const { rows } = await run(
            `INSERT INTO ${T.messages} (id, pair_id, sender_id, data, ip)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [uuidv4(), pairId, senderId, payload, ip]
        )
        return rows[0]
    },

    async findByPairId(pairId, limit = 50, before = null) {
        const params = [pairId, limit]
        let cursor = ''

        if (before) {
            params.push(before)
            cursor = `AND m.created_at < $${params.length}`
        }

        const { rows } = await run(
            `SELECT m.*,
                    u.data->>'username' as sender_username,
                    u.data->>'avatar'   as sender_avatar
             FROM ${T.messages} m
             JOIN ${T.users} u ON u.id = m.sender_id
             WHERE m.pair_id = $1
             AND (m.data->>'is_deleted')::boolean = false
             ${cursor}
             ORDER BY m.created_at DESC
             LIMIT $2`,
            params
        )
        return rows.reverse()
    },

    async updateStatus(id, status) {
        await run(
            `UPDATE ${T.messages}
             SET data = jsonb_set(data, '{status}', $2)
             WHERE id = $1`,
            [id, JSON.stringify(status)]
        )
    },

    async softDelete(id, userId) {
        await run(
            `UPDATE ${T.messages}
             SET data = jsonb_set(data, '{is_deleted}', 'true')
             WHERE id = $1 AND sender_id = $2`,
            [id, userId]
        )
    }
}


export const MediaModel = {

    async create({ messageId, userId, data, ip }) {
        const { rows } = await run(
            `INSERT INTO ${T.media} (message_id, user_id, data, ip)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [messageId, userId, data, ip]
        )
        return rows[0]
    },

    async findByMessageId(messageId) {
        const { rows } = await run(
            `SELECT * FROM ${T.media} WHERE message_id = $1`,
            [messageId]
        )
        return rows
    }
}


export const IpLogModel = {

    async create({ userId, ipPrevious, ipNew, qrRefreshed, ip }) {
        const data = { ip_previous: ipPrevious, ip_new: ipNew, qr_refreshed: qrRefreshed }
        await run(
            `INSERT INTO ${T.ipLogs} (user_id, data, ip) VALUES ($1, $2, $3)`,
            [userId, data, ip]
        )
    },

    async findByUserId(userId, limit = 20) {
        const { rows } = await run(
            `SELECT * FROM ${T.ipLogs}
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [userId, limit]
        )
        return rows
    }
}