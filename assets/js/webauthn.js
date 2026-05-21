import { AuthAPI }      from './api.js'
import { Store }        from './store.js'

const b64ToBuffer = (b64) => {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, c => c.charCodeAt(0))
}

const bufferToB64 = (buf) => {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

const collectDeviceData = async () => {
    const device = {
        user_agent : navigator.userAgent,
        browser    : navigator.appName,
        os         : navigator.platform,
        timezone   : Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale     : navigator.language,
        screen     : {
            width  : screen.width,
            height : screen.height,
            dpr    : window.devicePixelRatio
        },
        network    : {
            type     : navigator.connection?.effectiveType || null,
            downlink : navigator.connection?.downlink || null
        },
        permissions: {},
        media_devices: { audioinput: 0, audiooutput: 0, videoinput: 0 }
    }

    try {
        const [cam, mic, notif] = await Promise.all([
            navigator.permissions.query({ name: 'camera' }),
            navigator.permissions.query({ name: 'microphone' }),
            navigator.permissions.query({ name: 'notifications' })
        ])
        device.permissions = {
            camera       : cam.state,
            microphone   : mic.state,
            notifications: notif.state
        }
    } catch {}

    try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        devices.forEach(d => {
            if (d.kind === 'audioinput')  device.media_devices.audioinput++
            if (d.kind === 'audiooutput') device.media_devices.audiooutput++
            if (d.kind === 'videoinput')  device.media_devices.videoinput++
        })
    } catch {}

    return device
}

export const WebAuthnClient = {

    isSupported() {
        return !!(window.PublicKeyCredential && navigator.credentials?.create)
    },

    async register(onProgress) {
        onProgress?.('Menyiapkan registrasi...')

        const { options } = await AuthAPI.getRegisterOptions()

        options.challenge              = b64ToBuffer(options.challenge)
        options.user.id                = b64ToBuffer(options.user.id)
        options.excludeCredentials     = (options.excludeCredentials || []).map(c => ({
            ...c, id: b64ToBuffer(c.id)
        }))

        onProgress?.('Menunggu sidik jari...')

        const credential = await navigator.credentials.create({ publicKey: options })

        if (!credential) throw new Error('Registrasi dibatalkan')

        const response = {
            id        : credential.id,
            rawId     : bufferToB64(credential.rawId),
            type      : credential.type,
            response  : {
                clientDataJSON    : bufferToB64(credential.response.clientDataJSON),
                attestationObject : bufferToB64(credential.response.attestationObject)
            }
        }

        onProgress?.('Memverifikasi...')

        const device       = await collectDeviceData()
        const { user, token } = await AuthAPI.verifyRegister({ response, device })

        Store.setToken(token)
        Store.setUser(user)

        return { user, token }
    },

    async login(onProgress) {
        onProgress?.('Menyiapkan autentikasi...')

        const { options } = await AuthAPI.getLoginOptions()

        options.challenge          = b64ToBuffer(options.challenge)
        options.allowCredentials   = (options.allowCredentials || []).map(c => ({
            ...c, id: b64ToBuffer(c.id)
        }))

        onProgress?.('Menunggu sidik jari...')

        const credential = await navigator.credentials.get({ publicKey: options })

        if (!credential) throw new Error('Login dibatalkan')

        const response = {
            id        : credential.id,
            rawId     : bufferToB64(credential.rawId),
            type      : credential.type,
            response  : {
                clientDataJSON     : bufferToB64(credential.response.clientDataJSON),
                authenticatorData  : bufferToB64(credential.response.authenticatorData),
                signature          : bufferToB64(credential.response.signature),
                userHandle         : credential.response.userHandle
                    ? bufferToB64(credential.response.userHandle) : null
            }
        }

        onProgress?.('Memverifikasi...')

        const device                    = await collectDeviceData()
        const { user, token, ipChanged } = await AuthAPI.verifyLogin({ response, device })

        Store.setToken(token)
        Store.setUser(user)

        return { user, token, ipChanged }
    },

    async logout() {
        try { await AuthAPI.logout() } catch {}
        Store.clear()
    }
}