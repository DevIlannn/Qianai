const DB_NAME    = 'qianai_db'
const DB_VERSION = 1
const STORES     = {
    messages : 'messages',
    media    : 'media',
    meta     : 'meta'
}

let _db = null

const openDb = () => new Promise((resolve, reject) => {
    if (_db) return resolve(_db)

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
        const db = e.target.result

        if (!db.objectStoreNames.contains(STORES.messages)) {
            const ms = db.createObjectStore(STORES.messages, { keyPath: 'id' })
            ms.createIndex('pair_id',    'pair_id',    { unique: false })
            ms.createIndex('created_at', 'created_at', { unique: false })
            ms.createIndex('status',     'status',     { unique: false })
        }

        if (!db.objectStoreNames.contains(STORES.media)) {
            const med = db.createObjectStore(STORES.media, { keyPath: 'id' })
            med.createIndex('message_id', 'message_id', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORES.meta)) {
            db.createObjectStore(STORES.meta, { keyPath: 'key' })
        }
    }

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror   = ()  => reject(req.error)
})

const tx = async (storeName, mode, fn) => {
    const db    = await openDb()
    const store = db.transaction(storeName, mode).objectStore(storeName)
    return fn(store)
}

const idbPut    = (store, data)    => new Promise((res, rej) => { const r = store.put(data);    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const idbGet    = (store, key)     => new Promise((res, rej) => { const r = store.get(key);     r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const idbDelete = (store, key)     => new Promise((res, rej) => { const r = store.delete(key);  r.onsuccess = () => res();         r.onerror = () => rej(r.error) })
const idbGetAll = (store)          => new Promise((res, rej) => { const r = store.getAll();     r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const idbIndex  = (store, idx, val) => new Promise((res, rej) => { const r = store.index(idx).getAll(val); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })


export const IDB = {
    async saveMessage(msg) {
        return tx(STORES.messages, 'readwrite', s => idbPut(s, msg))
    },

    async getMessage(id) {
        return tx(STORES.messages, 'readonly', s => idbGet(s, id))
    },

    async getMessagesByPair(pairId) {
        const all = await tx(STORES.messages, 'readonly', s => idbIndex(s, 'pair_id', pairId))
        return all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    },

    async getPendingMessages() {
        const all = await tx(STORES.messages, 'readonly', s => idbIndex(s, 'status', 'pending'))
        return all
    },

    async updateMessageStatus(id, status) {
        const msg = await IDB.getMessage(id)
        if (!msg) return
        return tx(STORES.messages, 'readwrite', s => idbPut(s, { ...msg, status }))
    },

    async deleteMessage(id) {
        return tx(STORES.messages, 'readwrite', s => idbDelete(s, id))
    },

    async saveMedia(media) {
        return tx(STORES.media, 'readwrite', s => idbPut(s, media))
    },

    async getMediaByMessage(messageId) {
        return tx(STORES.media, 'readonly', s => idbIndex(s, 'message_id', messageId))
    },

    async setMeta(key, value) {
        return tx(STORES.meta, 'readwrite', s => idbPut(s, { key, value }))
    },

    async getMeta(key) {
        const row = await tx(STORES.meta, 'readonly', s => idbGet(s, key))
        return row?.value ?? null
    },

    async clearAll() {
        const db = await openDb()
        await Promise.all(Object.values(STORES).map(name =>
            new Promise((res, rej) => {
                const r = db.transaction(name, 'readwrite').objectStore(name).clear()
                r.onsuccess = res
                r.onerror   = rej
            })
        ))
    }
}


const LS = {
    set(key, value) {
        try { localStorage.setItem(`qianai:${key}`, JSON.stringify(value)) } catch {}
    },

    get(key) {
        try {
            const v = localStorage.getItem(`qianai:${key}`)
            return v ? JSON.parse(v) : null
        } catch { return null }
    },

    remove(key) {
        try { localStorage.removeItem(`qianai:${key}`) } catch {}
    },

    clear() {
        try {
            Object.keys(localStorage)
                .filter(k => k.startsWith('qianai:'))
                .forEach(k => localStorage.removeItem(k))
        } catch {}
    }
}

export const Store = {
    getToken()              { return LS.get('token') },
    setToken(v)             { LS.set('token', v) },
    removeToken()           { LS.remove('token') },

    getUser()               { return LS.get('user') },
    setUser(v)              { LS.set('user', v) },
    removeUser()            { LS.remove('user') },

    getPair()               { return LS.get('pair') },
    setPair(v)              { LS.set('pair', v) },
    removePair()            { LS.remove('pair') },

    getPartner()            { return LS.get('partner') },
    setPartner(v)           { LS.set('partner', v) },
    removePartner()         { LS.remove('partner') },

    getLastSync()           { return LS.get('last_sync') },
    setLastSync(v)          { LS.set('last_sync', v) },

    isLoggedIn()            { return !!LS.get('token') },

    clear()                 { LS.clear() }
}