import { Store, IDB }    from './store.js'
import { MessageAPI, SyncAPI } from './api.js'
import { WebRTCClient }  from './webrtc.js'

const $ = (id) => document.getElementById(id)

let _pairId     = null
let _userId     = null
let _partner    = null
let _socket     = null
let _isOnline   = navigator.onLine
let _typing     = false
let _typingTimer = null

const MSG_TYPE = { text: 'text', image: 'image', video: 'video', file: 'file' }

export const ChatUI = {

    init(socket) {
        _socket  = socket
        _userId  = Store.getUser()?.id
        _pairId  = Store.getPair()?.id
        _partner = Store.getPartner()

        if (!_pairId || !_userId) return

        WebRTCClient.init(socket)
        ChatUI._bindWebRTC()
        ChatUI._bindSocket()
        ChatUI._bindInput()
        ChatUI._bindOnline()

        ChatUI.loadMessages()
        ChatUI.renderPartnerInfo()

        if (_isOnline) {
            WebRTCClient.createOffer()
            ChatUI.syncPending()
        }
    },

    renderPartnerInfo() {
        const nameEl   = $('partner-name')
        const avatarEl = $('partner-avatar')
        if (!_partner) return

        if (nameEl)   nameEl.textContent = _partner.data?.username || _partner.id
        if (avatarEl) {
            if (_partner.data?.avatar) {
                avatarEl.innerHTML = `<img src="${_partner.data.avatar}" alt="avatar">`
            } else {
                avatarEl.textContent = (_partner.data?.username || _partner.id)?.[0]?.toUpperCase()
            }
        }
    },

    async loadMessages() {
        const local = await IDB.getMessagesByPair(_pairId)

        if (local.length) {
            local.forEach(m => ChatUI.appendBubble(m, false))
            ChatUI.scrollBottom()
        }

        if (_isOnline) {
            try {
                const lastSync = Store.getLastSync()
                const { messages } = await SyncAPI.pull(_pairId, lastSync)

                for (const m of messages) {
                    const exists = await IDB.getMessage(m.id)
                    if (!exists) {
                        await IDB.saveMessage(m)
                        ChatUI.appendBubble(m, false)
                    }
                }

                if (messages.length) {
                    Store.setLastSync(new Date().toISOString())
                    ChatUI.scrollBottom()
                }
            } catch {}
        }
    },

    appendBubble(msg, animate = true) {
        const list = $('msg-list')
        if (!list) return

        const isMine = msg.sender_id === _userId
        const isDeleted = msg.data?.is_deleted || msg.is_deleted

        const wrap = document.createElement('div')
        wrap.className   = `bubble-wrap ${isMine ? 'mine' : 'theirs'}`
        wrap.dataset.id  = msg.id

        if (isDeleted) {
            wrap.innerHTML = `<div class="bubble bubble-deleted"><i class="fa-solid fa-ban"></i> Pesan dihapus</div>`
        } else {
            const type    = msg.data?.type || msg.type || 'text'
            const content = msg.data?.content || msg.content || ''
            const time    = new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            const status  = isMine ? ChatUI._statusIcon(msg.data?.status || msg.status) : ''

            let body = ''
            if (type === 'text')  body = `<p class="bubble-text">${ChatUI._escape(content)}</p>`
            if (type === 'image') body = `<img class="bubble-media" src="${content}" loading="lazy">`
            if (type === 'video') body = `<video class="bubble-media" src="${content}" controls></video>`
            if (type === 'file')  body = `<a class="bubble-file" href="${content}" download><i class="fa-solid fa-file"></i> ${ChatUI._escape(msg.data?.filename || 'File')}</a>`

            wrap.innerHTML = `
                <div class="bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}">
                    ${body}
                    <div class="bubble-meta">
                        <span class="bubble-time">${time}</span>
                        ${status}
                    </div>
                </div>
            `

            if (isMine) {
                wrap.querySelector('.bubble').addEventListener('contextmenu', (e) => {
                    e.preventDefault()
                    ChatUI.showMsgMenu(msg.id, e.clientX, e.clientY)
                })
            }
        }

        if (animate) wrap.style.animation = 'fadeIn 0.2s ease'
        list.appendChild(wrap)
    },

    _statusIcon(status) {
        if (status === 'read')      return '<i class="fa-solid fa-check-double" style="color:var(--accent)"></i>'
        if (status === 'delivered') return '<i class="fa-solid fa-check-double" style="color:var(--text-muted)"></i>'
        return '<i class="fa-solid fa-check" style="color:var(--text-muted)"></i>'
    },

    _escape(str) {
        const d = document.createElement('div')
        d.textContent = str
        return d.innerHTML
    },

    scrollBottom(smooth = true) {
        const list = $('msg-list')
        if (!list) return
        list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'instant' })
    },

    async sendMessage(type, content, extra = {}) {
        if (!content && type === 'text') return

        const tempId  = `temp_${Date.now()}`
        const tempMsg = {
            id        : tempId,
            pair_id   : _pairId,
            sender_id : _userId,
            data      : { type, content, status: 'sent', is_deleted: false, ...extra },
            created_at: new Date().toISOString(),
            status    : 'pending'
        }

        await IDB.saveMessage(tempMsg)
        ChatUI.appendBubble(tempMsg)
        ChatUI.scrollBottom()

        const sent = WebRTCClient.send({ event: 'message', msg: tempMsg })

        if (_isOnline) {
            try {
                const saved = await MessageAPI.send({
                    pairId : _pairId,
                    type,
                    content,
                    ...extra
                })

                await IDB.deleteMessage(tempId)
                await IDB.saveMessage({ ...saved, status: 'sent' })

                const el = document.querySelector(`[data-id="${tempId}"]`)
                if (el) el.dataset.id = saved.id

                if (sent) {
                    _socket.emit('message:send', { messageId: saved.id })
                }

            } catch {
                await IDB.updateMessageStatus(tempId, 'pending')
            }
        }
    },

    async sendFile(file) {
        const reader  = new FileReader()
        reader.onload = async (e) => {
            const b64      = e.target.result
            const isImage  = file.type.startsWith('image/')
            const isVideo  = file.type.startsWith('video/')
            const type     = isImage ? 'image' : isVideo ? 'video' : 'file'

            if (_isOnline) {
                try {
                    const saved = await MessageAPI.send({ pairId: _pairId, type, content: '' })
                    await MessageAPI.addMedia(saved.id, {
                        type,
                        filename  : file.name,
                        mimetype  : file.type,
                        size_bytes: file.size,
                        blob      : b64
                    })
                    await IDB.saveMessage({ ...saved, status: 'sent' })
                    ChatUI.appendBubble({ ...saved, data: { type, content: b64, status: 'sent' } })
                    ChatUI.scrollBottom()
                } catch {
                    ChatUI.toast('Gagal mengirim file', 'error')
                }
            } else {
                await ChatUI.sendMessage(type, b64, { filename: file.name })
            }
        }
        reader.readAsDataURL(file)
    },

    showMsgMenu(msgId, x, y) {
        document.querySelectorAll('.msg-menu').forEach(m => m.remove())

        const menu = document.createElement('div')
        menu.className = 'msg-menu'
        menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:var(--z-modal);background:var(--bg-3);border:1px solid var(--border-2);border-radius:var(--radius-md);padding:6px;min-width:140px;box-shadow:var(--shadow-lg);animation:scaleIn 0.15s ease`
        menu.innerHTML = `
            <button class="btn btn-ghost btn-sm btn-full" style="justify-content:flex-start;gap:10px" data-action="delete">
                <i class="fa-solid fa-trash" style="color:var(--danger)"></i> Hapus pesan
            </button>
        `

        menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
            await ChatUI.deleteMessage(msgId)
            menu.remove()
        })

        document.body.appendChild(menu)
        setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 50)
    },

    async deleteMessage(msgId) {
        if (msgId.startsWith('temp_')) {
            await IDB.deleteMessage(msgId)
        } else if (_isOnline) {
            await MessageAPI.delete(msgId)
        }

        const el = document.querySelector(`[data-id="${msgId}"]`)
        if (el) el.querySelector('.bubble').innerHTML = `<i class="fa-solid fa-ban"></i> Pesan dihapus`
        el?.querySelector('.bubble')?.classList.add('bubble-deleted')
    },

    async syncPending() {
        const pending = await IDB.getPendingMessages()
        if (!pending.length) return

        try {
            await SyncAPI.push(_pairId, pending)
            for (const m of pending) {
                await IDB.updateMessageStatus(m.id, 'sent')
            }
            Store.setLastSync(new Date().toISOString())
        } catch {}
    },

    setPartnerStatus(online) {
        const el = $('partner-status')
        if (!el) return
        el.textContent = online ? 'Online' : 'Offline'
        el.className   = `partner-status ${online ? 'online' : 'offline'}`
    },

    setTyping(active) {
        const el = $('typing-indicator')
        if (!el) return
        el.classList.toggle('hidden', !active)
    },

    toast(msg, type = 'info') {
        const container = $('toast-container')
        if (!container) return
        const el = document.createElement('div')
        el.className = `toast ${type}`
        el.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'circle-xmark' : 'circle-info'}"></i><span>${msg}</span>`
        container.appendChild(el)
        setTimeout(() => el.remove(), 3500)
    },

    _bindWebRTC() {
        WebRTCClient.on('connected',    () => ChatUI.setPartnerStatus(true))
        WebRTCClient.on('disconnected', () => ChatUI.setPartnerStatus(false))

        WebRTCClient.on('message', async (data) => {
            if (data.event !== 'message') return
            const msg = data.msg
            await IDB.saveMessage({ ...msg, status: 'delivered' })
            ChatUI.appendBubble(msg)
            ChatUI.scrollBottom()
            if (_isOnline) _socket.emit('message:read', { messageId: msg.id })
        })
    },

    _bindSocket() {
        _socket.on('partner:online',  () => ChatUI.setPartnerStatus(true))
        _socket.on('partner:offline', () => ChatUI.setPartnerStatus(false))

        _socket.on('message:new', async ({ messageId }) => {
            if (_isOnline) {
                try {
                    const { messages } = await SyncAPI.pull(_pairId, null, 1)
                    const msg = messages.find(m => m.id === messageId)
                    if (msg) {
                        await IDB.saveMessage(msg)
                        ChatUI.appendBubble(msg)
                        ChatUI.scrollBottom()
                        _socket.emit('message:read', { messageId })
                    }
                } catch {}
            }
        })

        _socket.on('message:read', ({ messageId }) => {
            const el = document.querySelector(`[data-id="${messageId}"] .bubble-meta i`)
            if (el) {
                el.className = 'fa-solid fa-check-double'
                el.style.color = 'var(--accent)'
            }
        })

        _socket.on('typing:start', () => ChatUI.setTyping(true))
        _socket.on('typing:stop',  () => ChatUI.setTyping(false))

        _socket.on('qr:refreshed', ({ qr }) => {
            ChatUI.toast('QR diperbarui karena IP berubah', 'info')
        })
    },

    _bindInput() {
        const input = $('msg-input')
        const send  = $('btn-send')
        const file  = $('btn-file')
        const fin   = $('file-input')

        if (!input) return

        input.addEventListener('input', () => {
            if (!_typing) {
                _typing = true
                _socket?.emit('typing:start')
            }
            clearTimeout(_typingTimer)
            _typingTimer = setTimeout(() => {
                _typing = false
                _socket?.emit('typing:stop')
            }, 1500)

            send.disabled = !input.value.trim()
        })

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ChatUI._submitText()
            }
        })

        send?.addEventListener('click', ChatUI._submitText)

        file?.addEventListener('click', () => fin?.click())
        fin?.addEventListener('change', () => {
            const f = fin.files[0]
            if (f) ChatUI.sendFile(f)
            fin.value = ''
        })
    },

    _submitText() {
        const input   = $('msg-input')
        const content = input?.value.trim()
        if (!content) return
        input.value   = ''
        $('btn-send').disabled = true
        ChatUI.sendMessage('text', content)
    },

    _bindOnline() {
        window.addEventListener('online', () => {
            _isOnline = true
            ChatUI.syncPending()
            ChatUI.toast('Kembali online', 'success')
        })

        window.addEventListener('offline', () => {
            _isOnline = false
            ChatUI.toast('Mode offline aktif', 'info')
        })
    }
}