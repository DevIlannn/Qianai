import { Router }       from 'express'
import { AuthCore }     from '../core/auth.js'
import { PairingCore }  from '../core/pairing.js'
import { SyncCore }     from '../core/sync.js'
import { MessageModel, UserModel, MediaModel } from '../models/index.js'
import { authGuard, rateLimiter, attachIp }    from '../middleware/index.js'

const router = Router()

router.use(attachIp)


router.get('/health', (req, res) => {
    res.json({ success: true, message: 'Qianai API is running' })
})


router.post('/auth/register/options', rateLimiter(10, 60000), async (req, res, next) => {
    try {
        const { options, userId } = await AuthCore.getRegistrationOptions(req)
        res.json({ success: true, options, userId })
    } catch (err) { next(err) }
})

router.post('/auth/register/verify', rateLimiter(10, 60000), async (req, res, next) => {
    try {
        const { response, device } = req.body
        const { user, token }      = await AuthCore.verifyRegistration(req, response, device)
        res.json({ success: true, user: { id: user.id, data: user.data }, token })
    } catch (err) { next(err) }
})

router.post('/auth/login/options', rateLimiter(20, 60000), async (req, res, next) => {
    try {
        const options = await AuthCore.getAuthenticationOptions(req)
        res.json({ success: true, options })
    } catch (err) { next(err) }
})

router.post('/auth/login/verify', rateLimiter(10, 60000), async (req, res, next) => {
    try {
        const { response, device }        = req.body
        const { user, token, ipChanged }  = await AuthCore.verifyAuthentication(req, response, device)
        res.json({ success: true, user: { id: user.id, data: user.data }, token, ipChanged })
    } catch (err) { next(err) }
})

router.post('/auth/logout', authGuard, async (req, res, next) => {
    try {
        await AuthCore.logout(req)
        res.json({ success: true })
    } catch (err) { next(err) }
})


router.get('/user/me', authGuard, async (req, res, next) => {
    try {
        const user = await UserModel.findById(req.user.id)
        res.json({ success: true, user: { id: user.id, data: user.data, device: user.device } })
    } catch (err) { next(err) }
})

router.patch('/user/me', authGuard, async (req, res, next) => {
    try {
        const { username, bio, avatar } = req.body
        const update = {}

        if (username !== undefined) update.username = username
        if (bio !== undefined)      update.bio      = bio
        if (avatar !== undefined)   update.avatar   = avatar

        const user = await UserModel.updateData(req.user.id, update)
        res.json({ success: true, user: { id: user.id, data: user.data } })
    } catch (err) { next(err) }
})


router.get('/pair/qr', authGuard, async (req, res, next) => {
    try {
        const record = await PairingCore.generateQr(req.user.id, req.clientIp)
        res.json({
            success   : true,
            qr        : record.data.qr_payload,
            expiresAt : record.expires_at
        })
    } catch (err) { next(err) }
})

router.post('/pair/scan', authGuard, async (req, res, next) => {
    try {
        const { token }           = req.body
        const { pair, userA, userB } = await PairingCore.scanQr(req.user.id, token, req.clientIp)
        res.json({ success: true, pair, userA: { id: userA.id, data: userA.data }, userB: { id: userB.id, data: userB.data } })
    } catch (err) { next(err) }
})

router.get('/pair/status', authGuard, async (req, res, next) => {
    try {
        const status = await PairingCore.getPairStatus(req.user.id)
        res.json({ success: true, ...status })
    } catch (err) { next(err) }
})


router.get('/messages/:pairId', authGuard, async (req, res, next) => {
    try {
        const { pairId }  = req.params
        const { before, limit } = req.query
        const messages    = await MessageModel.findByPairId(pairId, parseInt(limit) || 50, before || null)
        res.json({ success: true, messages })
    } catch (err) { next(err) }
})

router.post('/messages', authGuard, async (req, res, next) => {
    try {
        const { pairId, type, content, replyTo } = req.body
        const message = await MessageModel.create({
            pairId,
            senderId: req.user.id,
            data    : { type: type || 'text', content, reply_to: replyTo || null },
            ip      : req.clientIp
        })
        res.json({ success: true, message })
    } catch (err) { next(err) }
})

router.delete('/messages/:id', authGuard, async (req, res, next) => {
    try {
        await MessageModel.softDelete(req.params.id, req.user.id)
        res.json({ success: true })
    } catch (err) { next(err) }
})

router.post('/messages/:id/media', authGuard, async (req, res, next) => {
    try {
        const { type, filename, mimetype, size_bytes, blob } = req.body
        const media = await MediaModel.create({
            messageId: req.params.id,
            userId   : req.user.id,
            data     : { type, filename, mimetype, size_bytes, blob },
            ip       : req.clientIp
        })
        res.json({ success: true, media })
    } catch (err) { next(err) }
})


router.post('/sync', authGuard, async (req, res, next) => {
    try {
        const { pairId, messages } = req.body
        const result = await SyncCore.syncMessages(pairId, messages)
        res.json({ success: true, ...result })
    } catch (err) { next(err) }
})

router.get('/sync/:pairId', authGuard, async (req, res, next) => {
    try {
        const { since, limit } = req.query
        const messages = await SyncCore.getMessagesSince(req.params.pairId, since, parseInt(limit) || 100)
        const payload  = SyncCore.buildOfflinePayload(messages)
        res.json({ success: true, messages: payload })
    } catch (err) { next(err) }
})


export default router