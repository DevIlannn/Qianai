import { Store }   from './store.js'
import { UserAPI } from './api.js'

const $ = (id) => document.getElementById(id)

const toast = (msg, type = 'info') => {
    const el = document.createElement('div')
    el.className = `toast ${type}`
    el.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'circle-xmark' : 'circle-check'}"></i><span>${msg}</span>`
    $('toast-container')?.appendChild(el)
    setTimeout(() => el.remove(), 3500)
}

const toBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader()
    r.onload  = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
})

export const SettingsUI = {

    async init() {
        const user = Store.getUser()
        if (!user) return

        SettingsUI.render(user)
        SettingsUI._bindForm()
        SettingsUI._bindAvatar()
        SettingsUI._bindLogout()
    },

    render(user) {
        const data = user.data || {}

        const usernameEl = $('input-username')
        const bioEl      = $('input-bio')
        const idEl       = $('display-id')
        const avatarEl   = $('display-avatar')
        const nameEl     = $('display-name')

        if (usernameEl) usernameEl.value = data.username || ''
        if (bioEl)      bioEl.value      = data.bio || ''
        if (idEl)       idEl.textContent = user.id || ''
        if (nameEl)     nameEl.textContent = data.username || user.id

        if (avatarEl) {
            if (data.avatar) {
                avatarEl.innerHTML = `<img src="${data.avatar}" alt="avatar">`
            } else {
                avatarEl.textContent = (data.username || user.id)?.[0]?.toUpperCase()
            }
        }
    },

    _bindForm() {
        const form = $('form-settings')
        if (!form) return

        form.addEventListener('submit', async (e) => {
            e.preventDefault()

            const username = $('input-username')?.value.trim()
            const bio      = $('input-bio')?.value.trim()
            const btn      = $('btn-save')

            if (!username) return toast('Username tidak boleh kosong', 'error')

            btn.disabled = true
            btn.innerHTML = '<span class="spinner"></span> Menyimpan...'

            try {
                const { user } = await UserAPI.update({ username, bio })
                Store.setUser(user)
                SettingsUI.render(user)
                toast('Profil berhasil disimpan', 'success')
            } catch (err) {
                toast(err.message || 'Gagal menyimpan', 'error')
            } finally {
                btn.disabled = false
                btn.innerHTML = 'Simpan Perubahan'
            }
        })
    },

    _bindAvatar() {
        const btn   = $('btn-change-avatar')
        const input = $('input-avatar')
        if (!btn || !input) return

        btn.addEventListener('click', () => input.click())

        input.addEventListener('change', async () => {
            const file = input.files[0]
            if (!file) return

            if (file.size > 2 * 1024 * 1024) {
                return toast('Ukuran foto maksimal 2MB', 'error')
            }

            if (!file.type.startsWith('image/')) {
                return toast('File harus berupa gambar', 'error')
            }

            try {
                const b64     = await toBase64(file)
                const { user } = await UserAPI.update({ avatar: b64 })
                Store.setUser(user)
                SettingsUI.render(user)
                toast('Foto profil diperbarui', 'success')
            } catch (err) {
                toast(err.message || 'Gagal mengupload foto', 'error')
            } finally {
                input.value = ''
            }
        })
    },

    _bindLogout() {
        const btn = $('btn-logout')
        if (!btn) return

        btn.addEventListener('click', async () => {
            try {
                await UserAPI.me()
            } catch {}
            Store.clear()
            window.location.href = '/auth.html'
        })
    }
}