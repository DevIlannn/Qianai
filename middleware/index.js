import { SessionModel } from '../models/index.js'
import { env }          from '../config/index.js'

export const authGuard = async (req, res, next) => {
    try {
        const token = req.session?.token || req.headers['x-session-token']

        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' })
        }

        const session = await SessionModel.findByToken(token)

        if (!session) {
            return res.status(401).json({ success: false, message: 'Session tidak valid atau sudah berakhir' })
        }

        req.user    = {
            id    : session.user_id,
            data  : session.user_data,
            device: session.user_device
        }
        req.session.userId = session.user_id

        next()
    } catch (err) {
        next(err)
    }
}

export const getClientIp = (req) => {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        req.ip ||
        '0.0.0.0'
    )
}

export const attachIp = (req, res, next) => {
    req.clientIp = getClientIp(req)
    req.ip       = req.clientIp
    next()
}

export const rateLimiter = (() => {
    const store = new Map()

    return (max = 60, windowMs = 60000) => (req, res, next) => {
        const key  = getClientIp(req)
        const now  = Date.now()
        const data = store.get(key) || { count: 0, start: now }

        if (now - data.start > windowMs) {
            data.count = 0
            data.start = now
        }

        data.count++
        store.set(key, data)

        if (data.count > max) {
            return res.status(429).json({ success: false, message: 'Terlalu banyak request' })
        }

        next()
    }
})()

export const errorHandler = (err, req, res, next) => {
    const status  = err.status || 500
    const message = env.isDev ? err.message : (status < 500 ? err.message : 'Internal server error')

    if (status >= 500) {
        console.error('[error]', err.stack || err.message)
    }

    res.status(status).json({ success: false, message })
}

export const notFound = (req, res) => {
    res.status(404).json({ success: false, message: 'Route tidak ditemukan' })
}