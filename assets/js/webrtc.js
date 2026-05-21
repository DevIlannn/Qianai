import { Store } from './store.js'
import { IDB }   from './store.js'

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
]

let _pc       = null
let _channel  = null
let _socket   = null
let _handlers = {}

const emit = (event, data) => {
    if (_handlers[event]) _handlers[event](data)
}

export const WebRTCClient = {

    init(socket) {
        _socket = socket
        _socket.on('webrtc:offer',  ({ offer })     => WebRTCClient.handleOffer(offer))
        _socket.on('webrtc:answer', ({ answer })    => WebRTCClient.handleAnswer(answer))
        _socket.on('webrtc:ice',    ({ candidate }) => WebRTCClient.handleIce(candidate))
    },

    on(event, fn) {
        _handlers[event] = fn
    },

    async createOffer() {
        _pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        _channel = _pc.createDataChannel('qianai', { ordered: true })

        WebRTCClient._bindChannel(_channel)
        WebRTCClient._bindPc()

        const offer = await _pc.createOffer()
        await _pc.setLocalDescription(offer)

        _socket.emit('webrtc:offer', { offer })
    },

    async handleOffer(offer) {
        _pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

        WebRTCClient._bindPc()

        _pc.ondatachannel = (e) => {
            _channel = e.channel
            WebRTCClient._bindChannel(_channel)
        }

        await _pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await _pc.createAnswer()
        await _pc.setLocalDescription(answer)

        _socket.emit('webrtc:answer', { answer })
    },

    async handleAnswer(answer) {
        if (!_pc) return
        await _pc.setRemoteDescription(new RTCSessionDescription(answer))
    },

    async handleIce(candidate) {
        if (!_pc) return
        try { await _pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
    },

    send(data) {
        if (_channel?.readyState === 'open') {
            _channel.send(JSON.stringify(data))
            return true
        }
        return false
    },

    isConnected() {
        return _channel?.readyState === 'open'
    },

    close() {
        _channel?.close()
        _pc?.close()
        _channel = null
        _pc      = null
        emit('disconnected', null)
    },

    _bindChannel(channel) {
        channel.onopen = () => {
            emit('connected', null)
        }

        channel.onclose = () => {
            emit('disconnected', null)
        }

        channel.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data)
                emit('message', data)
            } catch {}
        }
    },

    _bindPc() {
        _pc.onicecandidate = (e) => {
            if (e.candidate) {
                _socket.emit('webrtc:ice', { candidate: e.candidate })
            }
        }

        _pc.onconnectionstatechange = () => {
            if (_pc.connectionState === 'disconnected' || _pc.connectionState === 'failed') {
                emit('disconnected', null)
            }
        }
    }
}