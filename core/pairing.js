import QRCode  from 'qrcode'
import { v4 as uuidv4 } from 'uuid'
import {
    PairModel,
    PairTokenModel,
    UserModel,
    IpLogModel
} from '../models/index.js'
import { TOKEN_EXPIRES_MINUTES } from '../config/index.js'

const generateToken = () => uuidv4().replace(/-/g, '').substring(0, 24)

const buildExpiresAt = () => {
    const d = new Date()
    d.setMinutes(d.getMinutes() + TOKEN_EXPIRES_MINUTES)
    return d
}

const generateQrBase64 = async (payload) => {
    return await QRCode.toDataURL(JSON.stringify(payload), {
        errorCorrectionLevel: 'H',
        margin : 2,
        width  : 300,
        color  : { dark: '#000000', light: '#ffffff' }
    })
}

export const PairingCore = {

    async generateQr(userId, ip) {
        const existing = await PairTokenModel.findActiveByUserId(userId)
        if (existing) return existing

        const token     = generateToken()
        const expiresAt = buildExpiresAt()
        const pair      = await PairModel.create({ userA: userId, ip })

        const payload = { t: token, p: pair.id }
        const qr      = await generateQrBase64(payload)

        const record = await PairTokenModel.create({
            userId,
            token,
            qrPayload: qr,
            ip,
            expiresAt
        })

        return record
    },

    async refreshQr(userId, ip) {
        const token     = generateToken()
        const expiresAt = buildExpiresAt()
        const pair      = await PairModel.create({ userA: userId, ip })

        const payload = { t: token, p: pair.id }
        const qr      = await generateQrBase64(payload)

        const existing = await PairTokenModel.findActiveByUserId(userId)

        if (existing) {
            await PairTokenModel.updateQr(userId, qr, token, expiresAt, ip)
        } else {
            await PairTokenModel.create({ userId, token, qrPayload: qr, ip, expiresAt })
        }

        return { token, qr, expiresAt }
    },

    async scanQr(scannerUserId, token, ip) {
        const tokenRecord = await PairTokenModel.findByToken(token)

        if (!tokenRecord) {
            throw Object.assign(new Error('QR tidak valid atau sudah kadaluarsa'), { status: 400 })
        }

        const pairId  = tokenRecord.data.qr_payload
            ? JSON.parse(tokenRecord.data.qr_payload)?.p
            : null

        if (!pairId) {
            throw Object.assign(new Error('Data QR tidak valid'), { status: 400 })
        }

        const pair = await PairModel.findById(pairId)

        if (!pair) {
            throw Object.assign(new Error('Sesi pairing tidak ditemukan'), { status: 404 })
        }

        if (pair.user_a === scannerUserId) {
            throw Object.assign(new Error('Tidak bisa scan QR milik sendiri'), { status: 400 })
        }

        if (pair.data.status === 'active') {
            throw Object.assign(new Error('Pasangan ini sudah terhubung'), { status: 409 })
        }

        const existingPair = await PairModel.findByUserId(scannerUserId)
        if (existingPair) {
            throw Object.assign(new Error('Kamu sudah memiliki pasangan'), { status: 409 })
        }

        const updatedPair = await PairModel.activate(pairId, scannerUserId, ip)
        await PairTokenModel.markUsed(tokenRecord.id)

        const userA = await UserModel.findById(pair.user_a)
        const userB = await UserModel.findById(scannerUserId)

        return { pair: updatedPair, userA, userB }
    },

    async handleIpChange(userId, oldIp, newIp, ip) {
        await IpLogModel.create({
            userId,
            ipPrevious  : oldIp,
            ipNew       : newIp,
            qrRefreshed : true,
            ip
        })

        const refreshed = await PairingCore.refreshQr(userId, ip)
        return refreshed
    },

    async getPairStatus(userId) {
        const pair = await PairModel.findByUserId(userId)
        if (!pair) return { paired: false }

        const isUserA    = pair.user_a === userId
        const partnerData = isUserA ? pair.user_b_data : pair.user_a_data

        return {
            paired     : true,
            pairId     : pair.id,
            pairedAt   : pair.data.paired_at,
            partner    : {
                username: partnerData?.username || null,
                avatar  : partnerData?.avatar || null,
                bio     : partnerData?.bio || null
            }
        }
    }
}