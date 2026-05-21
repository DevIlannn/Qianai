import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} from '@simplewebauthn/server'
import { v4 as uuidv4 } from 'uuid'
import { env }           from '../config/index.js'
import {
    UserModel,
    CredentialModel,
    SessionModel,
    IpLogModel
} from '../models/index.js'

const generateUserId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let id = ''
    for (let i = 0; i < 8; i++) {
        id += chars[Math.floor(Math.random() * chars.length)]
    }
    return id
}

const collectDevice = (req) => ({
    user_agent : req.headers['user-agent'] || null,
    ip         : req.ip
})

export const AuthCore = {

    async getRegistrationOptions(req) {
        const userId   = generateUserId()
        const userName = `user_${userId.toLowerCase()}`

        const options = await generateRegistrationOptions({
            rpName              : env.rpName,
            rpID                : env.rpId,
            userID              : Buffer.from(userId),
            userName            : userName,
            attestationType     : 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification       : 'required',
                residentKey            : 'preferred'
            }
        })

        req.session.registration = {
            challenge : options.challenge,
            userId    : userId
        }

        return { options, userId }
    },

    async verifyRegistration(req, response, deviceData) {
        const { challenge, userId } = req.session.registration || {}

        if (!challenge || !userId) {
            throw Object.assign(new Error('Session registrasi tidak valid'), { status: 400 })
        }

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin   : env.origin,
            expectedRPID     : env.rpId,
            requireUserVerification: true
        })

        if (!verification.verified) {
            throw Object.assign(new Error('Verifikasi fingerprint gagal'), { status: 401 })
        }

        const { credential } = verification.registrationInfo

        const ip   = req.ip
        const data = {
            username  : null,
            bio       : null,
            avatar    : null,
            public_key: Buffer.from(credential.publicKey).toString('base64')
        }

        const device = {
            user_agent  : deviceData?.user_agent || req.headers['user-agent'],
            browser     : deviceData?.browser || null,
            os          : deviceData?.os || null,
            timezone    : deviceData?.timezone || null,
            locale      : deviceData?.locale || null,
            screen      : deviceData?.screen || null,
            network     : deviceData?.network || null,
            permissions : deviceData?.permissions || null,
            media_devices: deviceData?.media_devices || null
        }

        const user = await UserModel.create({ id: userId, data, device, ip })

        await CredentialModel.create({
            userId,
            data: {
                credential_id: Buffer.from(credential.id).toString('base64'),
                public_key   : Buffer.from(credential.publicKey).toString('base64'),
                sign_count   : credential.counter
            },
            ip
        })

        const token   = uuidv4()
        const session = await SessionModel.create({
            userId,
            token,
            device,
            ip
        })

        delete req.session.registration

        req.session.token  = token
        req.session.userId = userId

        return { user, token }
    },

    async getAuthenticationOptions(req) {
        const options = await generateAuthenticationOptions({
            rpID            : env.rpId,
            userVerification: 'required'
        })

        req.session.authentication = { challenge: options.challenge }

        return options
    },

    async verifyAuthentication(req, response, deviceData) {
        const { challenge } = req.session.authentication || {}

        if (!challenge) {
            throw Object.assign(new Error('Session autentikasi tidak valid'), { status: 400 })
        }

        const credentialId = Buffer.from(response.rawId, 'base64').toString('base64')
        const credRecord   = await CredentialModel.findByCredentialId(credentialId)

        if (!credRecord) {
            throw Object.assign(new Error('Credential tidak ditemukan'), { status: 404 })
        }

        const publicKey = Buffer.from(credRecord.data.public_key, 'base64')

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge  : challenge,
            expectedOrigin     : env.origin,
            expectedRPID       : env.rpId,
            credential         : {
                id        : Buffer.from(credRecord.data.credential_id, 'base64'),
                publicKey : publicKey,
                counter   : credRecord.data.sign_count
            },
            requireUserVerification: true
        })

        if (!verification.verified) {
            throw Object.assign(new Error('Verifikasi fingerprint gagal'), { status: 401 })
        }

        await CredentialModel.updateSignCount(
            credRecord.id,
            verification.authenticationInfo.newCounter
        )

        const userId = credRecord.user_id
        const ip     = req.ip
        const user   = await UserModel.findById(userId)

        if (user.ip && user.ip !== ip) {
            await IpLogModel.create({
                userId,
                ipPrevious  : user.ip,
                ipNew       : ip,
                qrRefreshed : true,
                ip
            })
            await UserModel.updateIp(userId, ip)
        }

        const token   = uuidv4()
        const device  = {
            user_agent  : deviceData?.user_agent || req.headers['user-agent'],
            browser     : deviceData?.browser || null,
            os          : deviceData?.os || null,
            timezone    : deviceData?.timezone || null,
            locale      : deviceData?.locale || null,
            screen      : deviceData?.screen || null,
            network     : deviceData?.network || null,
            permissions : deviceData?.permissions || null,
            media_devices: deviceData?.media_devices || null
        }

        await SessionModel.create({ userId, token, device, ip })

        delete req.session.authentication

        req.session.token  = token
        req.session.userId = userId

        return { user, token, ipChanged: user.ip !== ip }
    },

    async logout(req) {
        const token = req.session.token
        if (token) await SessionModel.revoke(token)
        req.session.destroy()
    }
}